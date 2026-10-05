// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {
    IV2Router,
    IV2Factory,
    IV2Pair,
    IBurnable,
    GenesisTokenLock
} from "../v2/GenesisPresale.sol";

/// @notice RVYN presale and bounded token-allocation controller.
/// @dev Candidate only. Do not deploy until exact bytecode is independently
/// audited, router/factory/WETH are verified, and constructor inputs are checked.
contract RovynTeamVesting is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant CLIFF = 365 days;
    uint256 public constant RELEASE_INTERVAL = 30 days;
    uint256 public constant RELEASES = 24;

    IERC20 public immutable token;
    address public immutable beneficiary;
    address public immutable sale;
    uint256 public immutable start;
    uint256 public released;
    uint256 public immutable allocation;

    event TokensReleased(address indexed beneficiary, uint256 amount, uint256 totalReleased);

    constructor(IERC20 token_, address beneficiary_, address sale_, uint256 start_, uint256 allocation_) {
        require(address(token_).code.length > 0 && beneficiary_ != address(0) && sale_ != address(0), "Invalid vesting config");
        require(start_ > 0 && allocation_ > 0, "Invalid vesting schedule");
        token = token_;
        beneficiary = beneficiary_;
        sale = sale_;
        start = start_;
        allocation = allocation_;
    }

    function vested() public view returns (uint256) {
        uint256 firstRelease = start + CLIFF + RELEASE_INTERVAL;
        if (block.timestamp < firstRelease) return 0;
        uint256 releases = 1 + (block.timestamp - firstRelease) / RELEASE_INTERVAL;
        if (releases > RELEASES) releases = RELEASES;
        return allocation * releases / RELEASES;
    }

    function releasable() public view returns (uint256) {
        return vested() - released;
    }

    function release() external nonReentrant returns (uint256 amount) {
        amount = releasable();
        require(amount > 0, "Nothing vested");
        released += amount;
        token.safeTransfer(beneficiary, amount);
        emit TokensReleased(beneficiary, amount, released);
    }
}

/// @notice Non-upgradeable RVYN sale, allocation and liquidity workflow.
/// @dev Purchases transfer RVYN immediately. There is deliberately no refund,
/// post-sale claim, emergency pause, or arbitrary token rescue function.
contract RovynPresaleV5 is ReentrancyGuard {
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
    uint256 public constant MIN_LP_LOCK = 365 days;
    uint256 public constant MAX_LP_LOCK = 730 days;
    uint256 public constant MAX_AIRDROP_RECIPIENTS = 20;

    IERC20 public immutable token;
    address public immutable sponsor;
    IV2Router public immutable router;
    address public immutable factory;
    address public immutable weth;
    address public immutable teamBeneficiary;
    uint256 public immutable lpLockDuration;

    enum State { Pending, Open, Closed, Settled, Cancelled }
    State public state;
    bytes32 public allowlistRoot;
    uint256 public openedAt;
    uint256 public endsAt;
    uint256 public closedAt;
    uint256 public raised;
    uint256 public liquidityRevenueReceived;
    uint256 public initialPoolEth;
    uint256 public initialPoolTokens;
    uint256 public projectEthWithdrawn;
    uint256 public lpTokensDeployed;
    uint256 public airdropSpent;
    uint256 public productSpent;
    uint256 public communitySpent;
    uint256 public unsoldBurned;
    bool public inventoryDeposited;
    bool public managerAllocationReleased;
    address public pair;
    address public initialLpLock;
    address public teamVesting;

    mapping(address => uint256) public contributions;

    event AllowlistRootUpdated(bytes32 indexed previousRoot, bytes32 indexed newRoot);
    event InventoryDeposited(uint256 amount);
    event SaleOpened(uint256 openedAt, uint256 endsAt);
    event SaleClosed(uint256 closedAt, uint256 raised);
    event Purchased(address indexed buyer, uint256 paid, uint256 tokens, uint256 buyerTotal);
    event LiquidityRevenueDeposited(address indexed sponsor, uint256 amount, uint256 totalReceived);
    event InitialLiquidityCreated(uint256 ethAmount, uint256 tokenAmount, address indexed pair, address indexed lpLock, uint256 unlockAt);
    event FutureLiquidityAdded(uint256 ethAmount, uint256 tokenAmount, address indexed pair, address indexed lpLock, uint256 unlockAt);
    event ProjectFundsWithdrawn(address indexed recipient, uint256 amount, uint256 remaining);
    event ManagerAllocationReleased(address indexed recipient, uint256 amount);
    event TeamVestingCreated(address indexed vesting, address indexed beneficiary, uint256 amount, uint256 start, uint256 cliff, uint256 monthlyReleases);
    event AllocationDistributed(bytes32 indexed category, address indexed recipient, uint256 amount, bytes32 indexed referenceId);
    event AirdropBatch(address indexed operator, bytes32 indexed campaignId, uint256 recipientCount, uint256 totalAmount);
    event UnsoldTokensBurned(uint256 amount);
    event CancelledBeforeOpen(address indexed sponsor, uint256 inventoryReturned);
    event SettlementCompletedWithoutPool(uint256 unsoldBurned);

    modifier onlySponsor() {
        require(msg.sender == sponsor, "Not sponsor");
        _;
    }

    constructor(address token_, address sponsor_, address router_, address teamBeneficiary_, uint256 lpLockDuration_) {
        require(token_.code.length > 0 && router_.code.length > 0, "Invalid contract address");
        require(sponsor_ != address(0) && teamBeneficiary_ != address(0), "Invalid wallet");
        require(sponsor_ != token_ && sponsor_ != router_ && teamBeneficiary_ != address(this), "Invalid wallet");
        require(lpLockDuration_ >= MIN_LP_LOCK && lpLockDuration_ <= MAX_LP_LOCK, "LP lock must be 12-24 months");

        IERC20 tokenContract = IERC20(token_);
        require(tokenContract.totalSupply() == TOTAL_INVENTORY, "RVYN supply mismatch");
        token = tokenContract;
        sponsor = sponsor_;
        teamBeneficiary = teamBeneficiary_;
        router = IV2Router(router_);
        lpLockDuration = lpLockDuration_;

        address factory_ = router.factory();
        address weth_ = router.WETH();
        require(factory_.code.length > 0 && weth_.code.length > 0 && weth_ != token_, "Invalid DEX");
        factory = factory_;
        weth = weth_;
    }

    receive() external payable {
        revert("Use depositLiquidityRevenue");
    }

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

    function open() external onlySponsor nonReentrant {
        require(state == State.Pending && allowlistRoot != bytes32(0), "Set allowlist first");
        require(inventoryDeposited && token.balanceOf(address(this)) == TOTAL_INVENTORY, "Deposit inventory first");
        openedAt = block.timestamp;
        endsAt = block.timestamp + DURATION;
        state = State.Open;

        token.safeTransfer(sponsor, MANAGER_ALLOCATION);
        managerAllocationReleased = true;
        teamVesting = address(new RovynTeamVesting(token, teamBeneficiary, address(this), openedAt, TEAM_ALLOCATION));
        token.safeTransfer(teamVesting, TEAM_ALLOCATION);

        emit ManagerAllocationReleased(sponsor, MANAGER_ALLOCATION);
        emit TeamVestingCreated(teamVesting, teamBeneficiary, TEAM_ALLOCATION, openedAt, openedAt + 365 days, 24);
        emit SaleOpened(openedAt, endsAt);
    }

    function buy(uint256 wholeTokens, bytes32[] calldata proof) external payable nonReentrant {
        require(state == State.Open && block.timestamp < endsAt && raised < HARD_CAP, "Sale not open");
        require(MerkleProof.verify(proof, allowlistRoot, _leaf(msg.sender)), "Not allowlisted");
        require(wholeTokens > 0 && wholeTokens <= 2500 && msg.value == wholeTokens * PRICE, "Invalid payment");
        uint256 newContribution = contributions[msg.sender] + msg.value;
        require(newContribution <= WALLET_CAP && raised + msg.value <= HARD_CAP, "Sale cap exceeded");

        contributions[msg.sender] = newContribution;
        raised += msg.value;
        uint256 tokenAmount = wholeTokens * 1 ether;
        token.safeTransfer(msg.sender, tokenAmount);
        emit Purchased(msg.sender, msg.value, tokenAmount, newContribution);

        if (raised == HARD_CAP) {
            closedAt = block.timestamp;
            state = State.Closed;
            emit SaleClosed(closedAt, raised);
        }
    }

    function close() external onlySponsor {
        require(state == State.Open, "Sale not open");
        closedAt = block.timestamp;
        state = State.Closed;
        emit SaleClosed(closedAt, raised);
    }

    function cancelBeforeOpen() external onlySponsor nonReentrant {
        require(state == State.Pending, "Sale already started");
        state = State.Cancelled;
        uint256 balance = token.balanceOf(address(this));
        if (balance > 0) token.safeTransfer(sponsor, balance);
        emit CancelledBeforeOpen(sponsor, balance);
    }

    /// @notice Manually forwarded launchpad revenue is tracked separately from presale proceeds.
    function depositLiquidityRevenue() external payable onlySponsor {
        require(state == State.Open || state == State.Closed, "Sale not open or closed");
        require(msg.value > 0, "Zero amount");
        liquidityRevenueReceived += msg.value;
        emit LiquidityRevenueDeposited(msg.sender, msg.value, liquidityRevenueReceived);
    }

    function _addLiquidity(uint256 ethAmount, uint256 tokenAmount, uint256 deadline)
        internal returns (address pairAddress, uint256 liquidity)
    {
        require(deadline >= block.timestamp && deadline <= block.timestamp + 10 minutes, "Invalid deadline");
        pairAddress = IV2Factory(factory).getPair(address(token), weth);
        if (pairAddress != address(0)) require(IERC20(pairAddress).totalSupply() == 0, "Pool already initialized");

        token.forceApprove(address(router), tokenAmount);
        (uint256 usedTokens, uint256 usedEth, uint256 minted) = router.addLiquidityETH{value: ethAmount}(
            address(token), tokenAmount, tokenAmount, ethAmount, address(this), deadline
        );
        token.forceApprove(address(router), 0);
        require(usedTokens == tokenAmount && usedEth == ethAmount && minted > 0, "Unexpected liquidity amounts");

        pairAddress = IV2Factory(factory).getPair(address(token), weth);
        require(pairAddress.code.length > 0 && IERC20(pairAddress).balanceOf(address(this)) >= minted, "LP not received");
        IV2Pair pairContract = IV2Pair(pairAddress);
        address token0 = pairContract.token0();
        address token1 = pairContract.token1();
        require((token0 == address(token) && token1 == weth) || (token1 == address(token) && token0 == weth), "Wrong pair");
        (uint112 reserve0, uint112 reserve1,) = pairContract.getReserves();
        require((token0 == address(token) ? uint256(reserve0) : uint256(reserve1)) >= tokenAmount, "Token reserve check");
        require((token0 == weth ? uint256(reserve0) : uint256(reserve1)) >= ethAmount, "ETH reserve check");
        liquidity = minted;
    }

    function createInitialPool(uint256 ethAmount) external onlySponsor nonReentrant {
        require(state == State.Closed && (raised > 0 || liquidityRevenueReceived > 0), "Close sale first or no pool funds");
        uint256 maxLiquidityEth = raised / 2 + liquidityRevenueReceived;
        require(ethAmount > 0 && ethAmount <= maxLiquidityEth, "Exceeds liquidity budget");
        require(ethAmount <= address(this).balance, "Insufficient ETH");

        uint256 tokenAmount = ethAmount * 1 ether / PRICE;
        require(tokenAmount > 0 && tokenAmount <= LP_ALLOCATION, "Invalid pool token amount");
        uint256 sold = raised * 1 ether / PRICE;
        require(sold <= SALE_TOKENS, "Sale inventory exceeded");

        state = State.Settled;
        initialPoolEth = ethAmount;
        initialPoolTokens = tokenAmount;
        lpTokensDeployed = tokenAmount;

        (address pairAddress, uint256 liquidity) = _addLiquidity(ethAmount, tokenAmount, block.timestamp + 5 minutes);
        address lockAddress = address(new GenesisTokenLock(pairAddress, sponsor, block.timestamp + lpLockDuration, 0));
        IERC20(pairAddress).safeTransfer(lockAddress, liquidity);
        pair = pairAddress;
        initialLpLock = lockAddress;

        uint256 unsold = SALE_TOKENS - sold;
        if (unsold > 0) {
            IBurnable(address(token)).burn(unsold);
            unsoldBurned = unsold;
            emit UnsoldTokensBurned(unsold);
        }
        emit InitialLiquidityCreated(ethAmount, tokenAmount, pairAddress, lockAddress, block.timestamp + lpLockDuration);
    }

    /// @notice Close a sale with no buyers and no forwarded launchpad revenue without inventing a failed-sale refund state.
    /// @dev No buyer funds exist to refund. The unused sale allocation follows the agreed burn policy.
    function settleWithoutPool() external onlySponsor nonReentrant {
        require(state == State.Closed && raised == 0 && liquidityRevenueReceived == 0, "Pool funds remain");
        state = State.Settled;
        IBurnable(address(token)).burn(SALE_TOKENS);
        unsoldBurned = SALE_TOKENS;
        emit UnsoldTokensBurned(SALE_TOKENS);
        emit SettlementCompletedWithoutPool(SALE_TOKENS);
    }

    /// @notice Add later liquidity using the reserved RVYN allocation and fresh ETH.
    /// @dev The sponsor must choose amounts matching the live pool ratio; LP is locked per addition.
    function addFutureLiquidity(
        uint256 tokenDesired,
        uint256 tokenMin,
        uint256 ethMin,
        uint256 deadline
    ) external payable onlySponsor nonReentrant {
        require(state == State.Settled && pair != address(0), "Initial pool required");
        require(msg.value > 0 && tokenDesired > 0 && tokenDesired <= lpTokensRemaining(), "Invalid amount");
        token.forceApprove(address(router), tokenDesired);
        (uint256 usedTokens, uint256 usedEth, uint256 minted) = router.addLiquidityETH{value: msg.value}(
            address(token), tokenDesired, tokenMin, ethMin, address(this), deadline
        );
        token.forceApprove(address(router), 0);
        require(usedTokens == tokenDesired && usedEth == msg.value && minted > 0, "Adjust to pool ratio");
        require(IV2Factory(factory).getPair(address(token), weth) == pair, "Pair changed");
        address lockAddress = address(new GenesisTokenLock(pair, sponsor, block.timestamp + lpLockDuration, 0));
        IERC20(pair).safeTransfer(lockAddress, minted);
        lpTokensDeployed += usedTokens;
        emit FutureLiquidityAdded(usedEth, usedTokens, pair, lockAddress, block.timestamp + lpLockDuration);
    }

    function lpTokensRemaining() public view returns (uint256) {
        return LP_ALLOCATION - lpTokensDeployed;
    }

    function withdrawProjectFunds(uint256 amount) external onlySponsor nonReentrant {
        require(state == State.Settled && amount > 0, "Pool settlement required");
        uint256 available = withdrawableProjectEth();
        require(amount <= available, "Amount exceeds available funds");
        projectEthWithdrawn += amount;
        (bool ok,) = payable(sponsor).call{value: amount}("");
        require(ok, "ETH transfer failed");
        emit ProjectFundsWithdrawn(sponsor, amount, available - amount);
    }

    function withdrawableProjectEth() public view returns (uint256) {
        if (state != State.Settled) return 0;
        uint256 received = raised + liquidityRevenueReceived;
        uint256 committed = initialPoolEth + projectEthWithdrawn;
        return received > committed ? received - committed : 0;
    }

    function distributeProduct(address recipient, uint256 amount, bytes32 referenceId) external onlySponsor nonReentrant {
        _distribute(recipient, amount, referenceId, true);
    }

    function distributeCommunity(address recipient, uint256 amount, bytes32 referenceId) external onlySponsor nonReentrant {
        _distribute(recipient, amount, referenceId, false);
    }

    function _distribute(address recipient, uint256 amount, bytes32 referenceId, bool product) internal {
        require(state == State.Open || state == State.Closed || state == State.Settled, "Sale not started");
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
        require(state == State.Open || state == State.Closed || state == State.Settled, "Sale not started");
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
