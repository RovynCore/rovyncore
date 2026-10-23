// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LightdiveNFT3} from "./LightdiveNFT3.sol";
import {IRoundRandomness} from "./RoundRandomness.sol";

interface IBurnable {
    function burn(uint256 amount) external;
}

/// @notice Summons (sells) Lightdive v3 cards for RVYN, and renews docked cards.
///
/// Every card is drawn on its own (v3.3): rarity 48/29/15/7/1% for spires, 50/28/15/6/1% for prisms, 44/35/15/5/1% for
/// seekers; a prism's beam 40/40/20%; a seeker's light one of six. A card depends only on its own drand round, its
/// request and its place in the request, so the order or time of reveals changes nothing. (Up to v3.2 cards came from
/// shared decks, which let a reveal's timing change a card.)
///
/// A summon takes payment, mints its cards sealed at once (their ids are known) and fixes a drand round a few seconds
/// ahead. Once drand has published that round, the cards can be unsealed with the round's signature: by anyone with
/// `reveal`, and by the player's next summon, dive, team change, claim or listing, which carry the proofs, so revealing
/// needs no transaction of its own. Nobody, including us, can know the round before it is published, so nobody can pick
/// their cards; and since a revealed card is fixed by its round, waiting to reveal gains nothing. A request left without
/// a proof for `FALLBACK_AFTER` may be unsealed as the weakest possible cards, never better than any draw.
///
/// Every payment is split 70% to the Core Light Pool, 15% burned and 15% to the treasury. Prices start at 50/30/20 RVYN
/// and may later follow the RVYN market price, but only within 10%-200% of the launch price and 10% per day.
/// @dev Candidate, unaudited.
contract LightdiveMinter3 is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant SPIRE = 0;
    uint8 public constant PRISM = 1;
    uint8 public constant SEEKER = 2;
    uint256 public constant BP = 10_000;
    uint256 public constant EARLY_WINDOW = 48 hours;
    uint16 public constant EARLY_SPIRES_PER_WALLET = 3;
    uint256 public constant REVEAL_DELAY = 6; // the round drawn is the first published at least this long after a request
    uint256 public constant FALLBACK_AFTER = 7 days; // without a drand proof by then: the weakest cards (v3.3)
    uint256 public constant DOCK_SECONDS = 7 days;
    uint16 public constant POOL_BP = 7000;
    uint16 public constant BURN_BP = 1500; // the treasury receives the rest
    uint16 public constant RENEW_BP = 5000; // renewal costs half the current summon price

    struct Request {
        address player;
        uint8 kind;
        uint16 qty;
        bool revealed;
        uint64 round;
        uint64 requestedAt;
        uint256 firstId; // the cards are firstId .. firstId + qty - 1, minted sealed at the request
    }

    IERC20 public immutable rvyn;
    LightdiveNFT3 public immutable nft;
    IRoundRandomness public immutable rng;
    address public immutable pool;
    address public treasury;
    /// @notice May move prices within the daily and overall bounds (an automated job reading the RVYN pool price).
    address public pricer;

    /// @notice Summons open at this time; the first EARLY_WINDOW limits spires per wallet. 0 = closed.
    uint256 public saleStart;
    uint256[3] public launchPrice = [uint256(50 ether), 30 ether, 20 ether];
    uint256[3] public price = [uint256(50 ether), 30 ether, 20 ether];
    uint32[3] public priceDay; // UTC day of the last price move, per kind
    uint16[3] public voyages = [uint16(180), 135, 45];

    Request[] internal _requests;
    mapping(address => uint16) public earlySpires;

    // Chance of each rarity in basis points (Glimmer .. Corestar), per kind.
    uint16[5][3] internal RARITY_BP = [[uint16(4800), 2900, 1500, 700, 100], [uint16(5000), 2800, 1500, 600, 100], [uint16(4400), 3500, 1500, 500, 100]];
    // Power range per rarity, [lo, hi] inclusive: bands touch, so a rarer card is always stronger.
    uint16[2][5] internal SPIRE_POWER = [[uint16(41), 55], [uint16(56), 75], [uint16(76), 95], [uint16(96), 115], [uint16(116), 140]];
    uint16[2][5] internal PRISM_POWER = [[uint16(10), 19], [uint16(20), 29], [uint16(30), 39], [uint16(40), 49], [uint16(50), 60]];
    uint16[2][5] internal SEEKER_POWER = [[uint16(10), 39], [uint16(40), 79], [uint16(80), 119], [uint16(120), 159], [uint16(160), 200]];

    event TreasurySet(address treasury);
    event PricerSet(address pricer);
    event SaleOpened(uint256 start);
    event PriceSet(uint8 indexed kind, uint256 price);
    event SummonRequested(uint256 indexed requestId, address indexed player, uint8 kind, uint16 qty, uint64 round, uint256 paid, uint256 firstId);
    event SummonRevealed(uint256 indexed requestId, bool fallbackUsed);
    event Renewal(uint256 indexed id, address indexed owner, uint256 paid);

    error BadKind();
    error BadQuantity();
    error SaleClosed();
    error EarlyLimit();
    error SoldOut();
    error AlreadyRevealed();
    error NotYet();
    error NotOwner();
    error CannotRenew();
    error NotPricer();
    error BadPrice();

    constructor(
        address owner_,
        IERC20 rvyn_,
        LightdiveNFT3 nft_,
        IRoundRandomness rng_,
        address pool_,
        address treasury_
    ) Ownable(owner_) {
        rvyn = rvyn_;
        nft = nft_;
        rng = rng_;
        pool = pool_;
        treasury = treasury_;
    }

    // ---------------------------------------------------------------- views

    /// @notice Chance of each rarity (basis points) for a kind.
    function rarityOdds(uint8 kind) external view returns (uint16[5] memory) {
        return RARITY_BP[kind];
    }

    function request(uint256 id) external view returns (Request memory) {
        return _requests[id];
    }

    function requestCount() external view returns (uint256) {
        return _requests.length;
    }

    function maxPerTx(uint8 kind) public pure returns (uint16) {
        return kind == SPIRE ? 3 : kind == PRISM ? 5 : 10;
    }

    function renewPrice(uint8 kind) public view returns (uint256) {
        return price[kind] * RENEW_BP / BP;
    }

    // ---------------------------------------------------------------- players

    /// @notice Summons `qty` cards of `kind`. `revealIds` and `proofs`: earlier requests (anyone's) to unseal first,
    /// with their rounds' signatures; any already revealed is skipped.
    function summon(uint8 kind, uint16 qty, uint256[] calldata revealIds, bytes[] calldata proofs) external whenNotPaused nonReentrant returns (uint256 id) {
        _revealAll(revealIds, proofs);
        if (kind > SEEKER) revert BadKind();
        if (qty == 0 || qty > maxPerTx(kind)) revert BadQuantity();
        if (saleStart == 0 || block.timestamp < saleStart) revert SaleClosed();
        if (kind == SPIRE && block.timestamp < saleStart + EARLY_WINDOW) {
            if (earlySpires[msg.sender] + qty > EARLY_SPIRES_PER_WALLET) revert EarlyLimit();
            earlySpires[msg.sender] += qty;
        }
        if (uint256(nft.alive(kind)) + qty > nft.maxAlive(kind)) revert SoldOut();

        uint256 total = price[kind] * qty;
        _collect(total);

        id = _requests.length;
        uint64 round = rng.roundAt(block.timestamp + REVEAL_DELAY);
        uint256 first = nft.mintSealed(msg.sender, kind, voyages[kind]);
        for (uint256 i = 1; i < qty; ++i) nft.mintSealed(msg.sender, kind, voyages[kind]);
        _requests.push(Request({
            player: msg.sender,
            kind: kind,
            qty: qty,
            revealed: false,
            round: round,
            requestedAt: uint64(block.timestamp),
            firstId: first
        }));
        emit SummonRequested(id, msg.sender, kind, qty, round, total, first);
    }

    /// @notice Unseals the cards of a request with its drand round. Anyone may call it once the round is published.
    function reveal(uint256 id, bytes calldata proof) external nonReentrant {
        Request storage req = _requests[id];
        if (req.revealed) revert AlreadyRevealed();
        _draw(id, req, rng.randomness(req.round, proof), false);
    }

    /// @notice Unseals several requests, skipping any already revealed. Expedition3 and the market call it with the
    /// proofs a player's transaction carries.
    function revealPending(uint256[] calldata ids, bytes[] calldata proofs) external nonReentrant {
        _revealAll(ids, proofs);
    }

    /// @notice A request with no proof `FALLBACK_AFTER` after its round is unsealed as the weakest cards of its kind
    /// (Glimmer, lowest power), so leaving a request unrevealed is never better than revealing it. Only the player
    /// who summoned may use it: anyone else could otherwise erase cards the player has already seen but not sealed
    /// on chain yet (v3.3).
    function revealFallback(uint256 id) external nonReentrant {
        Request storage req = _requests[id];
        if (msg.sender != req.player) revert NotOwner();
        if (req.revealed) revert AlreadyRevealed();
        if (block.timestamp < rng.roundTime(req.round) + FALLBACK_AFTER) revert NotYet();
        _draw(id, req, bytes32(0), true);
    }

    /// @notice Renews a docked card once, within its 7 docking days, for half the current summon price.
    function renew(uint256 id) external whenNotPaused nonReentrant {
        if (nft.ownerOf(id) != msg.sender) revert NotOwner();
        LightdiveNFT3.Attributes memory a = nft.attributes(id);
        if (a.renewed || a.dockedAt == 0 || block.timestamp >= a.dockedAt + DOCK_SECONDS) revert CannotRenew();
        uint256 cost = renewPrice(a.kind);
        _collect(cost);
        nft.renew(id, voyages[a.kind]);
        emit Renewal(id, msg.sender, cost);
    }

    // ---------------------------------------------------------------- pricing

    /// @notice Moves a summon price: at most once per UTC day per kind, by at most 10%, and always within 10%-200% of
    /// the launch price.
    function setPrice(uint8 kind, uint256 newPrice) external {
        if (msg.sender != pricer) revert NotPricer();
        if (kind > SEEKER) revert BadKind();
        uint32 day = uint32(block.timestamp / 1 days);
        uint256 cur = price[kind];
        if (priceDay[kind] == day) revert BadPrice();
        if (newPrice * 10 > cur * 11 || newPrice * 10 < cur * 9) revert BadPrice();
        if (newPrice * 10 < launchPrice[kind] || newPrice > launchPrice[kind] * 2) revert BadPrice();
        priceDay[kind] = day;
        price[kind] = newPrice;
        emit PriceSet(kind, newPrice);
    }

    // ---------------------------------------------------------------- owner

    function openSale(uint256 start) external onlyOwner {
        if (saleStart != 0) revert SaleClosed();
        saleStart = start == 0 ? block.timestamp : start;
        emit SaleOpened(saleStart);
    }

    function setTreasury(address treasury_) external onlyOwner {
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    function setPricer(address pricer_) external onlyOwner {
        pricer = pricer_;
        emit PricerSet(pricer_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------- internal

    function _collect(uint256 total) internal {
        rvyn.safeTransferFrom(msg.sender, address(this), total);
        uint256 toPool = total * POOL_BP / BP;
        uint256 toBurn = total * BURN_BP / BP;
        rvyn.safeTransfer(pool, toPool);
        if (toBurn > 0) IBurnable(address(rvyn)).burn(toBurn);
        uint256 toTreasury = total - toPool - toBurn;
        if (toTreasury > 0) rvyn.safeTransfer(treasury, toTreasury);
    }

    function _revealAll(uint256[] calldata ids, bytes[] calldata proofs) internal {
        if (ids.length != proofs.length) revert BadQuantity();
        for (uint256 i; i < ids.length; ++i) {
            Request storage req = _requests[ids[i]];
            if (!req.revealed) _draw(ids[i], req, rng.randomness(req.round, proofs[i]), false);
        }
    }

    function _draw(uint256 id, Request storage req, bytes32 r, bool fallbackUsed) internal {
        req.revealed = true;
        for (uint256 i; i < req.qty; ++i) {
            uint256 card = req.firstId + i;
            // a card sent home before its reveal (it cannot be: sealed cards never sail) would simply be skipped
            if (!nft.exists(card)) continue;
            if (fallbackUsed) {
                uint16[2] memory low = _band(req.kind, 0);
                nft.unseal(card, 0, req.kind == SPIRE ? 1 : 0, low[0], 0);
            } else {
                (uint8 rarity, uint8 trait, uint16 power, uint64 dna) = _card(req.kind, uint256(keccak256(abi.encode(r, id, i))));
                nft.unseal(card, rarity, trait, power, dna);
            }
        }
        emit SummonRevealed(id, fallbackUsed);
    }

    function _band(uint8 kind, uint8 rarity) internal view returns (uint16[2] memory) {
        return kind == SPIRE ? SPIRE_POWER[rarity] : kind == PRISM ? PRISM_POWER[rarity] : SEEKER_POWER[rarity];
    }

    /// @dev One card from its own seed: rarity by the kind's odds, power within the rarity's band, then the trait
    /// (a spire's berths = rarity + 1, a prism's beam 40/40/20%, a seeker's light one of six). The website draws the
    /// same way (lib/lightdive-v3/onchain.ts, drawCard).
    function _card(uint8 kind, uint256 seed) internal view returns (uint8 rarity, uint8 trait, uint16 power, uint64 dna) {
        uint256 u1 = uint256(keccak256(abi.encode(seed, 1)));
        uint256 u2 = uint256(keccak256(abi.encode(seed, 2)));
        uint256 u3 = uint256(keccak256(abi.encode(seed, 3)));
        uint256 x = u1 % BP;
        uint16[5] memory odds = RARITY_BP[kind];
        for (; rarity < 4; ++rarity) {
            if (x < odds[rarity]) break;
            x -= odds[rarity];
        }
        uint16[2] memory band = _band(kind, rarity);
        power = uint16(band[0] + u2 % (uint256(band[1]) - band[0] + 1));
        dna = uint64(u3 >> 128);
        if (kind == SPIRE) trait = rarity + 1;
        else if (kind == PRISM) { uint256 b = u3 % 10; trait = b < 4 ? 0 : b < 8 ? 1 : 2; }
        else trait = uint8((u2 >> 64) % 6);
    }
}
