// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LightdiveConfig3} from "./LightdiveConfig3.sol";
import {Expedition3} from "./Expedition3.sol";

/// @notice Daily commissions for Lightdive (v3.1). Every UTC day has three commissions, the same for everyone and
/// derived from the day alone (like the sky), so nobody sets them by hand. A player accepts one at a time; a dive that
/// departs after accepting and meets the commission completes it once its result is revealed, and completing pays a
/// bonus of `bonusBp` of that dive's x1.00 reward into the player's claimable balance (within the day's ceiling, see
/// Expedition3.creditBonus). An abandoned commission cannot be taken again that day; each is completed at most once.
/// @dev Candidate, unaudited. Reads dives and results from Expedition3; pays through Expedition3.creditBonus.
contract LightdiveCommissions3 is Ownable2Step, ReentrancyGuard {
    uint256 internal constant BP = 10_000;
    uint8 public constant PER_DAY = 3;

    // kinds (param in brackets)
    uint8 public constant CLUSTER = 0; // a result that is not empty-handed in cluster [0..2]
    uint8 public constant GOOD = 1; // a "good" result or better anywhere
    uint8 public constant DECISION = 2; // a dive with decision [1 steady, 2 bold, 3 detour]
    uint8 public constant ATTUNED = 3; // a dive with an attuned seeker
    uint8 public constant SKY = 4; // a dive to a destination with a star event that day
    uint8 public constant DEEP = 5; // a deep dive
    uint8 public constant SUPPLY = 6; // a dive with a supply
    uint8 public constant KINDS = 7;

    struct Commission {
        uint8 kind;
        uint8 param;
    }

    struct Active {
        uint32 day;
        uint8 index; // 0..2
        bool on;
        uint256 fromDive; // dives with this id or later count
    }

    Expedition3 public immutable expedition;
    LightdiveConfig3 public immutable config;
    uint16 public bonusBp = 1000; // 10% of the dive's x1.00 reward

    mapping(address => Active) public active;
    /// @notice Per player and day: bit i set = commission i completed; bit i + 8 set = abandoned.
    mapping(address => mapping(uint32 => uint16)) public marks;

    event Accepted(address indexed player, uint32 indexed day, uint8 index);
    event Abandoned(address indexed player, uint32 indexed day, uint8 index);
    event Completed(address indexed player, uint32 indexed day, uint8 index, uint256 diveId, uint256 bonus);
    event BonusSet(uint16 bonusBp);

    error BadIndex();
    error Taken();
    error NoneActive();
    error Expired();
    error NotYours();
    error TooEarly();
    error NotRevealed();
    error NotMet();
    error OutOfBounds();

    constructor(address owner_, Expedition3 expedition_, LightdiveConfig3 config_) Ownable(owner_) {
        expedition = expedition_;
        config = config_;
    }

    // ---------------------------------------------------------------- views

    function today() public view returns (uint32) {
        return uint32(block.timestamp / 1 days);
    }

    /// @notice The day's three commissions: three different kinds, each with its parameter.
    function commissionsOf(uint32 day) public pure returns (Commission[3] memory out) {
        bool[7] memory taken;
        uint256 found;
        for (uint8 i; found < PER_DAY; ++i) {
            uint256 h = uint256(keccak256(abi.encodePacked("lightdive.commission", day, i)));
            uint8 kind = uint8(h % KINDS);
            if (taken[kind]) continue;
            taken[kind] = true;
            uint8 param = kind == CLUSTER ? uint8((h >> 8) % 3) : kind == DECISION ? uint8((h >> 8) % 3) + 1 : 0;
            out[found++] = Commission(kind, param);
        }
    }

    /// @notice Whether dive `id` meets commission `c` (it must have been revealed).
    function meets(uint256 id, Commission memory c) public view returns (bool) {
        Expedition3.Dive memory d = expedition.diveInfo(id);
        if (!d.revealed) return false;
        Expedition3.Result memory r = expedition.result(id);
        if (c.kind == CLUSTER) return config.clusterOf(d.dest) == c.param && r.multX100 > 0;
        if (c.kind == GOOD) return _goodOrBetter(d, r);
        if (c.kind == DECISION) return d.decision == c.param;
        if (c.kind == ATTUNED) return d.attuned;
        if (c.kind == SKY) return config.eventAt(d.day, d.dest) != 0;
        if (c.kind == DEEP) return d.long;
        if (c.kind == SUPPLY) return d.supply != 0;
        return false;
    }

    // ---------------------------------------------------------------- players

    /// @notice Takes commission `index` of today. One at a time; not one already completed or abandoned today.
    function accept(uint8 index) external {
        if (index >= PER_DAY) revert BadIndex();
        uint32 day = today();
        Active storage a = active[msg.sender];
        if (a.on && a.day == day) revert Taken();
        if (marks[msg.sender][day] & (uint16(1) << index | uint16(1) << (index + 8)) != 0) revert Taken();
        active[msg.sender] = Active(day, index, true, expedition.diveCount());
        emit Accepted(msg.sender, day, index);
    }

    /// @notice Gives up the active commission; it cannot be taken again today.
    function abandon() external {
        Active storage a = active[msg.sender];
        if (!a.on) revert NoneActive();
        if (a.day == today()) marks[msg.sender][a.day] |= uint16(1) << (a.index + 8);
        emit Abandoned(msg.sender, a.day, a.index);
        delete active[msg.sender];
    }

    /// @notice Completes the active commission with a revealed dive of the same day that departed after accepting.
    function complete(uint256 diveId) external nonReentrant returns (uint256 bonus) {
        Active memory a = active[msg.sender];
        if (!a.on) revert NoneActive();
        if (a.day != today()) revert Expired();
        if (diveId < a.fromDive) revert TooEarly();
        Expedition3.Dive memory d = expedition.diveInfo(diveId);
        if (d.owner != msg.sender) revert NotYours();
        if (d.day != a.day) revert Expired();
        if (!d.revealed) revert NotRevealed();
        if (!meets(diveId, commissionsOf(a.day)[a.index])) revert NotMet();
        delete active[msg.sender];
        marks[msg.sender][a.day] |= uint16(1) << a.index;
        // the dive's x1.00 reward before the departure cost, times the bonus share
        bonus = expedition.creditBonus(msg.sender, d.pointsE2 * d.rate / 100 * bonusBp / BP);
        emit Completed(msg.sender, a.day, a.index, diveId, bonus);
    }

    // ---------------------------------------------------------------- owner

    function setBonus(uint16 bp) external onlyOwner {
        if (bp > 3000) revert OutOfBounds();
        bonusBp = bp;
        emit BonusSet(bp);
    }

    // ---------------------------------------------------------------- internal

    /// @dev "Good" or better: the row named good, great or legend in the dive's table (the same naming as the
    /// website: after row 0 (empty) comes an optional "slight loss" row whose top is at most x0.80, then normal, then
    /// good, great, legend). A turned-back or fallback dive is x1.00, never good.
    function _goodOrBetter(Expedition3.Dive memory d, Expedition3.Result memory r) internal view returns (bool) {
        if (r.tier >= expedition.TURNED_BACK() || r.tier == 0) return false;
        uint8 stability = d.bond + (d.supply == expedition.CHART() ? config.chartStability() : 0);
        LightdiveConfig3.Plan memory p = config.plan(d.dest, d.power, d.beam, d.day, d.decision, stability, d.long);
        // rows are named from the base table (before a decision rescales the multipliers), as LightdiveConfig3 does
        LightdiveConfig3.Tier[] memory base = config.tableOf(config.clusterOf(d.dest), p.risk);
        uint256 good = base[1].hi <= 80 ? 3 : 2; // index of "good"
        return r.tier >= good;
    }
}
