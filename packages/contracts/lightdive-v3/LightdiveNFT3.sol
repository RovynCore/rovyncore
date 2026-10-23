// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ERC721Utils} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Utils.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice RovynCore: Lightdive v3 NFTs (RVDIV): Spires, Resonance Prisms and Seekers in one collection, every game
/// attribute on chain.
///
/// Life of a card: it is minted sealed the moment it is summoned (its id and kind are known, the rest is not), and
/// unsealed when its summon is revealed with the drand round (v3.3). It starts with its full voyages; each dive spends 1-3. At zero it docks for 7 days, during which
/// it may be renewed once (voyages refilled). Once renewed and spent again, or docked 7 days without renewal, it goes
/// home: it is burned and its name stays on the Star Map Roll (the Homecoming event).
///
/// A card on a team stays in its owner's wallet but is locked by the game: it cannot be transferred until the team is
/// taken apart. How many cards of each kind may exist at once is capped, and the caps can only be lowered.
/// @dev Candidate, unaudited. Only the minter mints and renews; only the game spends voyages, docks, locks and burns.
/// The ERC-721 core is written here (as in v2) because OZ 5.6's ERC721 needs Cancun opcodes and RovynCore targets paris.
contract LightdiveNFT3 is IERC721, IERC721Metadata, IERC721Errors, ERC2981, Ownable2Step {
    uint8 public constant SPIRE = 0;
    uint8 public constant PRISM = 1;
    uint8 public constant SEEKER = 2;
    /// @notice The rarity of a card whose summon is not revealed yet (v3.3).
    uint8 public constant SEALED = 255;

    struct Attributes {
        uint8 kind; // SPIRE, PRISM, SEEKER
        uint8 rarity; // 0 Glimmer .. 4 Corestar; SEALED until its summon is revealed
        uint8 trait; // spire: berths 1-5 (= rarity + 1); prism: beam 0 wide, 1 focused, 2 needle; seeker: light 0-5
        bool renewed; // a card can be renewed once
        uint16 power;
        uint16 voyagesLeft;
        uint32 deck; // the deck the card was drawn from
        uint64 dockedAt; // 0 = not docked
        uint64 dna; // seeds the off-chain art
    }

    address public minter;
    address public game;
    uint256 public nextId = 1;
    string public baseURI;
    /// @notice Cards of each kind that exist right now (minted and not yet home).
    uint32[3] public alive;
    /// @notice Cap on `alive` per kind, enforced by the minter. It can only be lowered.
    uint32[3] public maxAlive = [uint32(3000), 6000, 12_000];

    mapping(uint256 => Attributes) private _attributes;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    /// @notice Cards locked on a team: they cannot move until the game unlocks them.
    mapping(uint256 => bool) public locked;

    event MinterSet(address minter);
    event GameSet(address game);
    event MaxAliveLowered(uint8 kind, uint32 maxAlive);
    event Minted(uint256 indexed id, address indexed to, Attributes attributes);
    event Unsealed(uint256 indexed id, Attributes attributes);
    event VoyagesUsed(uint256 indexed id, uint16 voyagesLeft);
    event Docked(uint256 indexed id, uint64 at);
    event Renewed(uint256 indexed id, uint16 voyages);
    event Homecoming(uint256 indexed id, address indexed owner, uint8 kind, uint8 rarity);
    event Locked(uint256 indexed id, bool locked);

    error NotMinter();
    error NotGame();
    error AlreadySet();
    error BadValue();
    error CardLocked(uint256 id);

    constructor(address owner_, address royaltyReceiver) Ownable(owner_) {
        _setDefaultRoyalty(royaltyReceiver, 500);
    }

    modifier onlyGame() {
        if (msg.sender != game) revert NotGame();
        _;
    }

    // ---------------------------------------------------------------- ERC-721 metadata

    function name() external pure returns (string memory) {
        return "RovynCore: Lightdive";
    }

    function symbol() external pure returns (string memory) {
        return "RVDIV";
    }

    function tokenURI(uint256 id) external view returns (string memory) {
        _requireOwned(id);
        return bytes(baseURI).length == 0 ? "" : string.concat(baseURI, _decimal(id));
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC2981, IERC165) returns (bool) {
        return interfaceId == type(IERC721).interfaceId || interfaceId == type(IERC721Metadata).interfaceId
            || super.supportsInterface(interfaceId);
    }

    // ---------------------------------------------------------------- ERC-721

    function balanceOf(address owner) external view returns (uint256) {
        if (owner == address(0)) revert ERC721InvalidOwner(address(0));
        return _balances[owner];
    }

    function ownerOf(uint256 id) external view returns (address) {
        return _requireOwned(id);
    }

    function getApproved(uint256 id) external view returns (address) {
        _requireOwned(id);
        return _tokenApprovals[id];
    }

    function isApprovedForAll(address owner, address operator) public view returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function approve(address to, uint256 id) external {
        address owner = _requireOwned(id);
        if (msg.sender != owner && !isApprovedForAll(owner, msg.sender)) revert ERC721InvalidApprover(msg.sender);
        _tokenApprovals[id] = to;
        emit Approval(owner, to, id);
    }

    function setApprovalForAll(address operator, bool approved) external {
        if (operator == address(0)) revert ERC721InvalidOperator(operator);
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function transferFrom(address from, address to, uint256 id) public {
        if (to == address(0)) revert ERC721InvalidReceiver(address(0));
        if (locked[id]) revert CardLocked(id);
        address owner = _requireOwned(id);
        if (owner != from) revert ERC721IncorrectOwner(from, id, owner);
        if (msg.sender != owner && !isApprovedForAll(owner, msg.sender) && _tokenApprovals[id] != msg.sender) {
            revert ERC721InsufficientApproval(msg.sender, id);
        }
        delete _tokenApprovals[id];
        unchecked {
            _balances[from] -= 1;
            _balances[to] += 1;
        }
        _owners[id] = to;
        emit Transfer(from, to, id);
    }

    function safeTransferFrom(address from, address to, uint256 id) external {
        safeTransferFrom(from, to, id, "");
    }

    function safeTransferFrom(address from, address to, uint256 id, bytes memory data) public {
        transferFrom(from, to, id);
        ERC721Utils.checkOnERC721Received(msg.sender, from, to, id, data);
    }

    // ---------------------------------------------------------------- game views

    function attributes(uint256 id) external view returns (Attributes memory) {
        _requireOwned(id);
        return _attributes[id];
    }

    /// @notice Whether the card exists right now (minted and not home yet).
    function exists(uint256 id) external view returns (bool) {
        return _owners[id] != address(0);
    }

    // ---------------------------------------------------------------- minter

    /// @notice Mints a sealed card of `kind` (v3.3): it counts against the cap at once and is unsealed by the minter
    /// when its summon is revealed.
    function mintSealed(address to, uint8 kind, uint16 voyages) external returns (uint256 id) {
        if (msg.sender != minter) revert NotMinter();
        if (to == address(0)) revert ERC721InvalidReceiver(address(0));
        if (kind > SEEKER || voyages == 0) revert BadValue();
        if (alive[kind] >= maxAlive[kind]) revert BadValue();
        id = nextId++;
        Attributes memory a;
        a.kind = kind;
        a.rarity = SEALED;
        a.voyagesLeft = voyages;
        _attributes[id] = a;
        alive[a.kind] += 1;
        // Not a safe mint: a contract that cannot receive must not be able to block a reveal.
        _owners[id] = to;
        unchecked {
            _balances[to] += 1;
        }
        emit Transfer(address(0), to, id);
        emit Minted(id, to, a);
    }

    /// @notice Reveals a sealed card's draw: rarity, trait, power and art seed (kind and voyages stay as minted).
    function unseal(uint256 id, uint8 rarity, uint8 trait, uint16 power, uint64 dna) external {
        if (msg.sender != minter) revert NotMinter();
        _requireOwned(id);
        Attributes storage a = _attributes[id];
        if (a.rarity != SEALED || rarity > 4) revert BadValue();
        a.rarity = rarity;
        a.trait = trait;
        a.power = power;
        a.dna = dna;
        emit Unsealed(id, a);
    }

    /// @notice Renewal: refills a docked card's voyages. Allowed once per card, within the docking period (the minter
    /// checks the period and takes the payment).
    function renew(uint256 id, uint16 voyages) external {
        if (msg.sender != minter) revert NotMinter();
        _requireOwned(id);
        Attributes storage a = _attributes[id];
        if (a.renewed || a.dockedAt == 0 || voyages == 0) revert BadValue();
        a.renewed = true;
        a.dockedAt = 0;
        a.voyagesLeft = voyages;
        emit Renewed(id, voyages);
    }

    // ---------------------------------------------------------------- game

    function setLocked(uint256 id, bool on) external onlyGame {
        _requireOwned(id);
        locked[id] = on;
        emit Locked(id, on);
    }

    /// @notice Spends up to `n` voyages and returns how many are left.
    function spendVoyages(uint256 id, uint16 n) external onlyGame returns (uint16 left) {
        _requireOwned(id);
        Attributes storage a = _attributes[id];
        left = a.voyagesLeft > n ? a.voyagesLeft - n : 0;
        a.voyagesLeft = left;
        emit VoyagesUsed(id, left);
    }

    function dock(uint256 id) external onlyGame {
        _requireOwned(id);
        Attributes storage a = _attributes[id];
        if (a.voyagesLeft != 0 || a.dockedAt != 0) revert BadValue();
        a.dockedAt = uint64(block.timestamp);
        emit Docked(id, a.dockedAt);
    }

    /// @notice Homecoming: the card leaves play for good.
    function burn(uint256 id) external onlyGame {
        address owner = _requireOwned(id);
        Attributes memory a = _attributes[id];
        delete _tokenApprovals[id];
        delete _owners[id];
        delete _attributes[id];
        delete locked[id];
        unchecked {
            _balances[owner] -= 1;
        }
        alive[a.kind] -= 1;
        emit Transfer(owner, address(0), id);
        emit Homecoming(id, owner, a.kind, a.rarity);
    }

    // ---------------------------------------------------------------- owner

    function setMinter(address minter_) external onlyOwner {
        if (minter != address(0)) revert AlreadySet();
        minter = minter_;
        emit MinterSet(minter_);
    }

    function setGame(address game_) external onlyOwner {
        if (game != address(0)) revert AlreadySet();
        game = game_;
        emit GameSet(game_);
    }

    function lowerMaxAlive(uint8 kind, uint32 newMax) external onlyOwner {
        if (kind > SEEKER || newMax > maxAlive[kind]) revert BadValue();
        maxAlive[kind] = newMax;
        emit MaxAliveLowered(kind, newMax);
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        baseURI = uri;
    }

    function setRoyalty(address receiver, uint96 bps) external onlyOwner {
        if (bps > 1000) revert BadValue();
        _setDefaultRoyalty(receiver, bps);
    }

    // ---------------------------------------------------------------- internal

    function _requireOwned(uint256 id) internal view returns (address owner) {
        owner = _owners[id];
        if (owner == address(0)) revert ERC721NonexistentToken(id);
    }

    function _decimal(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 len;
        for (uint256 t = v; t != 0; t /= 10) ++len;
        bytes memory out = new bytes(len);
        for (; v != 0; v /= 10) out[--len] = bytes1(uint8(48 + v % 10));
        return string(out);
    }
}
