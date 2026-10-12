// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LightdiveConfig3} from "./LightdiveConfig3.sol";
import {LightdiveNFT3} from "./LightdiveNFT3.sol";
import {IRoundRandomness} from "./RoundRandomness.sol";
import {CoreLightPool3} from "./CoreLightPool3.sol";

/// @notice Teams, dives, reveals and claims for Lightdive v3.
///
/// Team: a spire, at most one prism and 1..berths seekers. The cards stay in the owner's wallet, locked while on the
/// team. A wallet may have 5 teams; a team cannot change while it is out on a dive.
///
/// Dive: uses one of the wallet's 3 daily Dive Passes (and one of the team's 3 dives that day). The dive is tied to
/// the drand round published `voyageSeconds` after departure. Until `decisionCloseSeconds` before that round, the
/// owner may pick a decision (steady, bold, detour). Once drand publishes the round, anyone can reveal the dive with
/// the round's signature: the outcome, multiplier and wear are drawn from it and the reward is credited at once. A
/// team must be revealed (collected) before it can dive again.
///
/// Rewards: today's rate (RVYN per point of Lightdust) is fixed by the first dive of the UTC day as
/// min(cap, available pool x 1% / yesterday's points). Each dive reserves its x1.00 reward against a daily ceiling of
/// 1.5% of the pool, so a day can never promise more than that. Reward = points x multiplier x rate, minus the
/// departure cost (95% of which stays in the pool, 5% is burned); an empty-handed dive pays no departure cost.
///
/// Wear: every card on the team spends 1-3 voyages. At zero a card docks for 7 days (renewable once, see the minter)
/// and leaves the team; a renewed card that runs out again goes home (is burned) at once, and anyone may send home a
/// card docked for more than 7 days.
/// @dev Candidate, unaudited.
contract Expedition3 is Ownable2Step, Pausable, ReentrancyGuard {
    uint8 internal constant SPIRE = 0;
    uint8 internal constant PRISM = 1;
    uint8 internal constant SEEKER = 2;
    uint8 internal constant FOCUSED = 1; // beam used when a team has no prism
    uint256 internal constant BP = 10_000;
    uint256 public constant DOCK_SECONDS = 7 days;

    struct Team {
        address owner;
        uint256 prism; // 0 = none
        uint256[] seekers;
        uint256 activeDive; // dive id + 1, 0 = none
    }

    struct Dive {
        address owner;
        uint256 spire;
        uint32 day;
        uint8 dest;
        uint8 beam;
        uint8 decision;
        bool revealed;
        uint16 power;
        uint64 round;
        uint256 pointsE2; // points of Lightdust x 100 (attunement and a light surge included)
        uint256 rate; // RVYN wei per point, fixed for the day
    }

    struct Result {
        uint8 tier;
        uint16 multX100;
        uint8 wear;
        uint256 reward; // credited, after the departure cost
        uint256 levy;
    }

    LightdiveNFT3 public immutable nft;
    LightdiveConfig3 public immutable config;
    IRoundRandomness public immutable rng;
    CoreLightPool3 public immutable pool;

    mapping(uint256 => Team) internal _teams; // by spire id
    mapping(address => uint8) public teamCount;
    mapping(address => mapping(uint32 => uint8)) public passesUsed;
    mapping(uint256 => mapping(uint32 => uint8)) public teamDives;
    Dive[] internal _dives;

    mapping(uint32 => uint256) public dayPointsE2;
    mapping(uint32 => uint256) public dayRate;
    mapping(uint32 => uint256) public dayCeiling;
    mapping(uint32 => uint256) public dayReserved;

    mapping(address => uint256) public credit;
    mapping(address => uint64) public lastClaimAt;

    event TeamSet(uint256 indexed spire, address indexed owner, uint256 prism, uint256[] seekers);
    event TeamDisbanded(uint256 indexed spire, address indexed owner);
    event DayOpened(uint32 indexed day, uint256 rate, uint256 ceiling);
    event Dived(uint256 indexed diveId, address indexed owner, uint256 indexed spire, uint8 dest, uint16 power, uint256 pointsE2, uint8 beam, uint32 day, uint64 round);
    event Decided(uint256 indexed diveId, uint8 decision);
    event Revealed(uint256 indexed diveId, address indexed owner, uint8 tier, uint16 multX100, uint8 wear, uint256 reward, uint256 levy, bool fallbackUsed);
    event Claimed(address indexed owner, uint256 gross, uint256 fee);

    error NotOwner();
    error WrongKind();
    error BadTeam();
    error TooManyTeams();
    error Busy();
    error Docked();
    error NoPasses();
    error TeamTired();
    error TooWeak();
    error DayFull();
    error DecisionClosed();
    error AlreadyRevealed();
    error NotYet();
    error NothingToClaim();
    error NotDue();

    constructor(address owner_, LightdiveNFT3 nft_, LightdiveConfig3 config_, IRoundRandomness rng_, CoreLightPool3 pool_)
        Ownable(owner_)
    {
        nft = nft_;
        config = config_;
        rng = rng_;
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

    /// @notice Power and attunement (x100) of a team at a destination today.
    function teamPower(uint256 spire, uint8 dest, uint32 day) public view returns (uint256 power, uint256 bonusX100) {
        Team storage t = _teams[spire];
        power = nft.attributes(spire).power;
        if (t.prism != 0) power += nft.attributes(t.prism).power;
        uint8 light = config.lightOf(day, dest);
        uint256 attuned;
        for (uint256 i; i < t.seekers.length; ++i) {
            LightdiveNFT3.Attributes memory s = nft.attributes(t.seekers[i]);
            power += s.power;
            if (s.trait == light) attuned += uint256(s.power) * 15;
        }
        bonusX100 = attuned < power * 10 ? attuned : power * 10; // +15% of each attuned seeker, at most +10% of the team
    }

    /// @notice Today's rate as it is or would be fixed now.
    function rateFor(uint32 day) public view returns (uint256 rate, uint256 ceiling) {
        if (dayRate[day] != 0) return (dayRate[day], dayCeiling[day]);
        uint256 avail = pool.available();
        uint256 cap = config.capPerPoint();
        uint256 y = dayPointsE2[day - 1];
        rate = y == 0 ? cap : avail * config.emissionBp() * 100 / (BP * y);
        if (rate > cap) rate = cap;
        ceiling = avail * config.ceilingBp() / BP;
    }

    // ---------------------------------------------------------------- teams

    /// @notice Builds a team, or changes one that is not out on a dive.
    function setTeam(uint256 spire, uint256 prism, uint256[] calldata seekers) external whenNotPaused nonReentrant {
        Team storage t = _teams[spire];
        if (t.owner != address(0)) {
            if (t.owner != msg.sender) revert NotOwner();
            if (t.activeDive != 0) revert Busy();
            _unlockMembers(t);
        } else {
            if (teamCount[msg.sender] >= config.maxTeams()) revert TooManyTeams();
            teamCount[msg.sender] += 1;
            t.owner = msg.sender;
            _join(spire, SPIRE);
        }
        LightdiveNFT3.Attributes memory s = nft.attributes(spire);
        if (seekers.length == 0 || seekers.length > s.trait) revert BadTeam();
        t.prism = prism;
        if (prism != 0) _join(prism, PRISM);
        delete t.seekers;
        for (uint256 i; i < seekers.length; ++i) {
            _join(seekers[i], SEEKER);
            t.seekers.push(seekers[i]);
        }
        emit TeamSet(spire, msg.sender, prism, seekers);
    }

    /// @notice Takes a team apart and unlocks its cards. Not while it is out on a dive.
    function disband(uint256 spire) external nonReentrant {
        Team storage t = _teams[spire];
        if (t.owner != msg.sender) revert NotOwner();
        if (t.activeDive != 0) revert Busy();
        _dissolve(spire);
    }

    // ---------------------------------------------------------------- diving

    function dive(uint256 spire, uint8 dest) external whenNotPaused nonReentrant returns (uint256) {
        return _dive(spire, dest);
    }

    /// @notice Several teams in one transaction.
    function diveMany(uint256[] calldata spires, uint8[] calldata dests) external whenNotPaused nonReentrant returns (uint256[] memory ids) {
        if (spires.length != dests.length) revert BadTeam();
        ids = new uint256[](spires.length);
        for (uint256 i; i < spires.length; ++i) ids[i] = _dive(spires[i], dests[i]);
    }

    /// @notice Picks the voyage decision: 0 let it ride, 1 steady, 2 bold, 3 detour. Open until shortly before the
    /// dive's drand round is published; it can be changed until then.
    function decide(uint256 id, uint8 decision) external {
        Dive storage d = _dives[id];
        if (d.owner != msg.sender) revert NotOwner();
        if (d.revealed) revert AlreadyRevealed();
        if (decision > 3) revert BadTeam();
        if (block.timestamp + config.decisionCloseSeconds() >= rng.roundTime(d.round)) revert DecisionClosed();
        d.decision = decision;
        emit Decided(id, decision);
    }

    /// @notice Reveals a dive with the signature of its drand round. Anyone may call it; the reward goes to the owner.
    function reveal(uint256 id, bytes calldata proof) external nonReentrant {
        Dive storage d = _dives[id];
        if (d.revealed) revert AlreadyRevealed();
        _settle(id, d, uint256(keccak256(abi.encode(rng.randomness(d.round, proof), id))), false);
    }

    function revealMany(uint256[] calldata ids, bytes[] calldata proofs) external nonReentrant {
        if (ids.length != proofs.length) revert BadTeam();
        for (uint256 i; i < ids.length; ++i) {
            Dive storage d = _dives[ids[i]];
            if (d.revealed) continue;
            _settle(ids[i], d, uint256(keccak256(abi.encode(rng.randomness(d.round, proofs[i]), ids[i]))), false);
        }
    }

    /// @notice If a dive's round has no proof a day after it was due, it ends neutral: x1.00, one voyage of wear.
    function revealFallback(uint256 id) external nonReentrant {
        Dive storage d = _dives[id];
        if (d.revealed) revert AlreadyRevealed();
        if (block.timestamp < rng.roundTime(d.round) + config.fallbackSeconds()) revert NotYet();
        _settle(id, d, 0, true);
    }

    /// @notice Sends home a card docked for more than 7 days without renewal. Anyone may call it.
    function sendHome(uint256 id) external {
        LightdiveNFT3.Attributes memory a = nft.attributes(id);
        if (a.dockedAt == 0 || block.timestamp < a.dockedAt + DOCK_SECONDS) revert NotDue();
        nft.burn(id);
    }

    function claim() external nonReentrant {
        uint256 gross = credit[msg.sender];
        if (gross == 0) revert NothingToClaim();
        uint256 fee = gross * config.claimFeeBp(block.timestamp - lastClaimAt[msg.sender]) / BP;
        credit[msg.sender] = 0;
        lastClaimAt[msg.sender] = uint64(block.timestamp);
        pool.pay(msg.sender, gross, fee, fee * (BP - config.taxToPoolBp()) / BP);
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

    function _join(uint256 id, uint8 kind) internal {
        if (nft.ownerOf(id) != msg.sender) revert NotOwner();
        LightdiveNFT3.Attributes memory a = nft.attributes(id);
        if (a.kind != kind) revert WrongKind();
        if (a.dockedAt != 0) revert Docked();
        if (nft.locked(id)) revert Busy(); // already on a team (also catches duplicates)
        nft.setLocked(id, true);
    }

    function _unlockMembers(Team storage t) internal {
        if (t.prism != 0) nft.setLocked(t.prism, false);
        for (uint256 i; i < t.seekers.length; ++i) nft.setLocked(t.seekers[i], false);
    }

    function _dissolve(uint256 spire) internal {
        Team storage t = _teams[spire];
        address owner = t.owner;
        _unlockMembers(t);
        nft.setLocked(spire, false);
        teamCount[owner] -= 1;
        delete _teams[spire];
        emit TeamDisbanded(spire, owner);
    }

    function _openDay(uint32 day) internal returns (uint256 rate) {
        rate = dayRate[day];
        if (rate != 0) return rate;
        uint256 ceiling;
        (rate, ceiling) = rateFor(day);
        if (rate == 0) rate = 1; // an empty pool still marks the day as opened
        dayRate[day] = rate;
        dayCeiling[day] = ceiling;
        emit DayOpened(day, rate, ceiling);
    }

    function _dive(uint256 spire, uint8 dest) internal returns (uint256 id) {
        Team storage t = _teams[spire];
        if (t.owner != msg.sender) revert NotOwner();
        if (t.activeDive != 0) revert Busy();
        if (t.seekers.length == 0) revert BadTeam();
        uint32 day = today();
        if (passesUsed[msg.sender][day] >= config.dailyPasses()) revert NoPasses();
        if (teamDives[spire][day] >= config.teamDivesPerDay()) revert TeamTired();

        (uint256 power, uint256 pointsE2) = _points(spire, dest, day);
        uint256 rate = _reserve(day, pointsE2);
        passesUsed[msg.sender][day] += 1;
        teamDives[spire][day] += 1;

        id = _dives.length;
        _dives.push(Dive({
            owner: msg.sender,
            spire: spire,
            day: day,
            dest: dest,
            beam: t.prism == 0 ? FOCUSED : nft.attributes(t.prism).trait,
            decision: 0,
            revealed: false,
            power: uint16(power),
            round: rng.roundAt(block.timestamp + config.voyageSeconds()),
            pointsE2: pointsE2,
            rate: rate
        }));
        t.activeDive = id + 1;
        if (lastClaimAt[msg.sender] == 0) lastClaimAt[msg.sender] = uint64(block.timestamp);
        Dive storage d = _dives[id];
        emit Dived(id, msg.sender, spire, dest, d.power, pointsE2, d.beam, day, d.round);
    }

    /// @dev Team power (checked against the threshold) and the dive's points of Lightdust x 100.
    function _points(uint256 spire, uint8 dest, uint32 day) internal view returns (uint256 power, uint256 pointsE2) {
        uint256 bonusX100;
        (power, bonusX100) = teamPower(spire, dest, day);
        if (power < config.threshold(dest)) revert TooWeak();
        uint256 coef = config.coefBp(dest);
        if (config.eventAt(day, dest) == config.SURGE()) coef = coef * 105 / 100;
        pointsE2 = (power * 100 + bonusX100) * coef / BP;
    }

    /// @dev Reserves the dive's x1.00 reward (before the departure cost) against the day's ceiling; returns the rate.
    function _reserve(uint32 day, uint256 pointsE2) internal returns (uint256 rate) {
        rate = _openDay(day);
        uint256 reserve = pointsE2 * rate / 100;
        if (dayReserved[day] + reserve > dayCeiling[day]) revert DayFull();
        dayReserved[day] += reserve;
        dayPointsE2[day] += pointsE2;
    }

    function _settle(uint256 id, Dive storage d, uint256 r, bool fallbackUsed) internal {
        d.revealed = true;
        Result memory res;
        LightdiveConfig3.Plan memory p = config.plan(d.dest, d.power, d.beam, d.day, d.decision);
        if (fallbackUsed) {
            res.multX100 = 100;
            res.wear = 1;
            res.tier = 255;
        } else {
            (res.tier, res.multX100) = _draw(p.table, r);
            uint256 w = (r >> 64) % BP;
            res.wear = w < p.wear3Bp ? 3 : w < uint256(p.wear3Bp) + p.wear2Bp ? 2 : 1;
        }
        if (res.multX100 > 0) {
            uint256 gross = d.pointsE2 * res.multX100 * d.rate / 10_000;
            res.levy = gross * p.levyBp / BP;
            res.reward = pool.credit(gross - res.levy);
            credit[d.owner] += res.reward;
            uint256 burnShare = res.levy * (BP - config.taxToPoolBp()) / BP;
            if (burnShare > 0) pool.burn(burnShare);
        }
        _wear(d.spire, res.wear);
        emit Revealed(id, d.owner, res.tier, res.multX100, res.wear, res.reward, res.levy, fallbackUsed);
    }

    /// @dev Outcome row from the low bits, multiplier within the row's range from the high bits.
    function _draw(LightdiveConfig3.Tier[] memory table, uint256 r) internal pure returns (uint8 tier, uint16 mult) {
        uint256 x = r % BP;
        uint256 acc;
        for (uint256 i; i < table.length; ++i) {
            acc += table[i].probBp;
            if (x < acc) {
                uint256 span = uint256(table[i].hi) - table[i].lo + 1;
                return (uint8(i), uint16(table[i].lo + (r >> 128) % span));
            }
        }
        LightdiveConfig3.Tier memory last = table[table.length - 1];
        return (uint8(table.length - 1), last.lo); // unreachable: rows sum to BP
    }

    /// @dev Spends voyages on every card of the team; cards that run out dock (or go home) and leave the team.
    function _wear(uint256 spire, uint8 n) internal {
        Team storage t = _teams[spire];
        t.activeDive = 0;
        for (uint256 i = t.seekers.length; i > 0; --i) {
            uint256 s = t.seekers[i - 1];
            if (_spend(s, n)) {
                t.seekers[i - 1] = t.seekers[t.seekers.length - 1];
                t.seekers.pop();
            }
        }
        if (t.prism != 0 && _spend(t.prism, n)) t.prism = 0;
        if (nft.spendVoyages(spire, n) == 0) {
            _dissolve(spire);
            _retire(spire);
        }
    }

    /// @dev Returns true when the card ran out (it has then been unlocked and docked or sent home).
    function _spend(uint256 id, uint8 n) internal returns (bool out) {
        if (nft.spendVoyages(id, n) != 0) return false;
        nft.setLocked(id, false);
        _retire(id);
        return true;
    }

    function _retire(uint256 id) internal {
        if (nft.attributes(id).renewed) nft.burn(id);
        else nft.dock(id);
    }
}
