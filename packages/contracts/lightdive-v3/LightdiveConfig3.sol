// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Every Lightdive v3 rule in one place (docs/lightdive/RULES-v3-draft.md, lib/lightdive-v3/rules.ts): the 24
/// destinations, the 18 odds tables, the daily sky, the voyage decisions and the economy. `plan` turns a team and a
/// destination into the exact odds table of one dive; the website runs the same integer arithmetic, so the odds a
/// player sees are the odds the contract uses. The owner is meant to be a multisig behind a timelock; every setter has
/// hard bounds and every odds table must average exactly 1.00.
/// @dev Candidate, unaudited.
contract LightdiveConfig3 is Ownable2Step {
    uint256 public constant BP = 10_000;
    uint8 public constant DESTINATIONS = 24;
    uint8 public constant CLUSTERS = 6;
    uint8 public constant LIGHTS = 6;
    uint8 public constant STAR_EVENTS_PER_DAY = 4;
    uint16 public constant MAX_MULTIPLIER_X100 = 1000; // 10x
    /// @dev sum(prob * (lo + hi)) of a table averaging exactly 1.00
    uint256 public constant EV_TARGET = 2 * BP * 100;

    // decisions
    uint8 public constant NONE = 0;
    uint8 public constant STEADY = 1;
    uint8 public constant BOLD = 2;
    uint8 public constant DETOUR = 3;
    // star events (index + 1; 0 = none)
    uint8 public constant TIDE = 1; // only 1 voyage of wear
    uint8 public constant SURGE = 2; // reward weight +5%
    uint8 public constant STORM = 3; // risk +1, departure cost -2 points
    uint8 public constant CALM = 4; // risk -1

    struct Tier {
        uint16 probBp;
        uint16 lo; // multiplier x100
        uint16 hi; // multiplier x100, inclusive
    }

    struct Plan {
        Tier[] table; // after the star event, overflow stability and the decision
        uint8 risk; // beam after the star event: 0 wide, 1 focused, 2 needle
        uint8 starEvent;
        uint32 coefBp; // reward weight after a light surge
        uint16 levyBp; // departure cost after a storm and a detour
        uint16 wear2Bp; // chance of 2 voyages of wear
        uint16 wear3Bp; // chance of 3 voyages of wear
    }

    // ---------------------------------------------------------------- tunables

    uint16[24] public threshold;
    uint32[24] public coefBp;
    uint16[6] public levyBp = [uint16(300), 500, 700, 900, 1100, 1300];
    uint16[6] public wear2Bp = [uint16(0), 500, 1000, 1500, 2000, 2500];
    uint16[6] public wear3Bp = [uint16(0), 0, 0, 250, 600, 1000];
    mapping(uint8 => Tier[]) private _tables; // cluster * 3 + beam

    uint16 public emissionBp = 100; // share of the pool released per day (the rate's basis)
    uint16 public ceilingBp = 150; // hard cap on what one day's dives may reserve
    uint256 public capPerPoint = 0.015 ether; // launch guard: max RVYN per point of Lightdust
    uint16 public claimFeeMaxBp = 1500; // 15% right after a claim ...
    uint16 public claimFeeStepBp = 100; // ... 1 point less per day
    uint16 public taxToPoolBp = 9500; // departure cost, claim fee and market tax: the rest is burned
    uint16 public marketTaxBp = 500;

    uint8 public dailyPasses = 3; // dives per wallet per UTC day
    uint8 public teamDivesPerDay = 3;
    uint8 public maxTeams = 5;
    uint32 public voyageSeconds = 300; // departure to reveal
    uint32 public decisionCloseSeconds = 60; // decisions close this long before the reveal round
    uint32 public fallbackSeconds = 1 days; // without a drand proof this long after the reveal: neutral result

    // v3.1: deep dives, crew bond, supplies
    uint32 public longVoyageSeconds = 900; // a deep dive's departure to reveal
    uint32 public longTurnSeconds = 600; // the turn-back decision opens this long before the reveal
    uint8 public longMinCluster = 2; // deep dives from the third cluster on
    uint8 public bondMax = 5; // crew bond levels; each removes 1 point of empty-handed chance
    /// @notice Supply prices in basis points of the dive's x1.00 reward (index 1 lamp oil, 2 star chart; 0 = none).
    uint16[3] public supplyPriceBp = [uint16(0), 400, 600];
    uint8 public chartStability = 3; // points of empty-handed chance a star chart removes
    uint8 public echoStability = 1; // v3.2: points an echo (another observer's bridge at the same place that day) removes

    event TableSet(uint8 cluster, uint8 beam);
    event DestinationsSet();
    event ClusterSet(uint8 cluster, uint16 levyBp, uint16 wear2Bp, uint16 wear3Bp);
    event EconomySet(uint16 emissionBp, uint16 ceilingBp, uint256 capPerPoint);
    event FeesSet(uint16 claimFeeMaxBp, uint16 claimFeeStepBp, uint16 taxToPoolBp, uint16 marketTaxBp);
    event LimitsSet(uint8 dailyPasses, uint8 teamDivesPerDay, uint8 maxTeams);
    event TimingSet(uint32 voyageSeconds, uint32 decisionCloseSeconds, uint32 fallbackSeconds);
    /// @notice Every setting Expedition3 needs, in one read (keeps Expedition3 within the contract size limit).
    struct Rules {
        uint8 dailyPasses;
        uint8 teamDivesPerDay;
        uint8 maxTeams;
        uint8 bondMax;
        uint8 chartStability;
        uint8 longMinCluster;
        uint16 taxToPoolBp;
        uint16 emissionBp;
        uint16 ceilingBp;
        uint32 voyageSeconds;
        uint32 decisionCloseSeconds;
        uint32 fallbackSeconds;
        uint32 longVoyageSeconds;
        uint32 longTurnSeconds;
        uint256 capPerPoint;
    }

    event DeepDiveSet(uint32 longVoyageSeconds, uint32 longTurnSeconds, uint8 longMinCluster);
    event SuppliesSet(uint16 oilPriceBp, uint16 chartPriceBp, uint8 chartStability, uint8 bondMax);
    event EchoSet(uint8 echoStability);

    error OutOfBounds();
    error BadTable();

    constructor(address owner_) Ownable(owner_) {
        uint16[24] memory t = [
            uint16(51), 60, 70, 80, 92, 106, 122, 140, 160, 185, 215, 250,
            290, 335, 385, 440, 500, 570, 650, 740, 840, 950, 1070, 1180
        ];
        // round(1000 * 1.025^id) / 1000, in basis points
        uint32[24] memory c = [
            uint32(10_000), 10_250, 10_510, 10_770, 11_040, 11_310, 11_600, 11_890, 12_180, 12_490, 12_800, 13_120,
            13_450, 13_790, 14_130, 14_480, 14_850, 15_220, 15_600, 15_990, 16_390, 16_800, 17_220, 17_650
        ];
        threshold = t;
        coefBp = c;
    }

    // ---------------------------------------------------------------- views

    function tableOf(uint8 cluster, uint8 beam) public view returns (Tier[] memory) {
        return _tables[cluster * 3 + beam];
    }

    function clusterOf(uint8 dest) public pure returns (uint8) {
        return dest / 4;
    }

    /// @notice Today's light of a destination (0..5): the same formula on the website, so anyone can check it.
    function lightOf(uint32 day, uint8 dest) public pure returns (uint8) {
        return uint8(uint256(keccak256(abi.encodePacked("lightdive.light", day, dest))) % LIGHTS);
    }

    /// @notice The day's four star events: destinations and event codes (TIDE..CALM).
    function eventsOf(uint32 day) public pure returns (uint8[4] memory dests, uint8[4] memory kinds) {
        uint256 found;
        bool[24] memory taken;
        for (uint8 i; found < STAR_EVENTS_PER_DAY; ++i) {
            uint256 h = uint256(keccak256(abi.encodePacked("lightdive.event", day, i)));
            uint8 dest = uint8(h % DESTINATIONS);
            if (taken[dest]) continue;
            taken[dest] = true;
            dests[found] = dest;
            kinds[found] = uint8((h >> 8) % 4) + 1;
            ++found;
        }
    }

    function eventAt(uint32 day, uint8 dest) public pure returns (uint8) {
        (uint8[4] memory dests, uint8[4] memory kinds) = eventsOf(day);
        for (uint256 i; i < 4; ++i) if (dests[i] == dest) return kinds[i];
        return 0;
    }

    /// @notice Every 20% of power above the threshold removes 1 point of empty-handed chance, at most 5.
    function overflowPoints(uint256 power, uint256 thresh) public pure returns (uint256) {
        if (power <= thresh) return 0;
        uint256 p = (power - thresh) * 5 / thresh;
        return p > 5 ? 5 : p;
    }

    /// @notice Everything that decides one dive, in the rulebook's order: base table (cluster x risk after the star
    /// event), overflow stability, then the decision.
    /// @param stability extra points of empty-handed chance moved to "normal" (crew bond, a star-chart supply), on top of
    /// the overflow stability; together never more than the empty row.
    /// @param riskUp a deep dive: one risk level up (after the star event), at most needle.
    function plan(uint8 dest, uint256 power, uint8 beam, uint32 day, uint8 decision, uint8 stability, bool riskUp)
        external
        view
        returns (Plan memory p)
    {
        if (dest >= DESTINATIONS || beam > 2 || decision > DETOUR) revert OutOfBounds();
        p = _frame(dest, beam, day, decision, riskUp);
        Tier[] memory base = tableOf(clusterOf(dest), p.risk);
        Pos memory at = _positions(base);
        _stabilize(base, at, (overflowPoints(power, threshold[dest]) + stability) * 100);
        p.table = decision == STEADY ? _reshape(base, at, true) : decision == BOLD ? _reshape(base, at, false) : base;
    }

    /// @dev Everything of a plan except its table: risk, star event, weight, departure cost and wear.
    function _frame(uint8 dest, uint8 beam, uint32 day, uint8 decision, bool riskUp) private view returns (Plan memory p) {
        uint8 cluster = clusterOf(dest);
        p.starEvent = eventAt(day, dest);
        int256 risk = int256(uint256(beam));
        p.levyBp = levyBp[cluster];
        p.coefBp = coefBp[dest];
        p.wear2Bp = wear2Bp[cluster];
        p.wear3Bp = wear3Bp[cluster];
        if (p.starEvent == STORM) {
            risk += 1;
            p.levyBp = p.levyBp > 200 ? p.levyBp - 200 : 0;
        } else if (p.starEvent == CALM) {
            risk -= 1;
        } else if (p.starEvent == SURGE) {
            p.coefBp = p.coefBp * 105 / 100;
        } else if (p.starEvent == TIDE) {
            p.wear2Bp = 0;
            p.wear3Bp = 0;
        }
        if (decision == DETOUR) {
            p.wear2Bp = 0;
            p.wear3Bp = 0;
            p.levyBp += 200;
        }
        if (riskUp) risk += 1;
        p.risk = uint8(uint256(risk < 0 ? int256(0) : risk > 2 ? int256(2) : risk));
    }

    /// @dev Moves `cut` basis points (at most the whole empty row) from empty-handed to "normal".
    function _stabilize(Tier[] memory base, Pos memory at, uint256 cut) private pure {
        if (cut > base[0].probBp) cut = base[0].probBp;
        if (cut > 0) {
            base[0].probBp -= uint16(cut);
            base[at.normal].probBp += uint16(cut);
        }
    }

    function rules() external view returns (Rules memory r) {
        r.dailyPasses = dailyPasses;
        r.teamDivesPerDay = teamDivesPerDay;
        r.maxTeams = maxTeams;
        r.bondMax = bondMax;
        r.chartStability = chartStability;
        r.longMinCluster = longMinCluster;
        r.taxToPoolBp = taxToPoolBp;
        r.emissionBp = emissionBp;
        r.ceilingBp = ceilingBp;
        r.voyageSeconds = voyageSeconds;
        r.decisionCloseSeconds = decisionCloseSeconds;
        r.fallbackSeconds = fallbackSeconds;
        r.longVoyageSeconds = longVoyageSeconds;
        r.longTurnSeconds = longTurnSeconds;
        r.capPerPoint = capPerPoint;
    }

    /// @notice A destination on a day: threshold, reward weight (a light surge included) and today's light.
    function destOf(uint32 day, uint8 dest) external view returns (uint16 thresh, uint256 coef, uint8 light) {
        thresh = threshold[dest];
        coef = coefBp[dest];
        if (eventAt(day, dest) == SURGE) coef = coef * 105 / 100;
        light = lightOf(day, dest);
    }

    /// @notice Claim fee in basis points `elapsed` seconds after the previous claim.
    function claimFeeBp(uint256 elapsed) external view returns (uint256) {
        uint256 cut = (elapsed / 1 days) * claimFeeStepBp;
        return cut >= claimFeeMaxBp ? 0 : claimFeeMaxBp - cut;
    }

    // ---------------------------------------------------------------- decisions (mirrors choiceTable in rules.ts)

    struct Pos {
        uint256 slight; // "slight loss"; 0 = no such row (row 0 is always empty-handed)
        uint256 normal;
        uint256 good;
        uint256 great;
        uint256 legend;
    }

    /// @dev Row of each outcome. Tables whose second row tops out at x0.80 have a "slight loss" row.
    function _positions(Tier[] memory t) private pure returns (Pos memory at) {
        uint256 i = 1;
        if (t[1].hi <= 80) at.slight = i++;
        at.normal = i++;
        if (i < t.length) at.good = i++;
        if (i < t.length) at.great = i++;
        if (i < t.length) at.legend = i++;
    }

    /// @dev round(a / b) for a, b >= 0, halves up (Math.round on the website).
    function _round(uint256 a, uint256 b) private pure returns (uint256) {
        return (2 * a + b) / (2 * b);
    }

    function _avg2(Tier[] memory t) private pure returns (uint256 s) {
        for (uint256 i; i < t.length; ++i) s += uint256(t[i].probBp) * (uint256(t[i].lo) + t[i].hi);
    }

    /// @dev steady: cannot come back empty, nothing above "good"; the average becomes 97% of the plain dive.
    ///      bold: empty x1.5 + 4 points, great x2.5, legend x3, paid for by the middle rows; the average becomes 103%.
    function _reshape(Tier[] memory table, Pos memory at, bool steady) private pure returns (Tier[] memory t) {
        uint256 n = table.length;
        t = new Tier[](n);
        uint256[] memory p = new uint256[](n);
        for (uint256 i; i < n; ++i) {
            t[i] = Tier(table[i].probBp, table[i].lo, table[i].hi);
            p[i] = table[i].probBp;
        }
        if (steady) {
            p[1] += p[0];
            p[0] = 0;
            for (uint256 i = at.good + 1; at.good != 0 && i < n; ++i) {
                p[at.good] += p[i];
                p[i] = 0;
            }
        } else {
            uint256 donorPool = p[at.normal] + (at.slight != 0 ? p[at.slight] : 0) + (at.good != 0 ? p[at.good] : 0);
            _boldUp(p, at, donorPool);
            _boldDonate(p, table, at, donorPool);
        }
        for (uint256 i; i < n; ++i) t[i].probBp = uint16(p[i]);
        _rescale(t, (steady ? 97 : 103) * _avg2(table), 100 * _avg2(t));
    }

    /// @dev bold, step 1: empty-handed, great and legend rise toward their targets (scaled down by k when the middle
    ///      rows cannot pay for all of it: k = min(1, donor pool x 0.85 / need)).
    function _boldUp(uint256[] memory p, Pos memory at, uint256 donorPool) private pure {
        uint256[3] memory row = [uint256(0), at.great, at.legend];
        uint256[3] memory target;
        target[0] = _round(3 * p[0], 2) + 400;
        if (target[0] > 6000) target[0] = 6000;
        if (at.great != 0) target[1] = _round(5 * p[at.great], 2);
        if (at.legend != 0) target[2] = p[at.legend] * 3;
        uint256 need;
        for (uint256 j; j < 3; ++j) if (j == 0 || row[j] != 0) need += target[j] - p[row[j]];
        bool full = need == 0 || donorPool * 85 >= need * 100;
        for (uint256 j; j < 3; ++j) {
            if (j != 0 && row[j] == 0) continue;
            uint256 d = target[j] - p[row[j]];
            p[row[j]] += full ? d : _round(d * donorPool * 85, need * 100);
        }
    }

    /// @dev bold, step 2: the middle rows give back the excess over 100%, in proportion to their original size; the
    ///      last of them takes the rounding remainder.
    function _boldDonate(uint256[] memory p, Tier[] memory table, Pos memory at, uint256 donorPool) private pure {
        uint256 total;
        for (uint256 i; i < p.length; ++i) total += p[i];
        uint256 extra = total - BP;
        uint256 left = extra;
        uint256[3] memory donors = [at.slight, at.normal, at.good];
        uint256 last;
        for (uint256 j; j < 3; ++j) if (donors[j] != 0) last = j;
        for (uint256 j; j < 3; ++j) {
            if (donors[j] == 0) continue;
            uint256 take = j == last ? left : _round(extra * table[donors[j]].probBp, donorPool);
            p[donors[j]] -= take;
            left -= take;
        }
    }

    /// @dev Scales every multiplier by num/den so the table's average becomes the target.
    function _rescale(Tier[] memory t, uint256 num, uint256 den) private pure {
        for (uint256 i = 1; i < t.length; ++i) {
            uint256 lo = _round(uint256(t[i].lo) * num, den);
            uint256 hi = _round(uint256(t[i].hi) * num, den);
            t[i].lo = uint16(lo);
            t[i].hi = uint16(hi < lo ? lo : hi);
        }
    }

    // ---------------------------------------------------------------- owner

    function setTable(uint8 cluster, uint8 beam, Tier[] calldata tiers) external onlyOwner {
        if (cluster >= CLUSTERS || beam > 2 || tiers.length < 3 || tiers.length > 6) revert BadTable();
        uint256 probSum;
        uint256 evSum;
        uint8 key = cluster * 3 + beam;
        delete _tables[key];
        for (uint256 i; i < tiers.length; ++i) {
            Tier calldata t = tiers[i];
            if (t.lo > t.hi || t.hi > MAX_MULTIPLIER_X100) revert BadTable();
            if (i == 0 && (t.lo != 0 || t.hi != 0)) revert BadTable(); // row 0 is empty-handed
            probSum += t.probBp;
            evSum += uint256(t.probBp) * (uint256(t.lo) + t.hi);
            _tables[key].push(t);
        }
        if (probSum != BP || evSum != EV_TARGET) revert BadTable();
        emit TableSet(cluster, beam);
    }

    function setDestinations(uint16[24] calldata thresholds, uint32[24] calldata coefs) external onlyOwner {
        for (uint256 i; i < DESTINATIONS; ++i) {
            if (thresholds[i] == 0 || (i > 0 && thresholds[i] <= thresholds[i - 1])) revert OutOfBounds();
            if (coefs[i] < 5000 || coefs[i] > 30_000) revert OutOfBounds();
        }
        threshold = thresholds;
        coefBp = coefs;
        emit DestinationsSet();
    }

    function setCluster(uint8 cluster, uint16 levy, uint16 wear2, uint16 wear3) external onlyOwner {
        if (cluster >= CLUSTERS || levy > 2000 || uint256(wear2) + wear3 > 5000) revert OutOfBounds();
        levyBp[cluster] = levy;
        wear2Bp[cluster] = wear2;
        wear3Bp[cluster] = wear3;
        emit ClusterSet(cluster, levy, wear2, wear3);
    }

    function setEconomy(uint16 emission, uint16 ceiling, uint256 cap) external onlyOwner {
        if (emission < 20 || emission > 150 || ceiling < emission || ceiling > 300 || cap == 0 || cap > 1 ether) revert OutOfBounds();
        emissionBp = emission;
        ceilingBp = ceiling;
        capPerPoint = cap;
        emit EconomySet(emission, ceiling, cap);
    }

    function setFees(uint16 claimMax, uint16 claimStep, uint16 toPool, uint16 marketTax) external onlyOwner {
        if (claimMax > 3000 || claimStep == 0 || toPool < 5000 || toPool > BP || marketTax > 1000) revert OutOfBounds();
        claimFeeMaxBp = claimMax;
        claimFeeStepBp = claimStep;
        taxToPoolBp = toPool;
        marketTaxBp = marketTax;
        emit FeesSet(claimMax, claimStep, toPool, marketTax);
    }

    function setLimits(uint8 passes, uint8 teamDives, uint8 teams) external onlyOwner {
        if (passes == 0 || passes > 10 || teamDives == 0 || teamDives > passes || teams == 0 || teams > 20) revert OutOfBounds();
        dailyPasses = passes;
        teamDivesPerDay = teamDives;
        maxTeams = teams;
        emit LimitsSet(passes, teamDives, teams);
    }

    function setTiming(uint32 voyage, uint32 decisionClose, uint32 fallbackAfter) external onlyOwner {
        if (voyage < 30 || voyage > 1 hours || decisionClose >= voyage || fallbackAfter < 1 hours || fallbackAfter > 7 days) revert OutOfBounds();
        voyageSeconds = voyage;
        decisionCloseSeconds = decisionClose;
        fallbackSeconds = fallbackAfter;
        emit TimingSet(voyage, decisionClose, fallbackAfter);
    }

    function setDeepDive(uint32 voyage, uint32 turn, uint8 minCluster) external onlyOwner {
        if (voyage < 120 || voyage > 2 hours || turn <= decisionCloseSeconds || turn >= voyage || minCluster >= CLUSTERS) revert OutOfBounds();
        longVoyageSeconds = voyage;
        longTurnSeconds = turn;
        longMinCluster = minCluster;
        emit DeepDiveSet(voyage, turn, minCluster);
    }

    function setSupplies(uint16 oilBp, uint16 chartBp, uint8 chartPoints, uint8 maxBond) external onlyOwner {
        if (oilBp > 2000 || chartBp > 2000 || chartPoints > 10 || maxBond > 10) revert OutOfBounds();
        supplyPriceBp = [uint16(0), oilBp, chartBp];
        chartStability = chartPoints;
        bondMax = maxBond;
        emit SuppliesSet(oilBp, chartBp, chartPoints, maxBond);
    }

    /// @notice Points of empty-handed chance an echo moves to "normal" (0 turns echoes off).
    function setEcho(uint8 points) external onlyOwner {
        if (points > 5) revert OutOfBounds();
        echoStability = points;
        emit EchoSet(points);
    }
}
