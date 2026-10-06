// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LightdiveConfig} from "./LightdiveConfig.sol";
import {LightdiveNFT} from "./LightdiveNFT.sol";
import {RandomnessBeacon} from "./RandomnessBeacon.sol";
import {CoreLightPool} from "./CoreLightPool.sol";

/// @notice Teams, dives, settlement and claims for Lightdive.
///
/// A team is one Beacon Spire, at most one Resonance Prism and 1..level Seekers, held by this
/// contract while equipped. Each spire dives at most once per UTC day. A dive records its base
/// points B = total luminance * depth coefficient. After the hour's randomness is revealed, the
/// dive's beam draws an outcome and a multiplier m (average exactly 1.00), so the Lightdust brought
/// back is L = B * m. After the day ends, the day's budget E is fixed by the pool, and the dive is
/// worth E * L / sum(B of that day). Anyone can settle any dive; the reward is credited to the
/// player who dove. Claims pay the credit minus the claim fee, which stays in the pool.
///
/// Every dive spends one voyage of the spire, the prism and each seeker on board; NFTs with no
/// voyages left are burned (homecoming) right away.
/// @dev Candidate, unaudited.
contract Expedition is Ownable2Step, Pausable, ReentrancyGuard {
    uint8 internal constant SPIRE = 0;
    uint8 internal constant PRISM = 1;
    uint8 internal constant SEEKER = 2;
    uint8 internal constant FOCUSED = 1; // beam used when the prism mount is empty

    struct Team {
        address owner;
        uint256 prism; // 0 = empty mount
        uint256[] seekers;
    }

    struct Dive {
        address owner;
        uint32 day;
        uint64 hour;
        uint8 beam;
        bool settled;
        uint256 points; // B, in luminance * coefBp
        bytes32 entropy;
    }

    LightdiveNFT public immutable nft;
    LightdiveConfig public immutable config;
    RandomnessBeacon public immutable beacon;
    CoreLightPool public immutable pool;

    mapping(uint256 => Team) internal _teams; // by spire id
    mapping(uint256 => uint32) public lastDiveDayPlusOne; // by spire id; survives unequip
    Dive[] internal _dives;
    mapping(uint32 => uint256) public dayPoints;
    mapping(uint32 => uint32) public dayUnsettled;
    mapping(address => uint256) public credit;
    mapping(address => uint64) public lastClaimAt;

    event Equipped(uint256 indexed spire, address indexed owner, uint256 prism, uint256[] seekers);
    event Unequipped(uint256 indexed spire, address indexed owner);
    event Dived(
        uint256 indexed diveId, address indexed owner, uint256 indexed spire, uint8 depth, uint32 coordinate,
        uint256 luminance, uint256 points, uint8 beam, uint32 day, uint64 hour
    );
    event Settled(uint256 indexed diveId, address indexed owner, uint8 tier, uint16 multX100, uint256 lightdust, uint256 reward, bool fallbackUsed);
    event Claimed(address indexed owner, uint256 gross, uint256 fee);

    error NotOwner();
    error AlreadyEquipped();
    error NotEquipped();
    error WrongKind();
    error BadTeam();
    error AlreadyDove();
    error TooDim();
    error BadDepth();
    error NoRandomnessScheduled();
    error DayNotOver();
    error NotReady();
    error AlreadySettled();
    error NothingToClaim();

    constructor(address owner_, LightdiveNFT nft_, LightdiveConfig config_, RandomnessBeacon beacon_, CoreLightPool pool_)
        Ownable(owner_)
    {
        nft = nft_;
        config = config_;
        beacon = beacon_;
        pool = pool_;
    }

    // ---------------------------------------------------------------- views

    function today() public view returns (uint32) {
        return uint32(block.timestamp / 1 days);
    }

    function team(uint256 spire) external view returns (Team memory) {
        return _teams[spire];
    }

    function diveInfo(uint256 id) external view returns (Dive memory) {
        return _dives[id];
    }

    function diveCount() external view returns (uint256) {
        return _dives.length;
    }

    /// @notice Total luminance of an equipped team. Spire and prism luminance count in proportion
    /// to the seats filled, so an empty seat wastes part of them.
    function teamLuminance(uint256 spire) public view returns (uint256) {
        Team storage t = _teams[spire];
        if (t.owner == address(0)) revert NotEquipped();
        LightdiveNFT.Attributes memory s = nft.attributes(spire);
        uint256 fixedPart = s.luminance;
        if (t.prism != 0) fixedPart += nft.attributes(t.prism).luminance;
        uint256 total = fixedPart * t.seekers.length / s.trait;
        for (uint256 i; i < t.seekers.length; ++i) total += nft.attributes(t.seekers[i]).luminance;
        return total;
    }

    // ---------------------------------------------------------------- teams

    /// @notice Puts a team together. The caller must have approved this contract for the NFTs.
    function equip(uint256 spire, uint256 prism, uint256[] calldata seekers) external whenNotPaused nonReentrant {
        if (_teams[spire].owner != address(0)) revert AlreadyEquipped();
        LightdiveNFT.Attributes memory s = nft.attributes(spire);
        if (s.kind != SPIRE) revert WrongKind();
        if (seekers.length == 0 || seekers.length > s.trait) revert BadTeam();
        Team storage t = _teams[spire];
        t.owner = msg.sender;
        _take(spire);
        if (prism != 0) {
            if (nft.attributes(prism).kind != PRISM) revert WrongKind();
            t.prism = prism;
            _take(prism);
        }
        for (uint256 i; i < seekers.length; ++i) {
            if (nft.attributes(seekers[i]).kind != SEEKER) revert WrongKind();
            t.seekers.push(seekers[i]);
            _take(seekers[i]);
        }
        emit Equipped(spire, msg.sender, prism, seekers);
    }

    /// @notice Returns every NFT of the team to its owner. Always available, even when paused.
    function unequip(uint256 spire) external nonReentrant {
        Team storage t = _teams[spire];
        if (t.owner != msg.sender) revert NotOwner();
        _dissolve(spire);
        emit Unequipped(spire, msg.sender);
    }

    // ---------------------------------------------------------------- diving

    function dive(uint256 spire, uint8 depth, uint32 coordinate) external whenNotPaused nonReentrant returns (uint256 id) {
        Team storage t = _teams[spire];
        if (t.owner != msg.sender) revert NotOwner();
        if (t.seekers.length == 0) revert BadTeam(); // every seeker came home: the spire cannot dive alone
        uint32 day = today();
        if (lastDiveDayPlusOne[spire] == day + 1) revert AlreadyDove();
        if (depth >= config.DEPTHS()) revert BadDepth();
        uint64 hour = beacon.currentHour();
        if (!beacon.hasCommitment(hour)) revert NoRandomnessScheduled();

        uint256 lum = teamLuminance(spire);
        if (lum < config.depthMinLuminance(depth)) revert TooDim();
        uint256 points = lum * config.depthCoefBp(depth);
        uint8 beam = t.prism == 0 ? FOCUSED : nft.attributes(t.prism).trait;

        id = _dives.length;
        _dives.push(Dive({
            owner: msg.sender,
            day: day,
            hour: hour,
            beam: beam,
            settled: false,
            points: points,
            entropy: keccak256(abi.encode(blockhash(block.number - 1), spire, id))
        }));
        lastDiveDayPlusOne[spire] = day + 1;
        dayPoints[day] += points;
        dayUnsettled[day] += 1;
        if (lastClaimAt[msg.sender] == 0) lastClaimAt[msg.sender] = uint64(block.timestamp);
        emit Dived(id, msg.sender, spire, depth, coordinate, lum, points, beam, day, hour);

        _spendVoyages(spire);
    }

    /// @notice Settles dives whose hour randomness is ready and whose day is over.
    function settle(uint256[] calldata ids) external nonReentrant {
        for (uint256 i; i < ids.length; ++i) _settle(ids[i]);
    }

    function claim() external nonReentrant {
        uint256 gross = credit[msg.sender];
        if (gross == 0) revert NothingToClaim();
        uint256 fee = gross * config.claimFeeBp(block.timestamp - lastClaimAt[msg.sender]) / config.BP();
        credit[msg.sender] = 0;
        lastClaimAt[msg.sender] = uint64(block.timestamp);
        pool.pay(msg.sender, gross, fee);
        emit Claimed(msg.sender, gross, fee);
    }

    // ---------------------------------------------------------------- owner

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------- internal

    function _take(uint256 id) internal {
        if (nft.ownerOf(id) != msg.sender) revert NotOwner();
        nft.transferFrom(msg.sender, address(this), id);
    }

    function _dissolve(uint256 spire) internal {
        Team storage t = _teams[spire];
        address owner = t.owner;
        nft.transferFrom(address(this), owner, spire);
        if (t.prism != 0) nft.transferFrom(address(this), owner, t.prism);
        for (uint256 i; i < t.seekers.length; ++i) nft.transferFrom(address(this), owner, t.seekers[i]);
        delete _teams[spire];
    }

    function _spendVoyages(uint256 spire) internal {
        Team storage t = _teams[spire];
        for (uint256 i = t.seekers.length; i > 0; --i) {
            uint256 seeker = t.seekers[i - 1];
            if (nft.useVoyage(seeker) == 0) {
                nft.burn(seeker);
                t.seekers[i - 1] = t.seekers[t.seekers.length - 1];
                t.seekers.pop();
            }
        }
        if (t.prism != 0 && nft.useVoyage(t.prism) == 0) {
            nft.burn(t.prism);
            t.prism = 0;
        }
        if (nft.useVoyage(spire) == 0) {
            nft.burn(spire);
            address owner = t.owner;
            if (t.prism != 0) nft.transferFrom(address(this), owner, t.prism);
            for (uint256 i; i < t.seekers.length; ++i) nft.transferFrom(address(this), owner, t.seekers[i]);
            delete _teams[spire];
            emit Unequipped(spire, owner);
        }
    }

    function _settle(uint256 id) internal {
        Dive storage d = _dives[id];
        if (d.settled) revert AlreadySettled();
        if (d.day >= today()) revert DayNotOver();
        (bool ready, bool fallbackUsed, uint256 r) = beacon.randomFor(d.hour, d.entropy);
        if (!ready) revert NotReady();

        if (!pool.dayClosed(d.day)) pool.closeDay(d.day, dayPoints[d.day]);

        uint8 tier = 1;
        uint16 mult = 100;
        if (!fallbackUsed) (tier, mult) = config.drawMultiplier(d.beam, r);
        uint256 lightdust = d.points * mult / 100;
        uint256 reward = pool.dayBudget(d.day) * lightdust / dayPoints[d.day];

        d.settled = true;
        if (reward > 0) reward = pool.assign(d.day, reward);
        credit[d.owner] += reward;
        if (--dayUnsettled[d.day] == 0) pool.releaseDay(d.day);
        emit Settled(id, d.owner, tier, mult, lightdust, reward, fallbackUsed);
    }
}
