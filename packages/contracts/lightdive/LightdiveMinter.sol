// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LightdiveConfig} from "./LightdiveConfig.sol";
import {LightdiveNFT} from "./LightdiveNFT.sol";
import {RandomnessBeacon} from "./RandomnessBeacon.sol";

interface IBurnableERC20 {
    function burn(uint256 amount) external;
}

/// @notice Sells Lightdive NFTs for RVYN with deck draws.
/// Each kind is drawn from a deck with an exact number of cards per rarity (and, for Radiant
/// cards, per special edition / signature background; for prisms, per beam). A card drawn is gone;
/// when a deck is empty the next one opens with the same composition. The live odds are therefore
/// `left / remaining` and can be read from `deckOf`.
/// Minting is two-step: `requestMint` takes payment, `fulfill` (callable by anyone) draws the cards
/// once the hour's randomness is revealed.
/// @dev Candidate, unaudited.
contract LightdiveMinter is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint8 public constant SPIRE = 0;
    uint8 public constant PRISM = 1;
    uint8 public constant SEEKER = 2;
    uint256 public constant EARLY_WINDOW = 48 hours;
    uint16 public constant EARLY_SPIRES_PER_WALLET = 3;

    struct Deck {
        uint32 number;
        uint32 remaining;
        uint32[5] rarityLeft;
        uint32[2] specialLeft; // Radiant spire / prism special editions
        uint32 signatureLeft; // Radiant seeker signature backgrounds
        uint32[3][5] beamLeft; // prisms only: per rarity, per beam (wide, focused, needle)
    }

    struct Request {
        address player;
        uint8 kind;
        uint16 qty;
        uint64 hour;
        bool fulfilled;
        bytes32 entropy;
    }

    IERC20 public immutable rvyn;
    LightdiveNFT public immutable nft;
    LightdiveConfig public immutable config;
    RandomnessBeacon public immutable beacon;
    address public immutable pool;
    address public treasury;

    /// @notice Spire sales open at this time; the first EARLY_WINDOW limits each wallet. 0 = closed.
    uint256 public spireSaleStart;

    Deck[3] internal _decks;
    Request[] internal _requests;
    uint32[3] public pending; // requested but not yet fulfilled, counted against maxAlive
    mapping(address => mapping(uint8 => bool)) public firstMintUsed;
    mapping(address => uint16) public earlySpires;

    // Deck composition (v1.0). Rarity order: Glimmer, Vein, Clear, Spectral, Radiant.
    uint32[3] public deckSize = [uint32(3000), 6000, 10_000];
    uint16[5] internal SPIRE_LUM = [40, 70, 110, 160, 230];
    uint16[5] internal PRISM_LUM = [10, 20, 32, 48, 70];
    uint16[5] internal SEEKER_LUM_LO = [20, 32, 48, 75, 120];
    uint16[5] internal SEEKER_LUM_HI = [30, 45, 68, 100, 160];
    uint16 public constant SPECIAL_BONUS_BP = 400; // special editions: +4% luminance

    event TreasurySet(address treasury);
    event SpireSaleOpened(uint256 start);
    event MintRequested(uint256 indexed requestId, address indexed player, uint8 kind, uint16 qty, uint64 hour, uint256 paid, uint256 discount);
    event MintFulfilled(uint256 indexed requestId, bool fallbackUsed);
    event DeckOpened(uint8 indexed kind, uint32 number);

    error BadKind();
    error BadQuantity();
    error SaleClosed();
    error EarlyLimit();
    error SoldOut();
    error NoRandomnessScheduled();
    error NotReady();
    error AlreadyFulfilled();

    constructor(
        address owner_,
        IERC20 rvyn_,
        LightdiveNFT nft_,
        LightdiveConfig config_,
        RandomnessBeacon beacon_,
        address pool_,
        address treasury_
    ) Ownable(owner_) {
        rvyn = rvyn_;
        nft = nft_;
        config = config_;
        beacon = beacon_;
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

    /// @notice Price the player would pay now for `qty` of `kind`, and the discount included.
    function quote(address player, uint8 kind, uint16 qty) public view returns (uint256 total, uint256 discount) {
        uint256 unit = config.price(kind);
        total = unit * qty;
        if (qty > 0 && !firstMintUsed[player][kind]) {
            discount = unit * config.firstDiscountBp() / config.BP();
            total -= discount;
        }
    }

    // ---------------------------------------------------------------- player

    function requestMint(uint8 kind, uint16 qty) external whenNotPaused nonReentrant returns (uint256 id) {
        if (kind > SEEKER) revert BadKind();
        if (qty == 0 || qty > maxPerTx(kind)) revert BadQuantity();
        uint64 hour = beacon.currentHour();
        if (!beacon.hasCommitment(hour)) revert NoRandomnessScheduled();

        if (kind == SPIRE) {
            if (spireSaleStart == 0 || block.timestamp < spireSaleStart) revert SaleClosed();
            if (block.timestamp < spireSaleStart + EARLY_WINDOW) {
                if (earlySpires[msg.sender] + qty > EARLY_SPIRES_PER_WALLET) revert EarlyLimit();
                earlySpires[msg.sender] += qty;
            }
        }
        if (uint256(nft.alive(kind)) + pending[kind] + qty > nft.maxAlive(kind)) revert SoldOut();
        pending[kind] += qty;

        (uint256 total, uint256 discount) = quote(msg.sender, kind, qty);
        if (discount > 0) firstMintUsed[msg.sender][kind] = true;
        _collect(total, config.price(kind) * qty);

        id = _requests.length;
        _requests.push(Request({
            player: msg.sender,
            kind: kind,
            qty: qty,
            hour: hour,
            fulfilled: false,
            entropy: keccak256(abi.encode(blockhash(block.number - 1), msg.sender, id))
        }));
        emit MintRequested(id, msg.sender, kind, qty, hour, total, discount);
    }

    /// @notice Draws and mints the cards of a request. Anyone may call it once randomness is ready.
    function fulfill(uint256 id) external nonReentrant {
        Request storage req = _requests[id];
        if (req.fulfilled) revert AlreadyFulfilled();
        (bool ready, bool fallbackUsed, uint256 r) = beacon.randomFor(req.hour, req.entropy);
        if (!ready) revert NotReady();
        req.fulfilled = true;
        pending[req.kind] -= req.qty;
        for (uint256 i; i < req.qty; ++i) {
            nft.mint(req.player, _draw(req.kind, uint256(keccak256(abi.encode(r, i)))));
        }
        emit MintFulfilled(id, fallbackUsed);
    }

    // ---------------------------------------------------------------- owner

    function openSpireSale(uint256 start) external onlyOwner {
        if (spireSaleStart != 0) revert SaleClosed();
        spireSaleStart = start == 0 ? block.timestamp : start;
        emit SpireSaleOpened(spireSaleStart);
    }

    function setTreasury(address treasury_) external onlyOwner {
        treasury = treasury_;
        emit TreasurySet(treasury_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------- internal

    /// @dev Pool and burn shares are computed on the list price; the first-mint discount only
    /// reduces the treasury share (LightdiveConfig guarantees discount <= treasury share).
    function _collect(uint256 total, uint256 listPrice) internal {
        rvyn.safeTransferFrom(msg.sender, address(this), total);
        uint256 bp = config.BP();
        uint256 toPool = listPrice * config.splitPoolBp() / bp;
        uint256 toBurn = listPrice * config.splitBurnBp() / bp;
        rvyn.safeTransfer(pool, toPool);
        if (toBurn > 0) IBurnableERC20(address(rvyn)).burn(toBurn);
        uint256 toTreasury = total - toPool - toBurn;
        if (toTreasury > 0) rvyn.safeTransfer(treasury, toTreasury);
    }

    function _openDeck(uint8 kind) internal {
        Deck storage d = _decks[kind];
        d.number += 1;
        d.remaining = deckSize[kind];
        if (kind == SPIRE) {
            d.rarityLeft = [uint32(1440), 870, 450, 210, 30];
            d.specialLeft = [uint32(3), 2]; // The Hollow Spire, Genesis Spire
        } else if (kind == PRISM) {
            d.rarityLeft = [uint32(3000), 1680, 900, 360, 60];
            d.specialLeft = [uint32(6), 4]; // Echo Prism, Tear of the Core
            for (uint256 r; r < 5; ++r) {
                uint32 n = d.rarityLeft[r];
                uint32 wide = n * 4000 / 10_000;
                uint32 focused = n * 4000 / 10_000;
                d.beamLeft[r] = [wide, focused, n - wide - focused];
            }
        } else {
            d.rarityLeft = [uint32(5000), 2800, 1500, 600, 100];
            d.signatureLeft = 10;
        }
        emit DeckOpened(kind, d.number);
    }

    function _pick(uint32[5] storage left, uint256 r) internal returns (uint8) {
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

    function _draw(uint8 kind, uint256 seed) internal returns (LightdiveNFT.Attributes memory a) {
        Deck storage d = _decks[kind];
        if (d.remaining == 0) _openDeck(kind);
        uint256 u1 = uint256(keccak256(abi.encode(seed, 1)));
        uint256 u2 = uint256(keccak256(abi.encode(seed, 2)));
        uint256 u3 = uint256(keccak256(abi.encode(seed, 3)));

        uint32 radiantLeftBefore = d.rarityLeft[4];
        uint8 rarity = _pick(d.rarityLeft, u1);
        d.remaining -= 1;

        a.kind = kind;
        a.rarity = rarity;
        a.deck = d.number;
        a.dna = uint64(u3 >> 128);
        a.voyagesLeft = config.voyages(kind);

        if (kind == SEEKER) {
            a.trait = uint8(u2 % 6);
            uint256 span = uint256(SEEKER_LUM_HI[rarity]) - SEEKER_LUM_LO[rarity] + 1;
            a.luminance = uint16(SEEKER_LUM_LO[rarity] + (u2 >> 64) % span);
            if (rarity == 4 && (u3 % radiantLeftBefore) < d.signatureLeft) {
                d.signatureLeft -= 1;
                a.variant = uint8(1 + (u3 >> 64) % 6);
            }
            return a;
        }

        uint256 base = kind == SPIRE ? SPIRE_LUM[rarity] : PRISM_LUM[rarity];
        uint256 lum = base * (90 + (u2 >> 64) % 21) / 100; // base +/- 10%
        if (rarity == 4) {
            uint256 x = u3 % radiantLeftBefore;
            if (x < d.specialLeft[0]) {
                d.specialLeft[0] -= 1;
                a.variant = 1;
            } else if (x < uint256(d.specialLeft[0]) + d.specialLeft[1]) {
                d.specialLeft[1] -= 1;
                a.variant = 2;
            }
            if (a.variant != 0) lum = lum * (10_000 + SPECIAL_BONUS_BP) / 10_000;
        }
        a.luminance = uint16(lum);
        a.trait = kind == SPIRE ? rarity + 1 : _pick3(d.beamLeft[rarity], u2);
    }
}
