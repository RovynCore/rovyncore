// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LightdiveConfig3} from "./LightdiveConfig3.sol";
import {LightdiveNFT3} from "./LightdiveNFT3.sol";
import {IRoundRandomness} from "./RoundRandomness.sol";
import {CoreLightPool3} from "./CoreLightPool3.sol";

interface IMinterReveal {
    function revealPending(uint256[] calldata ids, bytes[] calldata proofs) external;
}

interface ICommissionHooks {
    function acceptFor(address player, uint8 index) external;
    function settled(address owner, uint256 diveId) external returns (uint256 bonus);
}

/// @notice Teams, dives, reveals and claims for Lightdive v3 (v3.1: deep dives, crew bond, supplies, commission bonus;
/// v3.3: reveals ride along with the player's own transactions, no voyage decisions, a fallback that is never better
/// than a draw).
///
/// Team: a spire, at most one prism and 1..berths seekers. The cards stay in the owner's wallet, locked while on the
/// team. A wallet may have 5 teams; a team cannot change while it is out on a dive.
///
/// Dive: uses one of the wallet's 3 daily Dive Passes (and one of the team's 3 dives that day). The dive is tied to
/// the drand round published `voyageSeconds` after departure; nothing about it can be chosen after departure. Once
/// drand publishes the round, the dive is settled with the round's signature: the outcome, multiplier and wear are
/// drawn from it and the reward is credited. Settling needs no transaction of its own (v3.3): the player's next dive,
/// team change or claim carries the proofs (`Settle`) and settles first; anyone may also settle with `settle`. A team
/// must be settled before it dives again. A dive left without a proof for `fallbackSeconds` settles as empty-handed
/// with the most wear, never better than any draw, so leaving a result unrevealed gains nothing.
///
/// Deep dive (v3.1): from `longMinCluster` on, a dive may go deep. It uses 2 passes and 2 of the team's dives, takes
/// `longVoyageSeconds`, brings back twice the points and draws from the odds table one risk level up (the average
/// stays 1.00).
///
/// Crew bond (v3.1): a team whose members do not change gains a level of bond with every revealed dive (up to
/// `bondMax`); each level moves 1 point of empty-handed chance to "normal". Any change to the team resets it.
///
/// Echo bridges (v3.2): every dive leaves its bridge at the destination for the rest of the UTC day. The next dive
/// there by someone else follows that light: `echoStability` points of empty-handed chance moved to "normal", and the
/// observer who left it is counted as its guide (`echoesGiven`). Nothing is paid to anyone; one dive helps only the next.
///
/// Supplies (v3.1): at departure the owner may buy one supply, priced in basis points of the dive's x1.00 reward and
/// paid in RVYN into the pool (the burned share as for every fee): lamp oil (1 voyage of wear) or a star chart
/// (`chartStability` points of empty-handed chance moved to "normal").
///
/// Rewards: today's rate (RVYN per point of Lightdust) is fixed by the first dive of the UTC day as
/// min(cap, available pool x 1% / yesterday's points). Each dive reserves its x1.00 reward against a daily ceiling of
/// 1.5% of the pool, so a day can never promise more than that; commission bonuses (LightdiveCommissions3) count
/// against the same ceiling. Reward = points x multiplier x rate, minus the departure cost (95% of which stays in the
/// pool, 5% is burned); an empty-handed dive pays no departure cost.
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
    uint8 public constant OIL = 1;
    uint8 public constant CHART = 2;
    uint8 public constant NO_COMMISSION = 255;

    struct Team {
        address owner;
        uint256 prism; // 0 = none
        uint256[] seekers;
        uint256 activeDive; // dive id + 1, 0 = none
        uint8 bond;
    }

    struct Dive {
        address owner;
        uint256 spire;
        uint32 day;
        uint8 dest;
        uint8 beam;
        uint8 decision; // always 0 since v3.3 (kept so the record keeps its shape)
        bool revealed;
        uint16 power;
        uint64 round;
        uint256 pointsE2; // points of Lightdust x 100 (attunement, a light surge and a deep dive included)
        uint256 rate; // RVYN wei per point, fixed for the day
        bool long; // a deep dive
        bool turnedBack; // always false since v3.3
        bool attuned; // a seeker on the team shared the destination's light that day
        uint8 supply; // 0 none, OIL, CHART
        uint8 bond; // the team's bond at departure
    }

    /// @notice Reveals a transaction carries: dives to settle and summons to unseal, each with its round's signature.
    struct Settle {
        uint256[] dives;
        bytes[] diveProofs;
        uint256[] summons;
        bytes[] summonProofs;
    }

    struct Result {
        uint8 tier; // row of the odds table (0 = empty-handed, also for a fallback)
        uint16 multX100;
        uint8 wear;
        uint256 reward; // credited, after the departure cost
        uint256 levy;
    }

    LightdiveNFT3 public immutable nft;
    LightdiveConfig3 public immutable config;
    IRoundRandomness public immutable rng;
    CoreLightPool3 public immutable pool;
    IMinterReveal public immutable minter;
    address public commissions;

    mapping(uint256 => Team) internal _teams; // by spire id
    mapping(address => uint8) public teamCount;
    mapping(address => mapping(uint32 => uint8)) public passesUsed;
    mapping(uint256 => mapping(uint32 => uint8)) public teamDives;
    Dive[] internal _dives;
    mapping(uint256 => Result) internal _results;

    mapping(uint32 => uint256) public dayPointsE2;
    mapping(uint32 => uint256) public dayRate;
    mapping(uint32 => uint256) public dayCeiling;
    mapping(uint32 => uint256) public dayReserved;

    mapping(address => uint256) public credit;
    mapping(address => uint64) public lastClaimAt;

    // echo bridges (v3.2)
    mapping(uint32 => mapping(uint8 => address)) public lastDiver; // day => destination => the latest observer there
    mapping(uint256 => bool) public echoed; // dive => it followed someone else's bridge
    mapping(address => uint32) public echoesGiven; // observer => dives that followed their bridges

    event TeamSet(uint256 indexed spire, address indexed owner, uint256 prism, uint256[] seekers);
    event TeamDisbanded(uint256 indexed spire, address indexed owner);
    event DayOpened(uint32 indexed day, uint256 rate, uint256 ceiling);
    event Dived(uint256 indexed diveId, address indexed owner, uint256 indexed spire, uint8 dest, uint16 power, uint256 pointsE2, uint8 beam, uint32 day, uint64 round);
    event DiveDetails(uint256 indexed diveId, bool long, uint8 supply, uint256 supplyPaid, uint8 bond, bool attuned);
    event Revealed(uint256 indexed diveId, address indexed owner, uint8 tier, uint16 multX100, uint8 wear, uint256 reward, uint256 levy, bool fallbackUsed);
    event BondChanged(uint256 indexed spire, uint8 bond);
    event Claimed(address indexed owner, uint256 gross, uint256 fee);
    event CommissionsSet(address commissions);
    event BonusCredited(address indexed owner, uint256 amount);
    event Echoed(uint256 indexed diveId, address indexed guide, address indexed follower);

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
    error AlreadyRevealed();
    error NotYet();
    error NothingToClaim();
    error NotDue();
    error NotDeep();
    error BadSupply();
    error AlreadySet();

    constructor(address owner_, LightdiveNFT3 nft_, LightdiveConfig3 config_, IRoundRandomness rng_, CoreLightPool3 pool_, IMinterReveal minter_)
        Ownable(owner_)
    {
        nft = nft_;
        config = config_;
        rng = rng_;
        pool = pool_;
        minter = minter_;
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

    function result(uint256 id) external view returns (Result memory) {
        return _results[id];
    }

    function diveCount() external view returns (uint256) {
        return _dives.length;
    }

    /// @notice Power and attunement (x100) of a team at a destination today.
    function teamPower(uint256 spire, uint8 dest, uint32 day) public view returns (uint256 power, uint256 bonusX100) {
        Team storage t = _teams[spire];
        power = nft.attributes(spire).power;
        if (t.prism != 0) power += nft.attributes(t.prism).power;
        (,, uint8 light) = config.destOf(day, dest);
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
        LightdiveConfig3.Rules memory k = config.rules();
        uint256 avail = pool.available();
        uint256 y = dayPointsE2[day - 1];
        rate = y == 0 ? k.capPerPoint : avail * k.emissionBp * 100 / (BP * y);
        if (rate > k.capPerPoint) rate = k.capPerPoint;
        ceiling = avail * k.ceilingBp / BP;
    }

    /// @notice What a supply costs on a dive of `pointsE2` at `rate` (RVYN wei).
    function supplyPrice(uint8 supply, uint256 pointsE2, uint256 rate) public view returns (uint256) {
        if (supply > CHART) revert BadSupply();
        return pointsE2 * rate / 100 * config.supplyPriceBp(supply) / BP;
    }

    // ---------------------------------------------------------------- teams

    /// @notice Builds a team, or changes one that is not out on a dive. Any change resets the crew bond. `s`: reveals
    /// to apply first (a team's last dive, freshly summoned cards).
    function setTeam(uint256 spire, uint256 prism, uint256[] calldata seekers, Settle calldata s) external whenNotPaused nonReentrant {
        _settleAll(s);
        Team storage t = _teams[spire];
        if (t.owner != address(0)) {
            if (t.owner != msg.sender) revert NotOwner();
            if (t.activeDive != 0) revert Busy();
            _unlockMembers(t);
        } else {
            if (teamCount[msg.sender] >= config.rules().maxTeams) revert TooManyTeams();
            teamCount[msg.sender] += 1;
            t.owner = msg.sender;
            _join(spire, SPIRE);
        }
        LightdiveNFT3.Attributes memory sp = nft.attributes(spire);
        if (seekers.length == 0 || seekers.length > sp.trait) revert BadTeam();
        t.prism = prism;
        if (prism != 0) _join(prism, PRISM);
        delete t.seekers;
        for (uint256 i; i < seekers.length; ++i) {
            _join(seekers[i], SEEKER);
            t.seekers.push(seekers[i]);
        }
        if (t.bond != 0) {
            t.bond = 0;
            emit BondChanged(spire, 0);
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

    /// @notice One dive. `supply`: 0 none, 1 lamp oil, 2 star chart. `deep`: a deep dive (2 passes, from
    /// `longMinCluster` on). `commission`: today's commission to take with it (NO_COMMISSION for none). A supply is
    /// paid in RVYN; the owner must have approved the pool for it. `s`: reveals to apply first.
    function dive(uint256 spire, uint8 dest, uint8 supply, bool deep, uint8 commission, Settle calldata s) external whenNotPaused nonReentrant returns (uint256) {
        _settleAll(s);
        if (commission != NO_COMMISSION) ICommissionHooks(commissions).acceptFor(msg.sender, commission);
        return _dive(spire, dest, supply, deep);
    }

    /// @notice Several teams in one transaction (ordinary dives), each with the same supply.
    function diveMany(uint256[] calldata spires, uint8[] calldata dests, uint8 supply, uint8 commission, Settle calldata s) external whenNotPaused nonReentrant returns (uint256[] memory ids) {
        _settleAll(s);
        if (spires.length != dests.length) revert BadTeam();
        if (commission != NO_COMMISSION) ICommissionHooks(commissions).acceptFor(msg.sender, commission);
        ids = new uint256[](spires.length);
        for (uint256 i; i < spires.length; ++i) ids[i] = _dive(spires[i], dests[i], supply, false);
    }

    /// @notice Applies reveals on their own: anyone may settle any dive or unseal any summon whose round is out.
    function settle(Settle calldata s) external nonReentrant {
        _settleAll(s);
    }

    /// @notice A dive with no proof `fallbackSeconds` after its round settles as empty-handed with the most wear
    /// (one voyage with lamp oil), never better than any draw. Only its owner may use it, so nobody else can erase a
    /// result the owner has seen but not settled yet.
    function revealFallback(uint256 id) external nonReentrant {
        Dive storage d = _dives[id];
        if (msg.sender != d.owner) revert NotOwner();
        if (d.revealed) revert AlreadyRevealed();
        if (block.timestamp < rng.roundTime(d.round) + config.rules().fallbackSeconds) revert NotYet();
        _settle(id, d, 0, true);
    }

    /// @notice Sends home a card docked for more than 7 days without renewal. Anyone may call it.
    function sendHome(uint256 id) external {
        LightdiveNFT3.Attributes memory a = nft.attributes(id);
        if (a.dockedAt == 0 || block.timestamp < a.dockedAt + DOCK_SECONDS) revert NotDue();
        nft.burn(id);
    }

    /// @notice Withdraws the claimable balance, after settling the dives `s` carries (so a result the player has seen
    /// is paid in the same transaction).
    function claim(Settle calldata s) external nonReentrant {
        _settleAll(s);
        uint256 gross = credit[msg.sender];
        if (gross == 0) revert NothingToClaim();
        uint256 fee = gross * config.claimFeeBp(block.timestamp - lastClaimAt[msg.sender]) / BP;
        credit[msg.sender] = 0;
        lastClaimAt[msg.sender] = uint64(block.timestamp);
        pool.pay(msg.sender, gross, fee, fee * (BP - config.rules().taxToPoolBp) / BP);
        emit Claimed(msg.sender, gross, fee);
    }

    /// @dev Credits a commission bonus within what is left of the day's ceiling.
    function _creditBonus(address owner, uint256 amount) internal {
        uint32 day = today();
        _openDay(day);
        uint256 left = dayCeiling[day] > dayReserved[day] ? dayCeiling[day] - dayReserved[day] : 0;
        if (amount > left) amount = left;
        dayReserved[day] += amount;
        uint256 credited = pool.credit(amount);
        credit[owner] += credited;
        emit BonusCredited(owner, credited);
    }

    // ---------------------------------------------------------------- owner

    function setCommissions(address commissions_) external onlyOwner {
        if (commissions != address(0)) revert AlreadySet();
        commissions = commissions_;
        emit CommissionsSet(commissions_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------- internal

    function _settleAll(Settle calldata s) internal {
        if (s.summons.length != 0) minter.revealPending(s.summons, s.summonProofs);
        if (s.dives.length != s.diveProofs.length) revert BadTeam();
        for (uint256 i; i < s.dives.length; ++i) {
            Dive storage d = _dives[s.dives[i]];
            if (!d.revealed) _settle(s.dives[i], d, uint256(keccak256(abi.encode(rng.randomness(d.round, s.diveProofs[i]), s.dives[i]))), false);
        }
    }

    function _join(uint256 id, uint8 kind) internal {
        if (nft.ownerOf(id) != msg.sender) revert NotOwner();
        LightdiveNFT3.Attributes memory a = nft.attributes(id);
        if (a.kind != kind || a.rarity == 255) revert WrongKind(); // a sealed card is unsealed first (see Settle)
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

    function _dive(uint256 spire, uint8 dest, uint8 supply, bool deep) internal returns (uint256 id) {
        Team storage t = _teams[spire];
        if (t.owner != msg.sender) revert NotOwner();
        if (t.activeDive != 0) revert Busy();
        if (t.seekers.length == 0) revert BadTeam();
        if (supply > CHART) revert BadSupply();
        LightdiveConfig3.Rules memory k = config.rules();
        uint32 day = today();
        uint8 uses = deep ? 2 : 1;
        if (deep && dest / 4 < k.longMinCluster) revert NotDeep();
        if (passesUsed[msg.sender][day] + uses > k.dailyPasses) revert NoPasses();
        if (teamDives[spire][day] + uses > k.teamDivesPerDay) revert TeamTired();

        (uint256 power, uint256 pointsE2, bool attuned) = _points(spire, dest, day);
        if (deep) pointsE2 *= 2;
        uint256 rate = _reserve(day, pointsE2);
        passesUsed[msg.sender][day] += uses;
        teamDives[spire][day] += uses;

        uint256 paid;
        if (supply != 0) {
            paid = supplyPrice(supply, pointsE2, rate);
            if (paid != 0) pool.collect(msg.sender, paid, paid * (BP - k.taxToPoolBp) / BP);
        }

        id = _dives.length;
        // echo: the bridge someone else left here today
        address prev = lastDiver[day][dest];
        lastDiver[day][dest] = msg.sender;
        if (prev != address(0) && prev != msg.sender) {
            echoed[id] = true;
            unchecked { echoesGiven[prev] += 1; }
            emit Echoed(id, prev, msg.sender);
        }
        _dives.push(Dive({
            owner: msg.sender,
            spire: spire,
            day: day,
            dest: dest,
            beam: t.prism == 0 ? FOCUSED : nft.attributes(t.prism).trait,
            decision: 0,
            revealed: false,
            power: uint16(power),
            round: rng.roundAt(block.timestamp + (deep ? k.longVoyageSeconds : k.voyageSeconds)),
            pointsE2: pointsE2,
            rate: rate,
            long: deep,
            turnedBack: false,
            attuned: attuned,
            supply: supply,
            bond: t.bond
        }));
        t.activeDive = id + 1;
        if (lastClaimAt[msg.sender] == 0) lastClaimAt[msg.sender] = uint64(block.timestamp);
        Dive storage d = _dives[id];
        emit Dived(id, msg.sender, spire, dest, d.power, pointsE2, d.beam, day, d.round);
        emit DiveDetails(id, deep, supply, paid, d.bond, attuned);
    }

    /// @dev Team power (checked against the threshold), the dive's points of Lightdust x 100, and whether a seeker was
    /// attuned.
    function _points(uint256 spire, uint8 dest, uint32 day) internal view returns (uint256 power, uint256 pointsE2, bool attuned) {
        uint256 bonusX100;
        (power, bonusX100) = teamPower(spire, dest, day);
        (uint16 thresh, uint256 coef,) = config.destOf(day, dest);
        if (power < thresh) revert TooWeak();
        pointsE2 = (power * 100 + bonusX100) * coef / BP;
        attuned = bonusX100 > 0;
    }

    /// @dev Reserves the dive's x1.00 reward (before the departure cost) against the day's ceiling; returns the rate.
    function _reserve(uint32 day, uint256 pointsE2) internal returns (uint256 rate) {
        rate = _openDay(day);
        uint256 reserve = pointsE2 * rate / 100;
        if (dayReserved[day] + reserve > dayCeiling[day]) revert DayFull();
        dayReserved[day] += reserve;
        dayPointsE2[day] += pointsE2;
    }

    /// @dev Points of empty-handed chance moved to "normal" for a dive: its bond, a star chart and an echo.
    function _stability(uint256 id, Dive storage d, LightdiveConfig3.Rules memory k) internal view returns (uint8) {
        return d.bond + (d.supply == CHART ? k.chartStability : 0) + (echoed[id] ? config.echoStability() : 0);
    }

    function _settle(uint256 id, Dive storage d, uint256 r, bool fallbackUsed) internal {
        d.revealed = true;
        Result memory res;
        LightdiveConfig3.Rules memory k = config.rules();
        LightdiveConfig3.Plan memory p = config.plan(d.dest, d.power, d.beam, d.day, d.decision, _stability(id, d, k), d.long);
        if (fallbackUsed) {
            res.wear = d.supply == OIL ? 1 : 3; // empty-handed (tier 0, x0) with the most wear
        } else {
            (res.tier, res.multX100) = _draw(p.table, r);
            uint256 w = (r >> 64) % BP;
            res.wear = d.supply == OIL ? 1 : w < p.wear3Bp ? 3 : w < uint256(p.wear3Bp) + p.wear2Bp ? 2 : 1;
        }
        if (res.multX100 > 0) {
            uint256 gross = d.pointsE2 * res.multX100 * d.rate / 10_000;
            res.levy = gross * p.levyBp / BP;
            res.reward = pool.credit(gross - res.levy);
            credit[d.owner] += res.reward;
            uint256 burnShare = res.levy * (BP - k.taxToPoolBp) / BP;
            if (burnShare > 0) pool.burn(burnShare);
        }
        _results[id] = res;
        _wear(d.spire, res.wear, k.bondMax);
        emit Revealed(id, d.owner, res.tier, res.multX100, res.wear, res.reward, res.levy, fallbackUsed);
        // a commission taken before this dive completes on its own when the result meets it
        if (commissions != address(0)) {
            uint256 bonus = ICommissionHooks(commissions).settled(d.owner, id);
            if (bonus != 0) _creditBonus(d.owner, bonus);
        }
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

    /// @dev Spends voyages on every card of the team; cards that run out dock (or go home) and leave the team. The
    /// crew bond grows by one when everyone comes back on board, and resets when anyone leaves.
    function _wear(uint256 spire, uint8 n, uint8 bondMax) internal {
        Team storage t = _teams[spire];
        t.activeDive = 0;
        bool left;
        for (uint256 i = t.seekers.length; i > 0; --i) {
            uint256 s = t.seekers[i - 1];
            if (_spend(s, n)) {
                t.seekers[i - 1] = t.seekers[t.seekers.length - 1];
                t.seekers.pop();
                left = true;
            }
        }
        if (t.prism != 0 && _spend(t.prism, n)) {
            t.prism = 0;
            left = true;
        }
        if (nft.spendVoyages(spire, n) == 0) {
            _dissolve(spire);
            _retire(spire);
            return;
        }
        uint8 bond = left ? 0 : t.bond < bondMax ? t.bond + 1 : t.bond;
        if (bond != t.bond) {
            t.bond = bond;
            emit BondChanged(spire, bond);
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
