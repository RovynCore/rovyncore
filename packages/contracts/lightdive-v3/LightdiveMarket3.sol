// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LightdiveNFT3} from "./LightdiveNFT3.sol";
import {LightdiveConfig3} from "./LightdiveConfig3.sol";

interface IBurnableToken {
    function burn(uint256 amount) external;
}

/// @notice Players buy and sell Lightdive cards with each other for RVYN. A listed card is held by this contract until
/// it is sold or the listing is cancelled, so a listed card cannot dive. Sellers set their own prices; the contract
/// never prices anything. Each sale pays a trade tax from the seller's side (5%): 95% of it goes to the Core Light
/// Pool and 5% is burned.
/// @dev Candidate, unaudited. Cancelling is always possible, even when the market is paused.
contract LightdiveMarket3 is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 internal constant BP = 10_000;
    uint256 public constant MAX_PRICE = 1_000_000_000 ether;
    uint256 public constant MAX_BATCH = 20;

    struct Listing {
        address seller;
        uint128 price;
        uint64 listedAt;
    }

    IERC20 public immutable rvyn;
    LightdiveNFT3 public immutable nft;
    LightdiveConfig3 public immutable config;
    address public immutable pool;

    mapping(uint256 => Listing) public listings;

    event Listed(uint256 indexed id, address indexed seller, uint256 price);
    event Cancelled(uint256 indexed id, address indexed seller);
    event Sold(uint256 indexed id, address indexed seller, address indexed buyer, uint256 price, uint256 tax);

    error NotSeller();
    error NotListed();
    error BadPrice();
    error Docked();
    error PriceChanged();
    error BadBatch();

    constructor(address owner_, IERC20 rvyn_, LightdiveNFT3 nft_, LightdiveConfig3 config_, address pool_) Ownable(owner_) {
        rvyn = rvyn_;
        nft = nft_;
        config = config_;
        pool = pool_;
    }

    /// @notice Lists a card (not on a team, not docked). The caller must have approved this contract for it.
    function list(uint256 id, uint256 price) external whenNotPaused nonReentrant {
        _list(id, price);
    }

    /// @notice Lists up to MAX_BATCH cards in one transaction, each at its own price (a player leaving the game can list
    /// all their idle cards with one approval for all and one signature). All or nothing: one bad card reverts the batch.
    function listMany(uint256[] calldata ids, uint256[] calldata prices) external whenNotPaused nonReentrant {
        if (ids.length == 0 || ids.length > MAX_BATCH || ids.length != prices.length) revert BadBatch();
        for (uint256 i = 0; i < ids.length; i++) _list(ids[i], prices[i]);
    }

    function _list(uint256 id, uint256 price) internal {
        if (price == 0 || price > MAX_PRICE) revert BadPrice();
        if (nft.ownerOf(id) != msg.sender) revert NotSeller();
        if (nft.attributes(id).dockedAt != 0) revert Docked();
        nft.transferFrom(msg.sender, address(this), id); // reverts while the card is locked on a team
        listings[id] = Listing(msg.sender, uint128(price), uint64(block.timestamp));
        emit Listed(id, msg.sender, price);
    }

    function cancel(uint256 id) external nonReentrant {
        Listing memory l = listings[id];
        if (l.seller != msg.sender) revert NotSeller();
        delete listings[id];
        nft.transferFrom(address(this), msg.sender, id);
        emit Cancelled(id, msg.sender);
    }

    /// @notice Buys a listed card. `maxPrice` protects the buyer against a price changed in between.
    function buy(uint256 id, uint256 maxPrice) external whenNotPaused nonReentrant {
        Listing memory l = listings[id];
        if (l.seller == address(0)) revert NotListed();
        if (l.price > maxPrice) revert PriceChanged();
        delete listings[id];
        uint256 tax = uint256(l.price) * config.marketTaxBp() / BP;
        uint256 toPool = tax * config.taxToPoolBp() / BP;
        rvyn.safeTransferFrom(msg.sender, l.seller, l.price - tax);
        rvyn.safeTransferFrom(msg.sender, pool, toPool);
        if (tax > toPool) {
            rvyn.safeTransferFrom(msg.sender, address(this), tax - toPool);
            IBurnableToken(address(rvyn)).burn(tax - toPool);
        }
        nft.transferFrom(address(this), msg.sender, id);
        emit Sold(id, l.seller, msg.sender, l.price, tax);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
