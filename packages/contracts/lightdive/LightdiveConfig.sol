// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Every tunable Lightdive parameter, in one place, with hard bounds. Defaults are the
/// v1.0 values from docs/lightdive (Appendix A). The owner is meant to be a multisig behind a
/// 72-hour TimelockController on mainnet.
/// @dev Candidate, unaudited.
contract LightdiveConfig is Ownable2Step {
    uint256 public constant BP = 10_000;
    /// @dev A beam's average multiplier must be exactly 1.00: sum(prob * (lo + hi)) == BP * 100 * 2.
    uint256 public constant BEAM_EV_TARGET = 2 * BP * 100;
    uint16 public constant MAX_MULTIPLIER_X100 = 1000; // 10x, owner decision 2026-10-06
    uint8 public constant BEAMS = 3; // 0 wide, 1 focused, 2 needle
    uint8 public constant DEPTHS = 6;

    struct Tier {
        uint16 probBp;
        uint16 lo; // multiplier x100
        uint16 hi; // multiplier x100, inclusive
    }

    // Core Light Pool
    uint16 public emissionRateBp = 100; // 1.00% of the available pool per day
    uint256 public yieldCapPerPoint = 0.18 ether; // max RVYN per base Lightdust point per day

    // Minting (kind: 0 spire, 1 prism, 2 seeker)
    uint256[3] public price = [uint256(300 ether), 120 ether, 40 ether];
    uint16 public splitPoolBp = 7000;
    uint16 public splitBurnBp = 1500; // treasury receives the rest
    uint16 public firstDiscountBp = 1000; // first unit of each kind per wallet, paid out of the treasury share

    // Voyages given to newly minted NFTs
    uint16[3] public voyages = [uint16(120), 30, 10];

    // Depths I-VI
    uint32[6] public depthMinLuminance = [uint32(0), 120, 220, 380, 600, 850];
    uint16[6] public depthCoefBp = [uint16(10_000), 10_300, 10_600, 11_000, 11_500, 12_000];

    // Claim fee ("light decay"): max fee right after the previous claim, falling to zero linearly
    uint16 public claimFeeMaxBp = 1500;
    uint16 public claimFeeDecayDays = 15;

    mapping(uint8 => Tier[]) private _beams;

    event EmissionRateSet(uint16 bp);
    event YieldCapSet(uint256 perPoint);
    event PriceSet(uint8 kind, uint256 price);
    event SplitSet(uint16 poolBp, uint16 burnBp, uint16 firstDiscountBp);
    event VoyagesSet(uint8 kind, uint16 voyages);
    event DepthSet(uint8 depth, uint32 minLuminance, uint16 coefBp);
    event ClaimFeeSet(uint16 maxBp, uint16 decayDays);
    event BeamSet(uint8 beam);

    error OutOfBounds();
    error BadBeam();

    constructor(address owner_) Ownable(owner_) {
        Tier[] memory wide = new Tier[](3);
        wide[0] = Tier(1500, 0, 0);
        wide[1] = Tier(7200, 100, 120);
        wide[2] = Tier(1300, 140, 180);
        _setBeam(0, wide);

        Tier[] memory focused = new Tier[](4);
        focused[0] = Tier(2250, 0, 0);
        focused[1] = Tier(6050, 100, 120);
        focused[2] = Tier(1330, 150, 200);
        focused[3] = Tier(370, 250, 300);
        _setBeam(1, focused);

        Tier[] memory needle = new Tier[](5);
        needle[0] = Tier(4500, 0, 0);
        needle[1] = Tier(2700, 100, 120);
        needle[2] = Tier(1850, 180, 220);
        needle[3] = Tier(870, 260, 340);
        needle[4] = Tier(80, 800, 1000);
        _setBeam(2, needle);
    }

    // ---------------------------------------------------------------- views

    function beamTiers(uint8 beam) external view returns (Tier[] memory) {
        return _beams[beam];
    }

    function prices() external view returns (uint256[3] memory) {
        return price;
    }

    /// @notice Picks the outcome tier with the low bits of `r` and a multiplier inside that
    /// tier's range with the high bits. Each value in the range is equally likely.
    function drawMultiplier(uint8 beam, uint256 r) external view returns (uint8 tier, uint16 multX100) {
        Tier[] storage tiers = _beams[beam];
        uint256 x = r % BP;
        uint256 acc;
        for (uint256 i; i < tiers.length; ++i) {
            acc += tiers[i].probBp;
            if (x < acc) {
                Tier storage t = tiers[i];
                uint256 span = uint256(t.hi) - t.lo + 1;
                return (uint8(i), uint16(t.lo + (r >> 128) % span));
            }
        }
        revert BadBeam(); // unreachable: probabilities always sum to BP
    }

    /// @notice Claim fee in basis points for a claim made `elapsed` seconds after the previous one.
    function claimFeeBp(uint256 elapsed) external view returns (uint256) {
        uint256 daysElapsed = elapsed / 1 days;
        if (daysElapsed >= claimFeeDecayDays) return 0;
        return uint256(claimFeeMaxBp) * (claimFeeDecayDays - daysElapsed) / claimFeeDecayDays;
    }

    // ---------------------------------------------------------------- owner

    function setEmissionRate(uint16 bp) external onlyOwner {
        if (bp < 20 || bp > 150) revert OutOfBounds();
        emissionRateBp = bp;
        emit EmissionRateSet(bp);
    }

    function setYieldCap(uint256 perPoint) external onlyOwner {
        if (perPoint == 0 || perPoint > 10 ether) revert OutOfBounds();
        yieldCapPerPoint = perPoint;
        emit YieldCapSet(perPoint);
    }

    function setPrice(uint8 kind, uint256 newPrice) external onlyOwner {
        if (kind > 2 || newPrice == 0 || newPrice > 1_000_000 ether) revert OutOfBounds();
        price[kind] = newPrice;
        emit PriceSet(kind, newPrice);
    }

    function setSplit(uint16 poolBp, uint16 burnBp, uint16 discountBp) external onlyOwner {
        if (poolBp < 4000 || uint256(poolBp) + burnBp > BP) revert OutOfBounds();
        if (discountBp > BP - poolBp - burnBp) revert OutOfBounds(); // the discount comes out of the treasury share
        splitPoolBp = poolBp;
        splitBurnBp = burnBp;
        firstDiscountBp = discountBp;
        emit SplitSet(poolBp, burnBp, discountBp);
    }

    function setVoyages(uint8 kind, uint16 count) external onlyOwner {
        if (kind > 2 || count == 0 || count > 1000) revert OutOfBounds();
        voyages[kind] = count;
        emit VoyagesSet(kind, count);
    }

    function setDepth(uint8 depth, uint32 minLuminance, uint16 coefBp) external onlyOwner {
        if (depth >= DEPTHS || coefBp < 10_000 || coefBp > 15_000) revert OutOfBounds();
        depthMinLuminance[depth] = minLuminance;
        depthCoefBp[depth] = coefBp;
        emit DepthSet(depth, minLuminance, coefBp);
    }

    function setClaimFee(uint16 maxBp, uint16 decayDays) external onlyOwner {
        if (maxBp > 3000 || decayDays == 0 || decayDays > 60) revert OutOfBounds();
        claimFeeMaxBp = maxBp;
        claimFeeDecayDays = decayDays;
        emit ClaimFeeSet(maxBp, decayDays);
    }

    function setBeam(uint8 beam, Tier[] calldata tiers) external onlyOwner {
        _setBeam(beam, tiers);
    }

    function _setBeam(uint8 beam, Tier[] memory tiers) internal {
        if (beam >= BEAMS || tiers.length == 0 || tiers.length > 8) revert BadBeam();
        uint256 probSum;
        uint256 evSum;
        delete _beams[beam];
        for (uint256 i; i < tiers.length; ++i) {
            Tier memory t = tiers[i];
            if (t.lo > t.hi || t.hi > MAX_MULTIPLIER_X100 || t.probBp == 0) revert BadBeam();
            probSum += t.probBp;
            evSum += uint256(t.probBp) * (uint256(t.lo) + t.hi);
            _beams[beam].push(t);
        }
        if (probSum != BP || evSum != BEAM_EV_TARGET) revert BadBeam();
        emit BeamSet(beam);
    }
}
