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
/// Cards are drawn from decks: each deck of 1000 holds an exact number of cards per rarity (48/29/15/7/1% for spires,
/// 50/28/15/6/1% for prisms, 44/35/15/5/1% for seekers; prisms also an exact 40/40/20% split of beams per rarity). A
/// drawn card is gone; an empty deck is replaced by a new one with the same composition, so the odds are exact and can
/// be read from `deckOf`.
///
/// A summon takes two steps. `request` takes the payment and fixes a drand round a few seconds ahead; once drand has
/// published that round, anyone can `reveal` the request with the round's signature and the cards are drawn from it.
/// Nobody, including us, can know the round before it is published, so nobody can pick their cards.
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
    uint32 public constant DECK_SIZE = 1000;
    uint256 public constant EARLY_WINDOW = 48 hours;
    uint16 public constant EARLY_SPIRES_PER_WALLET = 3;
    uint256 public constant REVEAL_DELAY = 6; // the round drawn is the first published at least this long after a request
    uint256 public constant FALLBACK_AFTER = 1 days; // without a drand proof by then, the request's own entropy is used
    uint256 public constant DOCK_SECONDS = 7 days;
    uint16 public constant POOL_BP = 7000;
    uint16 public constant BURN_BP = 1500; // the treasury receives the rest
    uint16 public constant RENEW_BP = 5000; // renewal costs half the current summon price

    struct Deck {
        uint32 number;
        uint32 remaining;
        uint32[5] rarityLeft;
        uint32[3][5] beamLeft; // prisms only: per rarity, per beam (wide, focused, needle)
    }

    struct Request {
        address player;
        uint8 kind;
        uint16 qty;
        bool revealed;
        uint64 round;
        uint64 requestedAt;
        bytes32 entropy;
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

    Deck[3] internal _decks;
    Request[] internal _requests;
    uint32[3] public pending; // requested but not yet revealed, counted against the NFT caps
    mapping(address => uint16) public earlySpires;

    // Power range per rarity, [lo, hi] inclusive: bands touch, so a rarer card is always stronger.
    uint16[2][5] internal SPIRE_POWER = [[uint16(41), 55], [uint16(56), 75], [uint16(76), 95], [uint16(96), 115], [uint16(116), 140]];
    uint16[2][5] internal PRISM_POWER = [[uint16(10), 19], [uint16(20), 29], [uint16(30), 39], [uint16(40), 49], [uint16(50), 60]];
    uint16[2][5] internal SEEKER_POWER = [[uint16(10), 39], [uint16(40), 79], [uint16(80), 119], [uint16(120), 159], [uint16(160), 200]];

    event TreasurySet(address treasury);
    event PricerSet(address pricer);
    event SaleOpened(uint256 start);
    event PriceSet(uint8 indexed kind, uint256 price);
    event SummonRequested(uint256 indexed requestId, address indexed player, uint8 kind, uint16 qty, uint64 round, uint256 paid);
    event SummonRevealed(uint256 indexed requestId, bool fallbackUsed);
    event DeckOpened(uint8 indexed kind, uint32 number);
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
        for (uint8 kind; kind < 3; ++kind) _openDeck(kind);
    }

    // ---------------------------------------------------------------- views

    function deckOf(uint8 kind) external view returns (Deck memory) {
        return _decks[kind];
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

    function summon(uint8 kind, uint16 qty) external whenNotPaused nonReentrant returns (uint256 id) {
        if (kind > SEEKER) revert BadKind();
        if (qty == 0 || qty > maxPerTx(kind)) revert BadQuantity();
        if (saleStart == 0 || block.timestamp < saleStart) revert SaleClosed();
        if (kind == SPIRE && block.timestamp < saleStart + EARLY_WINDOW) {
            if (earlySpires[msg.sender] + qty > EARLY_SPIRES_PER_WALLET) revert EarlyLimit();
            earlySpires[msg.sender] += qty;
        }
        if (uint256(nft.alive(kind)) + pending[kind] + qty > nft.maxAlive(kind)) revert SoldOut();
        pending[kind] += qty;

        uint256 total = price[kind] * qty;
        _collect(total);

        id = _requests.length;
        uint64 round = rng.roundAt(block.timestamp + REVEAL_DELAY);
        _requests.push(Request({
            player: msg.sender,
            kind: kind,
            qty: qty,
            revealed: false,
            round: round,
            requestedAt: uint64(block.timestamp),
            entropy: keccak256(abi.encode(blockhash(block.number - 1), msg.sender, id))
        }));
        emit SummonRequested(id, msg.sender, kind, qty, round, total);
    }

    /// @notice Draws the cards of a request with its drand round. Anyone may call it once the round is published.
    function reveal(uint256 id, bytes calldata proof) external nonReentrant {
        Request storage req = _requests[id];
        if (req.revealed) revert AlreadyRevealed();
        _draw(id, req, rng.randomness(req.round, proof), false);
    }

    /// @notice If drand never published the round (or nobody brought it) for a day, the request's own entropy is used.
    function revealFallback(uint256 id) external nonReentrant {
        Request storage req = _requests[id];
        if (req.revealed) revert AlreadyRevealed();
        if (block.timestamp < rng.roundTime(req.round) + FALLBACK_AFTER) revert NotYet();
        _draw(id, req, keccak256(abi.encode(req.entropy, "lightdive.fallback")), true);
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

    function _draw(uint256 id, Request storage req, bytes32 r, bool fallbackUsed) internal {
        req.revealed = true;
        pending[req.kind] -= req.qty;
        for (uint256 i; i < req.qty; ++i) {
            nft.mint(req.player, _card(req.kind, uint256(keccak256(abi.encode(r, id, i)))));
        }
        emit SummonRevealed(id, fallbackUsed);
    }

    function _openDeck(uint8 kind) internal {
        Deck storage d = _decks[kind];
        d.number += 1;
        d.remaining = DECK_SIZE;
        if (kind == SPIRE) {
            d.rarityLeft = [uint32(480), 290, 150, 70, 10];
        } else if (kind == PRISM) {
            d.rarityLeft = [uint32(500), 280, 150, 60, 10];
            for (uint256 r; r < 5; ++r) {
                uint32 n = d.rarityLeft[r];
                uint32 wide = n * 4 / 10;
                uint32 focused = n * 4 / 10;
                d.beamLeft[r] = [wide, focused, n - wide - focused];
            }
        } else {
            d.rarityLeft = [uint32(440), 350, 150, 50, 10];
        }
        emit DeckOpened(kind, d.number);
    }

    function _pick5(uint32[5] storage left, uint256 r) internal returns (uint8) {
        uint256 total;
        for (uint256 i; i < 5; ++i) total += left[i];
        uint256 x = r % total;
        for (uint8 i; i < 5; ++i) {
            if (x < left[i]) {
                left[i] -= 1;
                return i;
            }
            x -= left[i];
        }
        revert SoldOut(); // unreachable
    }

    function _pick3(uint32[3] storage left, uint256 r) internal returns (uint8) {
        uint256 x = r % (uint256(left[0]) + left[1] + left[2]);
        for (uint8 i; i < 3; ++i) {
            if (x < left[i]) {
                left[i] -= 1;
                return i;
            }
            x -= left[i];
        }
        revert SoldOut(); // unreachable
    }

    function _card(uint8 kind, uint256 seed) internal returns (LightdiveNFT3.Attributes memory a) {
        Deck storage d = _decks[kind];
        if (d.remaining == 0) _openDeck(kind);
        uint256 u1 = uint256(keccak256(abi.encode(seed, 1)));
        uint256 u2 = uint256(keccak256(abi.encode(seed, 2)));
        uint256 u3 = uint256(keccak256(abi.encode(seed, 3)));
        uint8 rarity = _pick5(d.rarityLeft, u1);
        d.remaining -= 1;
        uint16[2] memory band = kind == SPIRE ? SPIRE_POWER[rarity] : kind == PRISM ? PRISM_POWER[rarity] : SEEKER_POWER[rarity];
        a.kind = kind;
        a.rarity = rarity;
        a.power = uint16(band[0] + u2 % (uint256(band[1]) - band[0] + 1));
        a.voyagesLeft = voyages[kind];
        a.deck = d.number;
        a.dna = uint64(u3 >> 128);
        a.trait = kind == SPIRE ? rarity + 1 : kind == PRISM ? _pick3(d.beamLeft[rarity], u3) : uint8((u2 >> 64) % 6);
    }
}
