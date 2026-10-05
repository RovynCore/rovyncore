// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {
    GenesisTokenLock,
    IV2Router,
    IV2Factory,
    IV2Pair,
    IBurnable
} from "../v2/GenesisPresale.sol";

/// @notice RVYN V4 presale; V3 economics and settlement lifecycle plus an
/// onchain-verifiable Merkle allowlist. This is a new, non-upgradeable contract.
/// @dev Root changes are allowed only while Pending. Verify the DEX router and
/// audit this exact bytecode before any mainnet deployment or live sale.
contract GenesisPresaleV4 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant PRICE = 0.0001 ether;
    uint256 public constant SOFT_CAP = 0 ether;
    uint256 public constant HARD_CAP = 100 ether;
    uint256 public constant WALLET_CAP = 0.25 ether;
    uint256 public constant SALE_TOKENS = 1_000_000 ether;
    uint256 public constant LP_TOKENS = 5_000_000 ether;
    uint256 public constant TEAM_TOKENS = 2_000_000 ether;
    uint256 public constant REQUIRED_TOKENS = SALE_TOKENS + LP_TOKENS + TEAM_TOKENS;
    uint256 public constant DURATION = 14 days;
    uint256 public constant SETTLEMENT_WINDOW = 7 days;
    uint256 public constant TEAM_LOCK = 730 days;
    uint256 public constant LIQUIDITY_LOCK = 365 days;

    IERC20 public immutable token;
    address public immutable sponsor;
    IV2Router public immutable router;
    address public immutable factory;
    address public immutable weth;

    enum State { Pending, Open, Succeeded, Failed }
    State public state;
    bytes32 public allowlistRoot;
    uint256 public endsAt;
    uint256 public closedAt;
    uint256 public raised;
    uint256 public liquidityTokenAmount;
    uint256 public poolEthAmount;
    uint256 public withdrawnEth;
    uint256 public unsoldBurned;
    mapping(address => uint256) public contributions;
    address public lpLock;
    address public teamLock;
    address public reserveLock;

    event AllowlistRootUpdated(bytes32 indexed previousRoot, bytes32 indexed newRoot);
    event Opened(uint256 endsAt);
    event InventoryDeposited(uint256 amount);
    event Closed(uint256 closedAt);
    event Contributed(address indexed buyer, uint256 paid, uint256 total);
    event Failed();
    event Refunded(address indexed buyer, address indexed recipient, uint256 amount);
    event Claimed(address indexed buyer, address indexed recipient, uint256 tokens);
    event Settled(uint256 raised, uint256 poolEth, uint256 poolTokens, address pair);
    event UnsoldBurned(uint256 amount);
    event InventoryRecovered(uint256 amount);
    event ProceedsWithdrawn(address indexed sponsor, uint256 amount, uint256 remaining);

    modifier onlySponsor() {
        require(msg.sender == sponsor, "Not sponsor");
        _;
    }

    constructor(address token_, address sponsor_, address router_) {
        require(token_.code.length > 0 && router_.code.length > 0 && sponsor_ != address(0), "Invalid address");
        require(sponsor_ != token_ && sponsor_ != router_ && sponsor_ != address(this), "Invalid sponsor");
        token = IERC20(token_);
        require(token.totalSupply() == 10_000_000 ether, "RVYN supply");
        sponsor = sponsor_;
        router = IV2Router(router_);
        address f = router.factory();
        address w = router.WETH();
        require(f.code.length > 0 && w.code.length > 0 && w != token_, "Invalid DEX");
        factory = f;
        weth = w;
    }

    /// @notice Root uses double-hashed ABI-encoded addresses and sorted pair hashing.
    /// It is frozen when open() transitions the sale out of Pending.
    function setAllowlistRoot(bytes32 newRoot) external onlySponsor {
        require(state == State.Pending, "Already started");
        require(newRoot != bytes32(0), "Empty root");
        bytes32 previousRoot = allowlistRoot;
        allowlistRoot = newRoot;
        emit AllowlistRootUpdated(previousRoot, newRoot);
    }

    function isAllowlisted(address account, bytes32[] calldata proof) external view returns (bool) {
        return allowlistRoot != bytes32(0) && MerkleProof.verify(proof, allowlistRoot, _leaf(account));
    }

    function _leaf(address account) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(account))));
    }

    function depositInventory() external onlySponsor nonReentrant {
        require(state == State.Pending, "Already started");
        require(token.balanceOf(address(this)) == 0, "Inventory already deposited");
        token.safeTransferFrom(sponsor, address(this), REQUIRED_TOKENS);
        require(token.balanceOf(address(this)) == REQUIRED_TOKENS, "Unsupported token");
        emit InventoryDeposited(REQUIRED_TOKENS);
    }

    function open() external onlySponsor nonReentrant {
        require(state == State.Pending, "Already started");
        require(allowlistRoot != bytes32(0), "Set allowlist root first");
        require(token.balanceOf(address(this)) == REQUIRED_TOKENS, "Deposit inventory first");
        endsAt = block.timestamp + DURATION;
        state = State.Open;
        emit Opened(endsAt);
    }

    function buy(uint256 wholeTokens, bytes32[] calldata proof) external payable nonReentrant {
        require(state == State.Open && closedAt == 0 && block.timestamp < endsAt && raised < HARD_CAP, "Not open");
        require(MerkleProof.verify(proof, allowlistRoot, _leaf(msg.sender)), "Not allowlisted");
        require(wholeTokens > 0 && wholeTokens <= 2500 && msg.value == wholeTokens * PRICE, "Payment");
        uint256 total = contributions[msg.sender] + msg.value;
        require(total <= WALLET_CAP && raised + msg.value <= HARD_CAP, "Cap");
        contributions[msg.sender] = total;
        raised += msg.value;
        if (raised == HARD_CAP) closedAt = block.timestamp;
        emit Contributed(msg.sender, msg.value, total);
    }

    function close() external onlySponsor nonReentrant {
        require(state == State.Open, "Not open");
        closedAt = block.timestamp;
        emit Closed(closedAt);
    }

    function settlementDeadline() public view returns (uint256) {
        return (closedAt == 0 ? endsAt : closedAt) + SETTLEMENT_WINDOW;
    }

    function failSale() external {
        require(state == State.Open, "Not open");
        require((block.timestamp >= endsAt && raised == 0) || block.timestamp >= settlementDeadline(), "Not failed");
        state = State.Failed;
        emit Failed();
    }

    function cancelBeforeOpen() external onlySponsor {
        require(state == State.Pending, "Already started");
        state = State.Failed;
        emit Failed();
    }

    function refund(address payable recipient) external nonReentrant {
        require(state == State.Failed && recipient != address(0), "Not refundable");
        uint256 amount = contributions[msg.sender];
        require(amount > 0, "Nothing owed");
        contributions[msg.sender] = 0;
        (bool ok,) = recipient.call{value: amount}("");
        require(ok, "ETH failed");
        emit Refunded(msg.sender, recipient, amount);
    }

    function _addLiquidity(uint256 ethAmount, uint256 tokenAmount) internal returns (address pair, uint256 liquidity) {
        pair = IV2Factory(factory).getPair(address(token), weth);
        if (pair != address(0)) require(IERC20(pair).totalSupply() == 0, "Pool already used");
        uint256 beforeTokens = token.balanceOf(address(this));
        token.forceApprove(address(router), tokenAmount);
        (uint256 usedTokens, uint256 usedETH, uint256 minted) = router.addLiquidityETH{value: ethAmount}(
            address(token), tokenAmount, tokenAmount, ethAmount, address(this), block.timestamp
        );
        token.forceApprove(address(router), 0);
        require(usedTokens == tokenAmount && usedETH == ethAmount && minted > 0, "Bad liquidity");
        require(token.balanceOf(address(this)) == beforeTokens - tokenAmount, "Bad transfer");
        liquidity = minted;
        pair = IV2Factory(factory).getPair(address(token), weth);
        require(pair.code.length > 0 && IERC20(pair).balanceOf(address(this)) >= liquidity, "Missing LP");
        IV2Pair p = IV2Pair(pair);
        address t0 = p.token0();
        address t1 = p.token1();
        require((t0 == address(token) && t1 == weth) || (t1 == address(token) && t0 == weth), "Wrong pair");
        (uint112 r0, uint112 r1,) = p.getReserves();
        require((t0 == address(token) ? uint256(r0) : uint256(r1)) == tokenAmount, "Token reserves");
        require((t0 == weth ? uint256(r0) : uint256(r1)) == ethAmount, "ETH reserves");
    }

    function createPool(uint256 ethAmount) external onlySponsor nonReentrant {
        require(state == State.Open && raised > 0 && (closedAt > 0 || block.timestamp >= endsAt || raised == HARD_CAP), "Not ready");
        require(block.timestamp < settlementDeadline(), "Settlement expired");
        require(ethAmount > 0 && ethAmount <= raised, "Pool amount");
        uint256 tokenAmount = ethAmount * 1 ether / PRICE;
        require(tokenAmount > 0 && tokenAmount <= LP_TOKENS, "Liquidity amount");
        liquidityTokenAmount = tokenAmount;
        poolEthAmount = ethAmount;
        state = State.Succeeded;
        (address pair,) = _addLiquidity(ethAmount, tokenAmount);
        lpLock = address(new GenesisTokenLock(pair, sponsor, block.timestamp + LIQUIDITY_LOCK, 0));
        teamLock = address(new GenesisTokenLock(address(token), sponsor, block.timestamp + TEAM_LOCK, 0));
        reserveLock = address(new GenesisTokenLock(address(token), sponsor, block.timestamp + LIQUIDITY_LOCK, 0));
        IERC20(pair).safeTransfer(lpLock, IERC20(pair).balanceOf(address(this)));
        token.safeTransfer(teamLock, TEAM_TOKENS);
        uint256 sold = raised * 1 ether / PRICE;
        uint256 unsold = SALE_TOKENS - sold;
        if (unsold > 0) {
            IBurnable(address(token)).burn(unsold);
            unsoldBurned = unsold;
            emit UnsoldBurned(unsold);
        }
        token.safeTransfer(reserveLock, LP_TOKENS - tokenAmount);
        emit Settled(raised, ethAmount, tokenAmount, pair);
    }

    function withdraw(uint256 amount) external onlySponsor nonReentrant {
        require(state == State.Succeeded, "Not settled");
        uint256 available = raised - poolEthAmount - withdrawnEth;
        require(amount > 0 && amount <= available, "Amount");
        withdrawnEth += amount;
        (bool ok,) = payable(sponsor).call{value: amount}("");
        require(ok, "ETH failed");
        emit ProceedsWithdrawn(sponsor, amount, available - amount);
    }

    function withdrawableEth() external view returns (uint256) {
        if (state != State.Succeeded) return 0;
        return raised - poolEthAmount - withdrawnEth;
    }

    function claim(address recipient) external nonReentrant {
        require(state == State.Succeeded && recipient != address(0), "Not claimable");
        uint256 amount = contributions[msg.sender];
        require(amount > 0, "Nothing owed");
        contributions[msg.sender] = 0;
        uint256 tokens = amount * 1 ether / PRICE;
        token.safeTransfer(recipient, tokens);
        emit Claimed(msg.sender, recipient, tokens);
    }

    function recoverFailedInventory() external onlySponsor nonReentrant {
        require(state == State.Failed, "Not failed");
        uint256 amount = token.balanceOf(address(this));
        token.safeTransfer(sponsor, amount);
        emit InventoryRecovered(amount);
    }
}
