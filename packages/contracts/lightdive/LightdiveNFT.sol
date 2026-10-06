// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Metadata} from "@openzeppelin/contracts/token/ERC721/extensions/IERC721Metadata.sol";
import {IERC721Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {ERC721Utils} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Utils.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice RovynCore: Lightdive NFTs (RVDIV): Beacon Spires, Resonance Prisms and Seekers in one
/// collection. All gameplay attributes live onchain; images and metadata JSON are rendered off
/// chain from these attributes.
/// @dev Candidate, unaudited. Only the minter mints; only the game spends voyages and burns.
/// The ERC-721 core is written here instead of inheriting OpenZeppelin's ERC721 because OZ 5.6's
/// ERC721 pulls in Strings/Bytes, which need Cancun opcodes, and RovynCore contracts target paris.
/// Behaviour follows OZ ERC721 (same errors, events and receiver check).
contract LightdiveNFT is IERC721, IERC721Metadata, IERC721Errors, ERC2981, Ownable2Step {
    uint8 public constant SPIRE = 0;
    uint8 public constant PRISM = 1;
    uint8 public constant SEEKER = 2;

    struct Attributes {
        uint8 kind; // SPIRE, PRISM, SEEKER
        uint8 rarity; // 0 Glimmer .. 4 Radiant (internal: common .. mythic)
        uint8 trait; // spire: level 1-5; prism: beam 0-2; seeker: light attribute 0-5
        uint8 variant; // 0 standard; spire/prism: special edition 1-2; seeker: signature background 1-6
        uint16 luminance;
        uint16 voyagesLeft;
        uint32 deck; // deck number the NFT was drawn from
        uint64 dna; // seeds the off-chain art layer selection
    }

    address public minter;
    address public game;
    uint256 public nextId = 1;
    string public baseURI;
    /// @notice NFTs of each kind that currently exist (minted and not yet burned).
    uint32[3] public alive;
    /// @notice Hard cap on `alive` per kind, enforced by the minter. It can only be lowered.
    uint32[3] public maxAlive = [uint32(3000), 6000, type(uint32).max];

    mapping(uint256 => Attributes) private _attributes;
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    event MinterSet(address minter);
    event GameSet(address game);
    event MaxAliveLowered(uint8 kind, uint32 maxAlive);
    event Minted(uint256 indexed id, address indexed to, Attributes attributes);
    event VoyageUsed(uint256 indexed id, uint16 voyagesLeft);
    event Homecoming(uint256 indexed id, uint8 kind);

    error NotMinter();
    error NotGame();
    error AlreadySet();
    error BadValue();

    constructor(address owner_, address royaltyReceiver) Ownable(owner_) {
        _setDefaultRoyalty(royaltyReceiver, 500);
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

    // ---------------------------------------------------------------- minter / game

    function mint(address to, Attributes calldata a) external returns (uint256 id) {
        if (msg.sender != minter) revert NotMinter();
        if (to == address(0)) revert ERC721InvalidReceiver(address(0));
        if (a.kind > SEEKER || a.voyagesLeft == 0) revert BadValue();
        id = nextId++;
        _attributes[id] = a;
        alive[a.kind] += 1;
        // Not a safe mint: a contract that cannot receive must not be able to block fulfillment.
        _owners[id] = to;
        unchecked {
            _balances[to] += 1;
        }
        emit Transfer(address(0), to, id);
        emit Minted(id, to, a);
    }

    /// @notice Spends one voyage and returns how many are left. The game burns the NFT at zero.
    function useVoyage(uint256 id) external returns (uint16 left) {
        if (msg.sender != game) revert NotGame();
        _requireOwned(id);
        left = --_attributes[id].voyagesLeft;
        emit VoyageUsed(id, left);
    }

    /// @notice Homecoming: the NFT leaves play for good once its voyages are spent.
    function burn(uint256 id) external {
        if (msg.sender != game) revert NotGame();
        address owner = _requireOwned(id);
        uint8 kind = _attributes[id].kind;
        delete _tokenApprovals[id];
        delete _owners[id];
        delete _attributes[id];
        unchecked {
            _balances[owner] -= 1;
        }
        alive[kind] -= 1;
        emit Transfer(owner, address(0), id);
        emit Homecoming(id, kind);
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
