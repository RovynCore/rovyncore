// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {IV2Router, IBurnable, GenesisTokenLock} from "../v2/GenesisPresale.sol";
import {RovynTeamVesting} from "../v5/RovynPresaleV5.sol";

interface IUniV2Factory {
    function getPair(address, address) external view returns (address);
    function createPair(address, address) external returns (address);
}

interface IUniV2Pair is IERC20 {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112, uint112, uint32);
    function mint(address to) external returns (uint256 liquidity);
}

interface IWETH9 {
    function deposit() external payable;
    function transfer(address to, uint256 amount) external returns (bool);
}

/// @notice RVYN presale V6 (candidate, unaudited). Not for deployment until an independent audit,
/// a mainnet-fork test and a constructor-parameter review are complete.
/// @dev Rules: buyers pay ETH and the contract only records it; RVYN is claimable after settlement;
/// there is no refund and no minimum raise; settlement always proceeds (it never depends only on the
/// sponsor: anyone may settle SETTLE_GRACE after the sale closed); the initial pool is built by
/// direct pair minting, not through the router; no RVYN leaves the contract before settlement.
contract RovynPresaleV6 is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant PRICE = 0.0001 ether;
    uint256 public constant HARD_CAP = 100 ether;
    uint256 public constant WALLET_CAP = 0.25 ether;
    uint256 public constant SALE_TOKENS = 1_000_000 ether;
    uint256 public constant LP_ALLOCATION = 5_000_000 ether;
    uint256 public constant MANAGER_ALLOCATION = 500_000 ether;
    uint256 public constant TEAM_ALLOCATION = 1_000_000 ether;
    uint256 public constant PRODUCT_ALLOCATION = 1_000_000 ether;
    uint256 public constant COMMUNITY_ALLOCATION = 1_000_000 ether;
    uint256 public constant AIRDROP_ALLOCATION = 500_000 ether;
    uint256 public constant TOTAL_INVENTORY = 10_000_000 ether;
    uint256 public constant DURATION = 14 days;
    uint256 public constant MIN_POOL_BPS = 5000; // pool ETH >= 50% of raised (plus all forwarded revenue)
    uint256 public constant SETTLE_GRACE = 7 days; // anyone may settle this long after the sale closed
    uint256 public constant WITHDRAW_INTERVAL = 30 days;
    uint256 public constant MIN_LP_LOCK = 365 days;
    uint256 public constant MAX_LP_LOCK = 730 days;
    uint256 public constant MAX_AIRDROP_RECIPIENTS = 20;

    IERC20 public immutable token;
    IV2Router public immutable router;
    address public immutable factory;
    address public immutable weth;
    address public immutable teamBeneficiary;
    address public immutable lpBeneficiary;
    uint256 public immutable lpLockDuration;
    /// @notice Share of operating funds unlocked per WITHDRAW_INTERVAL after settlement (10000 = all at once).
    uint256 public immutable withdrawStepBps;

    address public sponsor;
    address public pendingSponsor;

    enum State { Pending, Open, Closed, Settled, Cancelled }
    State public state;
    bytes32 public allowlistRoot;
    bool public inventoryDeposited;
    uint256 public openedAt;
    uint256 public endsAt;
    uint256 public closedAt;
    uint256 public settledAt;
    uint256 public raised;
    uint256 public liquidityRevenueReceived;
    uint256 public initialPoolEth;
    uint256 public initialPoolTokens;
    uint256 public lpTokensDeployed;
    uint256 public projectEthWithdrawn;
    uint256 public tokensClaimed;
    uint256 public unsoldBurned;
    uint256 public airdropSpent;
    uint256 public productSpent;
    uint256 public communitySpent;
    address public pair;
    address public initialLpLock;
    address public teamVesting;

    mapping(address => uint256) public contributions;

    event AllowlistRootUpdated(bytes32 indexed previousRoot, bytes32 indexed newRoot);
    event InventoryDeposited(uint256 amount);
    event SaleOpened(uint256 openedAt, uint256 endsAt);
    event Purchased(address indexed buyer, uint256 paid, uint256 buyerTotal, uint256 raised);
    event SaleClosed(address indexed by, uint256 closedAt, uint256 raised);
    event Settled(address indexed by, uint256 poolEth, uint256 poolTokens, uint256 unsoldBurned, uint256 claimableTokens);
    event Claimed(address indexed buyer, uint256 paid, uint256 tokens);
    event LiquidityRevenueDeposited(address indexed sponsor, uint256 amount, uint256 totalReceived);
    event InitialLiquidityCreated(uint256 ethAmount, uint256 tokenAmount, address indexed pair, address indexed lpLock, uint256 unlockAt);
    event FutureLiquidityAdded(uint256 ethAmount, uint256 tokenAmount, address indexed pair, address indexed lpLock, uint256 unlockAt);
    event ProjectFundsWithdrawn(address indexed recipient, uint256 amount, uint256 remainingNow);
    event ManagerAllocationReleased(address indexed recipient, uint256 amount);
    event TeamVestingCreated(address indexed vesting, address indexed beneficiary, uint256 amount, uint256 start, uint256 cliff, uint256 monthlyReleases);
    event AllocationDistributed(bytes32 indexed category, address indexed recipient, uint256 amount, bytes32 indexed referenceId);
    event AirdropBatch(address indexed operator, bytes32 indexed campaignId, uint256 recipientCount, uint256 totalAmount);
    event CancelledBeforeOpen(address indexed sponsor, uint256 inventoryReturned);
    event SponsorProposed(address indexed current, address indexed proposed);
    event SponsorTransferred(address indexed previous, address indexed current);

    modifier onlySponsor() {
        require(msg.sender == sponsor, "Not sponsor");
        _;
    }

    constructor(
        address token_,
        address sponsor_,
        address router_,
        address teamBeneficiary_,
        address lpBeneficiary_,
        uint256 lpLockDuration_,
        uint256 withdrawStepBps_
    ) {
        require(token_.code.length > 0 && router_.code.length > 0, "Invalid contract address");
        require(sponsor_ != address(0) && teamBeneficiary_ != address(0) && lpBeneficiary_ != address(0), "Invalid wallet");
        require(sponsor_ != token_ && sponsor_ != router_ && teamBeneficiary_ != address(this) && lpBeneficiary_ != address(this), "Invalid wallet");
        require(lpLockDuration_ >= MIN_LP_LOCK && lpLockDuration_ <= MAX_LP_LOCK, "LP lock must be 12-24 months");
        require(withdrawStepBps_ >= 1 && withdrawStepBps_ <= 10_000, "Invalid withdraw step");

        IERC20 tokenContract = IERC20(token_);
        require(tokenContract.totalSupply() == TOTAL_INVENTORY, "RVYN supply mismatch");
        token = tokenContract;
        sponsor = sponsor_;
        teamBeneficiary = teamBeneficiary_;
        lpBeneficiary = lpBeneficiary_;
        router = IV2Router(router_);
        lpLockDuration = lpLockDuration_;
        withdrawStepBps = withdrawStepBps_;

        address factory_ = router.factory();
        address weth_ = router.WETH();
        require(factory_.code.length > 0 && weth_.code.length > 0 && weth_ != token_, "Invalid DEX");
        factory = factory_;
        weth = weth_;
        emit SponsorTransferred(address(0), sponsor_);
    }

    receive() external payable {
        revert("Use depositLiquidityRevenue");
    }

    // ---------------------------------------------------------------- sponsor handover (two steps)

    function proposeSponsor(address next) external onlySponsor {
        require(next != address(0) && next != address(this) && next != address(token), "Invalid sponsor");
        pendingSponsor = next;
        emit SponsorProposed(sponsor, next);
    }

    function acceptSponsor() external {
        require(msg.sender == pendingSponsor && msg.sender != address(0), "Not pending sponsor");
        address previous = sponsor;
        sponsor = msg.sender;
        pendingSponsor = address(0);
        emit SponsorTransferred(previous, msg.sender);
    }

    // ---------------------------------------------------------------- setup

    function setAllowlistRoot(bytes32 newRoot) external onlySponsor {
        require(state == State.Pending, "Sale already started");
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
        require(state == State.Pending && !inventoryDeposited, "Inventory unavailable");
        token.safeTransferFrom(sponsor, address(this), TOTAL_INVENTORY);
        require(token.balanceOf(address(this)) == TOTAL_INVENTORY, "Inventory mismatch");
        inventoryDeposited = true;
        emit InventoryDeposited(TOTAL_INVENTORY);
    }

    /// @dev Opening moves no RVYN: until settlement every token stays inside this contract.
    function open() external onlySponsor nonReentrant {
        require(state == State.Pending && allowlistRoot != bytes32(0), "Set allowlist first");
        require(inventoryDeposited && token.balanceOf(address(this)) == TOTAL_INVENTORY, "Deposit inventory first");
        openedAt = block.timestamp;
        endsAt = block.timestamp + DURATION;
        state = State.Open;
        emit SaleOpened(openedAt, endsAt);
    }

    function cancelBeforeOpen() external onlySponsor nonReentrant {
        require(state == State.Pending, "Sale already started");
        state = State.Cancelled;
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) token.safeTransfer(sponsor, balance);
        emit CancelledBeforeOpen(sponsor, balance);
    }

    // ---------------------------------------------------------------- sale

    /// @notice Records the payment only. No RVYN is transferred here.
    function buy(uint256 wholeTokens, bytes32[] calldata proof) external payable nonReentrant {
        require(state == State.Open && block.timestamp < endsAt && raised < HARD_CAP, "Sale not open");
        require(MerkleProof.verify(proof, allowlistRoot, _leaf(msg.sender)), "Not allowlisted");
        require(wholeTokens > 0 && wholeTokens <= 2500 && msg.value == wholeTokens * PRICE, "Invalid payment");
        uint256 newContribution = contributions[msg.sender] + msg.value;
        require(newContribution <= WALLET_CAP && raised + msg.value <= HARD_CAP, "Sale cap exceeded");

        contributions[msg.sender] = newContribution;
        raised += msg.value;
        emit Purchased(msg.sender, msg.value, newContribution, raised);

        if (raised == HARD_CAP) _close(msg.sender);
    }

    /// @notice The sponsor may close at any time; anyone may close once the sale period has ended.
    function close() external {
        require(state == State.Open, "Sale not open");
        require(msg.sender == sponsor || block.timestamp >= endsAt, "Sale still running");
        _close(msg.sender);
    }

    function _close(address by) internal {
        state = State.Closed;
        closedAt = block.timestamp;
        emit SaleClosed(by, closedAt, raised);
    }

    /// @notice Manually forwarded launchpad revenue is tracked separately from presale proceeds.
    function depositLiquidityRevenue() external payable onlySponsor {
        require(state == State.Open || state == State.Closed, "Sale not open or closed");
        require(msg.value > 0, "Zero amount");
        liquidityRevenueReceived += msg.value;
        emit LiquidityRevenueDeposited(msg.sender, msg.value, liquidityRevenueReceived);
    }

    // ---------------------------------------------------------------- settlement

    /// @notice Smallest pool the contract accepts: 50% of the raise plus every forwarded revenue deposit.
    function minPoolEth() public view returns (uint256) {
        return raised * MIN_POOL_BPS / 10_000 + liquidityRevenueReceived;
    }

    /// @notice Largest pool the sponsor may choose: the whole raise plus forwarded revenue.
    function maxPoolEth() public view returns (uint256) {
        return raised + liquidityRevenueReceived;
    }

    /// @notice Settles the sale: builds and locks the initial pool, burns unsold sale RVYN and unlocks the
    /// other allocations. The sponsor chooses the pool size within [minPoolEth, maxPoolEth]; anyone may settle
    /// SETTLE_GRACE after closing, which uses minPoolEth.
    function settle(uint256 poolEth) external nonReentrant {
        require(state == State.Closed, "Close sale first");
        uint256 funds = maxPoolEth();
        if (msg.sender != sponsor) {
            require(block.timestamp >= closedAt + SETTLE_GRACE, "Grace period running");
            poolEth = minPoolEth();
        }
        uint256 sold = raised * 1 ether / PRICE;
        require(sold <= SALE_TOKENS, "Sale inventory exceeded");

        uint256 poolTokens;
        if (funds == 0) {
            require(poolEth == 0, "No pool funds");
        } else {
            require(poolEth >= minPoolEth() && poolEth <= funds, "Pool outside bounds");
            require(poolEth <= address(this).balance, "Insufficient ETH");
            poolTokens = poolEth * 1 ether / PRICE;
            require(poolTokens > 0 && poolTokens <= LP_ALLOCATION, "Invalid pool token amount");
        }

        state = State.Settled;
        settledAt = block.timestamp;
        initialPoolEth = poolEth;
        initialPoolTokens = poolTokens;
        lpTokensDeployed = poolTokens;

        if (poolTokens > 0) _seedInitialPool(poolEth, poolTokens);

        uint256 unsold = SALE_TOKENS - sold;
        if (unsold > 0) {
            IBurnable(address(token)).burn(unsold);
            unsoldBurned = unsold;
        }

        token.safeTransfer(sponsor, MANAGER_ALLOCATION);
        teamVesting = address(new RovynTeamVesting(token, teamBeneficiary, address(this), settledAt, TEAM_ALLOCATION));
        token.safeTransfer(teamVesting, TEAM_ALLOCATION);

        emit ManagerAllocationReleased(sponsor, MANAGER_ALLOCATION);
        emit TeamVestingCreated(teamVesting, teamBeneficiary, TEAM_ALLOCATION, settledAt, settledAt + 365 days, 24);
        emit Settled(msg.sender, poolEth, poolTokens, unsold, sold);
    }

    /// @dev Direct pair minting: WETH and RVYN are sent to the pair and `mint` reads the balance difference,
    /// so neither a pre-created pair nor donated WETH can make settlement fail. No RVYN is in circulation before
    /// settlement, so nobody else can seed the pool first; a pair that already has LP supply is rejected.
    function _seedInitialPool(uint256 ethAmount, uint256 tokenAmount) internal {
        address pairAddress = IUniV2Factory(factory).getPair(address(token), weth);
        if (pairAddress == address(0)) pairAddress = IUniV2Factory(factory).createPair(address(token), weth);
        require(pairAddress.code.length > 0, "Pair missing");
        IUniV2Pair pairContract = IUniV2Pair(pairAddress);
        address token0 = pairContract.token0();
        address token1 = pairContract.token1();
        require((token0 == address(token) && token1 == weth) || (token1 == address(token) && token0 == weth), "Wrong pair");
        require(pairContract.totalSupply() == 0, "Pool already seeded");

        IWETH9(weth).deposit{value: ethAmount}();
        require(IWETH9(weth).transfer(pairAddress, ethAmount), "WETH transfer failed");
        token.safeTransfer(pairAddress, tokenAmount);
        uint256 liquidity = pairContract.mint(address(this));
        require(liquidity > 0, "No liquidity minted");

        (uint112 reserve0, uint112 reserve1,) = pairContract.getReserves();
        require((token0 == address(token) ? uint256(reserve0) : uint256(reserve1)) >= tokenAmount, "Token reserve check");
        require((token0 == weth ? uint256(reserve0) : uint256(reserve1)) >= ethAmount, "ETH reserve check");

        address lockAddress = address(new GenesisTokenLock(pairAddress, lpBeneficiary, block.timestamp + lpLockDuration, 0));
        IERC20(pairAddress).safeTransfer(lockAddress, liquidity);
        pair = pairAddress;
        initialLpLock = lockAddress;
        emit InitialLiquidityCreated(ethAmount, tokenAmount, pairAddress, lockAddress, block.timestamp + lpLockDuration);
    }

    /// @notice Buyers claim RVYN after settlement: paid ETH / PRICE. One claim per address.
    function claim() external nonReentrant {
        require(state == State.Settled, "Not settled");
        uint256 paid = contributions[msg.sender];
        require(paid > 0, "Nothing to claim");
        contributions[msg.sender] = 0;
        uint256 amount = paid * 1 ether / PRICE;
        tokensClaimed += amount;
        token.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, paid, amount);
    }

    /// @notice RVYN still owed to buyers.
    function claimableTokensRemaining() public view returns (uint256) {
        if (state != State.Settled) return 0;
        return raised * 1 ether / PRICE - tokensClaimed;
    }

    // ---------------------------------------------------------------- operating funds and later liquidity

    /// @notice Add later liquidity using the reserved RVYN allocation and fresh ETH at the live pool ratio.
    function addFutureLiquidity(uint256 tokenDesired, uint256 tokenMin, uint256 ethMin, uint256 deadline)
        external payable onlySponsor nonReentrant
    {
        require(state == State.Settled && pair != address(0), "Initial pool required");
        require(msg.value > 0 && tokenDesired > 0 && tokenDesired <= lpTokensRemaining(), "Invalid amount");
        token.forceApprove(address(router), tokenDesired);
        (uint256 usedTokens, uint256 usedEth, uint256 minted) = router.addLiquidityETH{value: msg.value}(
            address(token), tokenDesired, tokenMin, ethMin, address(this), deadline
        );
        token.forceApprove(address(router), 0);
        require(usedTokens == tokenDesired && usedEth == msg.value && minted > 0, "Adjust to pool ratio");
        require(IUniV2Factory(factory).getPair(address(token), weth) == pair, "Pair changed");
        address lockAddress = address(new GenesisTokenLock(pair, lpBeneficiary, block.timestamp + lpLockDuration, 0));
        IERC20(pair).safeTransfer(lockAddress, minted);
        lpTokensDeployed += usedTokens;
        emit FutureLiquidityAdded(usedEth, usedTokens, pair, lockAddress, block.timestamp + lpLockDuration);
    }

    function lpTokensRemaining() public view returns (uint256) {
        return LP_ALLOCATION - lpTokensDeployed;
    }

    /// @notice Operating funds: everything received minus the initial pool.
    function operatingFunds() public view returns (uint256) {
        if (state != State.Settled) return 0;
        return raised + liquidityRevenueReceived - initialPoolEth;
    }

    /// @notice Operating funds unlocked so far: withdrawStepBps per WITHDRAW_INTERVAL since settlement, first step at settlement.
    function unlockedProjectEth() public view returns (uint256) {
        if (state != State.Settled) return 0;
        uint256 steps = 1 + (block.timestamp - settledAt) / WITHDRAW_INTERVAL;
        uint256 bps = steps * withdrawStepBps;
        if (bps > 10_000) bps = 10_000;
        return operatingFunds() * bps / 10_000;
    }

    function withdrawableProjectEth() public view returns (uint256) {
        uint256 unlocked = unlockedProjectEth();
        return unlocked > projectEthWithdrawn ? unlocked - projectEthWithdrawn : 0;
    }

    function withdrawProjectFunds(uint256 amount) external onlySponsor nonReentrant {
        require(state == State.Settled && amount > 0, "Settlement required");
        uint256 available = withdrawableProjectEth();
        require(amount <= available, "Amount exceeds unlocked funds");
        projectEthWithdrawn += amount;
        (bool ok,) = payable(sponsor).call{value: amount}("");
        require(ok, "ETH transfer failed");
        emit ProjectFundsWithdrawn(sponsor, amount, available - amount);
    }

    // ---------------------------------------------------------------- allocations (settlement required)

    function distributeProduct(address recipient, uint256 amount, bytes32 referenceId) external onlySponsor nonReentrant {
        _distribute(recipient, amount, referenceId, true);
    }

    function distributeCommunity(address recipient, uint256 amount, bytes32 referenceId) external onlySponsor nonReentrant {
        _distribute(recipient, amount, referenceId, false);
    }

    function _distribute(address recipient, uint256 amount, bytes32 referenceId, bool product) internal {
        require(state == State.Settled, "Settlement required");
        require(recipient != address(0) && amount > 0, "Invalid distribution");
        if (product) {
            require(amount <= PRODUCT_ALLOCATION - productSpent, "Product budget exceeded");
            productSpent += amount;
            emit AllocationDistributed("PRODUCT_ECOSYSTEM", recipient, amount, referenceId);
        } else {
            require(amount <= COMMUNITY_ALLOCATION - communitySpent, "Community budget exceeded");
            communitySpent += amount;
            emit AllocationDistributed("COMMUNITY_CREATORS", recipient, amount, referenceId);
        }
        token.safeTransfer(recipient, amount);
    }

    /// @notice One batch may include at most 20 unique wallets; lifetime spend is capped at 5% supply.
    function airdrop(address[] calldata recipients, uint256[] calldata amounts, bytes32 campaignId)
        external onlySponsor nonReentrant
    {
        require(state == State.Settled, "Settlement required");
        uint256 count = recipients.length;
        require(count > 0 && count <= MAX_AIRDROP_RECIPIENTS && count == amounts.length, "Batch size");
        uint256 total;
        for (uint256 i; i < count; ++i) {
            require(recipients[i] != address(0) && amounts[i] > 0, "Invalid recipient");
            for (uint256 j; j < i; ++j) require(recipients[i] != recipients[j], "Duplicate recipient");
            total += amounts[i];
        }
        require(total <= AIRDROP_ALLOCATION - airdropSpent, "Airdrop budget exceeded");
        airdropSpent += total;
        for (uint256 i; i < count; ++i) token.safeTransfer(recipients[i], amounts[i]);
        emit AirdropBatch(msg.sender, campaignId, count, total);
    }
}
