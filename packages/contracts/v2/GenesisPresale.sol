// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

interface IV2Router {
    function factory() external view returns(address);
    function WETH() external view returns(address);
    function addLiquidityETH(address,uint,uint,uint,address,uint) external payable returns(uint,uint,uint);
}
interface IV2Factory { function getPair(address,address) external view returns(address); }
interface IV2Pair is IERC20 {
    function token0() external view returns(address);
    function token1() external view returns(address);
    function getReserves() external view returns(uint112,uint112,uint32);
}
interface IBurnable {
    function burn(uint256 amount) external;
}

/// @notice Non-upgradeable, fixed-beneficiary ERC20 lock. No admin/rescue path.
contract GenesisTokenLock is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    address public immutable beneficiary;
    uint256 public immutable start;
    uint256 public immutable duration;
    uint256 public released;
    event Released(uint256 amount);
    constructor(address token_,address beneficiary_,uint256 start_,uint256 duration_) {
        require(token_.code.length>0 && beneficiary_!=address(0), 'Invalid lock');
        token=IERC20(token_);beneficiary=beneficiary_;start=start_;duration=duration_;
    }
    function releasable() public view returns(uint256) {
        if(block.timestamp<start)return 0;
        uint256 total=token.balanceOf(address(this))+released;
        uint256 vested=duration==0 || block.timestamp>=start+duration ? total : total*(block.timestamp-start)/duration;
        return vested-released;
    }
    function release() external nonReentrant {
        uint256 amount=releasable();require(amount>0,'Locked');
        released+=amount;token.safeTransfer(beneficiary,amount);emit Released(amount);
    }
}

/// @notice RVYN-only refundable presale. Not the legacy instant-delivery GenesisSale.
/// @dev Router/factory/WETH MUST be independently verified before real deployment.
/// A malicious constructor router cannot be made trustworthy by interface checks.
contract GenesisPresale is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant PRICE=0.0001 ether;
    uint256 public constant SOFT_CAP=0 ether;
    // At 0.0001 ETH per token, the 1,000,000-token presale can raise 100 ETH.
    uint256 public constant HARD_CAP=100 ether;
    uint256 public constant WALLET_CAP=0.25 ether;
    uint256 public constant SALE_TOKENS=1_000_000 ether;
    uint256 public constant LP_TOKENS=5_000_000 ether;
    uint256 public constant TEAM_TOKENS=2_000_000 ether;
    uint256 public constant REQUIRED_TOKENS=SALE_TOKENS+LP_TOKENS+TEAM_TOKENS;
    uint256 public constant DURATION=14 days;
    uint256 public constant SETTLEMENT_WINDOW=7 days;
    uint256 public constant TEAM_LOCK=730 days;
    uint256 public constant LIQUIDITY_LOCK=365 days;
    IERC20 public immutable token;
    address public immutable sponsor;
    IV2Router public immutable router;
    address public immutable factory;
    address public immutable weth;
    enum State { Pending, Open, Succeeded, Failed }
    State public state;
    uint256 public endsAt;
    uint256 public closedAt;
    uint256 public raised;
    uint256 public liquidityTokenAmount;
    uint256 public unsoldBurned;
    mapping(address=>uint256) public contributions;
    address public lpLock;
    address public teamLock;
    address public reserveLock;
    event Opened(uint256 endsAt);
    event Closed(uint256 closedAt);
    event Contributed(address indexed buyer,uint256 paid,uint256 total);
    event Failed();
    event Refunded(address indexed buyer,address indexed recipient,uint256 amount);
    event Claimed(address indexed buyer,address indexed recipient,uint256 tokens);
    event Settled(uint256 raised,address pair,address lpLock,address teamLock,address reserveLock);
    event UnsoldBurned(uint256 amount);
    event InventoryRecovered(uint256 amount);
    modifier onlySponsor(){require(msg.sender==sponsor,'Not sponsor');_;}
    constructor(address token_,address sponsor_,address router_) {
        require(token_.code.length>0 && router_.code.length>0 && sponsor_!=address(0),'Invalid address');
        require(sponsor_!=token_ && sponsor_!=router_ && sponsor_!=address(this),'Invalid sponsor');
        token=IERC20(token_);require(token.totalSupply()==10_000_000 ether,'RVYN supply');
        sponsor=sponsor_;router=IV2Router(router_);
        address f=router.factory();address w=router.WETH();
        require(f.code.length>0 && w.code.length>0 && w!=token_,'Invalid DEX');factory=f;weth=w;
    }
    function open() external onlySponsor nonReentrant {
        require(state==State.Pending,'Already started');
        uint256 beforeBalance=token.balanceOf(address(this));
        token.safeTransferFrom(sponsor,address(this),REQUIRED_TOKENS);
        require(token.balanceOf(address(this))==beforeBalance+REQUIRED_TOKENS,'Unsupported token');
        endsAt=block.timestamp+DURATION;state=State.Open;emit Opened(endsAt);
    }
    function buy(uint256 wholeTokens) external payable nonReentrant {
        require(state==State.Open && closedAt==0 && block.timestamp<endsAt && raised<HARD_CAP,'Not open');
        require(wholeTokens>0 && wholeTokens<=2500 && msg.value==wholeTokens*PRICE,'Payment');
        uint256 total=contributions[msg.sender]+msg.value;
        require(total<=WALLET_CAP && raised+msg.value<=HARD_CAP,'Cap');
        contributions[msg.sender]=total;raised+=msg.value;
        if(raised==HARD_CAP)closedAt=block.timestamp;
        emit Contributed(msg.sender,msg.value,total);
    }
    /// @notice Sponsor-controlled close; the sale is opened and closed manually.
    function close() external onlySponsor nonReentrant {
        require(state==State.Open,'Not open');
        closedAt=block.timestamp;
        emit Closed(closedAt);
    }
    function settlementDeadline() public view returns(uint256) {
        return (closedAt==0 ? endsAt : closedAt)+SETTLEMENT_WINDOW;
    }
    // Anyone may resolve failure; the sponsor cannot withdraw contributed ETH.
    function failSale() external {
        require(state==State.Open,'Not open');
        // With no soft-cap, an empty sale is refundable after its safety expiry;
        // a non-empty sale remains settleable until the settlement window ends.
        require((block.timestamp>=endsAt && raised==0) || block.timestamp>=settlementDeadline(),'Not failed');
        state=State.Failed;emit Failed();
    }
    function cancelBeforeOpen() external onlySponsor {
        require(state==State.Pending,'Already started');state=State.Failed;emit Failed();
    }
    function refund(address payable recipient) external nonReentrant {
        require(state==State.Failed && recipient!=address(0),'Not refundable');
        uint256 amount=contributions[msg.sender];require(amount>0,'Nothing owed');
        contributions[msg.sender]=0;
        (bool ok,)=recipient.call{value:amount}("");require(ok,'ETH failed');emit Refunded(msg.sender,recipient,amount);
    }
    // Atomic: add price-matched liquidity, lock reserves, and burn unsold presale inventory
    // before buyers can claim. All contributed ETH goes into the initial pool.
    // An existing manipulated/nonempty pool causes a revert, then timeout refunds.
    function settle() external nonReentrant {
        require(state==State.Open && raised>0 && (closedAt>0 || block.timestamp>=endsAt || raised==HARD_CAP),'Not ready');
        require(block.timestamp<settlementDeadline(),'Settlement expired');
        address pair=IV2Factory(factory).getPair(address(token),weth);
        if(pair!=address(0)) require(IERC20(pair).totalSupply()==0,'Pool already used');
        uint256 ethAmount=raised;
        uint256 tokenAmount=ethAmount*1 ether/PRICE;
        require(tokenAmount>0 && tokenAmount<=LP_TOKENS,'Liquidity amount');
        liquidityTokenAmount=tokenAmount;
        // Pair may be created by router. Temporary custody is within this transaction only.
        state=State.Succeeded;
        uint256 beforeTokens=token.balanceOf(address(this));
        token.forceApprove(address(router),tokenAmount);
        (uint256 usedTokens,uint256 usedETH,uint256 liquidity)=router.addLiquidityETH{value:ethAmount}(
            address(token),tokenAmount,tokenAmount,ethAmount,address(this),block.timestamp);
        token.forceApprove(address(router),0);
        require(usedTokens==tokenAmount && usedETH==ethAmount && liquidity>0,'Bad liquidity');
        require(token.balanceOf(address(this))==beforeTokens-tokenAmount,'Bad transfer');
        pair=IV2Factory(factory).getPair(address(token),weth);
        require(pair.code.length>0 && IERC20(pair).balanceOf(address(this))>=liquidity,'Missing LP');
        IV2Pair p=IV2Pair(pair);
        address t0=p.token0();address t1=p.token1();
        require((t0==address(token)&&t1==weth)||(t1==address(token)&&t0==weth),'Wrong pair');
        (uint112 r0,uint112 r1,)=p.getReserves();
        require((t0==address(token) ? uint256(r0) : uint256(r1))==tokenAmount,'Token reserves');
        require((t0==weth ? uint256(r0) : uint256(r1))==ethAmount,'ETH reserves');
        lpLock=address(new GenesisTokenLock(pair,sponsor,block.timestamp+LIQUIDITY_LOCK,0));
        teamLock=address(new GenesisTokenLock(address(token),sponsor,block.timestamp+TEAM_LOCK,0));
        reserveLock=address(new GenesisTokenLock(address(token),sponsor,block.timestamp+LIQUIDITY_LOCK,0));
        IERC20(pair).safeTransfer(lpLock,IERC20(pair).balanceOf(address(this)));
        token.safeTransfer(teamLock,TEAM_TOKENS);
        uint256 sold=raised*1 ether/PRICE;
        uint256 unsold=SALE_TOKENS-sold;
        if(unsold>0) {
            IBurnable(address(token)).burn(unsold);
            unsoldBurned=unsold;
            emit UnsoldBurned(unsold);
        }
        token.safeTransfer(reserveLock,LP_TOKENS-tokenAmount);
        emit Settled(raised,pair,lpLock,teamLock,reserveLock);
    }
    function claim(address recipient) external nonReentrant {
        require(state==State.Succeeded && recipient!=address(0),'Not claimable');
        uint256 amount=contributions[msg.sender];require(amount>0,'Nothing owed');contributions[msg.sender]=0;
        uint256 tokens=amount*1 ether/PRICE;token.safeTransfer(recipient,tokens);emit Claimed(msg.sender,recipient,tokens);
    }
    function recoverFailedInventory() external onlySponsor nonReentrant {
        require(state==State.Failed,'Not failed');uint256 amount=token.balanceOf(address(this));
        token.safeTransfer(sponsor,amount);emit InventoryRecovered(amount);
    }
}

/// @notice RVYN presale with an explicit, post-settlement treasury withdrawal.
/// @dev This is a separate non-upgradeable release. The sponsor chooses how much
/// raised ETH is committed to the initial pool; the remainder is withdrawable only
/// after the pool has been created successfully. No withdrawal is possible while
/// the sale is Pending or Open, preserving the refund safety path until settlement.
contract GenesisPresaleV3 is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 public constant PRICE=0.0001 ether;
    uint256 public constant SOFT_CAP=0 ether;
    uint256 public constant HARD_CAP=100 ether;
    uint256 public constant WALLET_CAP=0.25 ether;
    uint256 public constant SALE_TOKENS=1_000_000 ether;
    uint256 public constant LP_TOKENS=5_000_000 ether;
    uint256 public constant TEAM_TOKENS=2_000_000 ether;
    uint256 public constant REQUIRED_TOKENS=SALE_TOKENS+LP_TOKENS+TEAM_TOKENS;
    uint256 public constant DURATION=14 days;
    uint256 public constant SETTLEMENT_WINDOW=7 days;
    uint256 public constant TEAM_LOCK=730 days;
    uint256 public constant LIQUIDITY_LOCK=365 days;
    IERC20 public immutable token;
    address public immutable sponsor;
    IV2Router public immutable router;
    address public immutable factory;
    address public immutable weth;
    enum State { Pending, Open, Succeeded, Failed }
    State public state;
    uint256 public endsAt;
    uint256 public closedAt;
    uint256 public raised;
    uint256 public liquidityTokenAmount;
    uint256 public poolEthAmount;
    uint256 public withdrawnEth;
    uint256 public unsoldBurned;
    mapping(address=>uint256) public contributions;
    address public lpLock;
    address public teamLock;
    address public reserveLock;
    event Opened(uint256 endsAt);
    event InventoryDeposited(uint256 amount);
    event Closed(uint256 closedAt);
    event Contributed(address indexed buyer,uint256 paid,uint256 total);
    event Failed();
    event Refunded(address indexed buyer,address indexed recipient,uint256 amount);
    event Claimed(address indexed buyer,address indexed recipient,uint256 tokens);
    event Settled(uint256 raised,uint256 poolEth,uint256 poolTokens,address pair);
    event UnsoldBurned(uint256 amount);
    event InventoryRecovered(uint256 amount);
    event ProceedsWithdrawn(address indexed sponsor,uint256 amount,uint256 remaining);
    modifier onlySponsor(){require(msg.sender==sponsor,'Not sponsor');_;}
    constructor(address token_,address sponsor_,address router_) {
        require(token_.code.length>0 && router_.code.length>0 && sponsor_!=address(0),'Invalid address');
        require(sponsor_!=token_ && sponsor_!=router_ && sponsor_!=address(this),'Invalid sponsor');
        token=IERC20(token_);require(token.totalSupply()==10_000_000 ether,'RVYN supply');
        sponsor=sponsor_;router=IV2Router(router_);
        address f=router.factory();address w=router.WETH();
        require(f.code.length>0 && w.code.length>0 && w!=token_,'Invalid DEX');factory=f;weth=w;
    }
    function depositInventory() external onlySponsor nonReentrant {
        require(state==State.Pending,'Already started');
        require(token.balanceOf(address(this))==0,'Inventory already deposited');
        token.safeTransferFrom(sponsor,address(this),REQUIRED_TOKENS);
        require(token.balanceOf(address(this))==REQUIRED_TOKENS,'Unsupported token');
        emit InventoryDeposited(REQUIRED_TOKENS);
    }
    function open() external onlySponsor nonReentrant {
        require(state==State.Pending,'Already started');
        require(token.balanceOf(address(this))==REQUIRED_TOKENS,'Deposit inventory first');
        endsAt=block.timestamp+DURATION;state=State.Open;emit Opened(endsAt);
    }
    function buy(uint256 wholeTokens) external payable nonReentrant {
        require(state==State.Open && closedAt==0 && block.timestamp<endsAt && raised<HARD_CAP,'Not open');
        require(wholeTokens>0 && wholeTokens<=2500 && msg.value==wholeTokens*PRICE,'Payment');
        uint256 total=contributions[msg.sender]+msg.value;
        require(total<=WALLET_CAP && raised+msg.value<=HARD_CAP,'Cap');
        contributions[msg.sender]=total;raised+=msg.value;
        if(raised==HARD_CAP)closedAt=block.timestamp;
        emit Contributed(msg.sender,msg.value,total);
    }
    function close() external onlySponsor nonReentrant {
        require(state==State.Open,'Not open');
        closedAt=block.timestamp;emit Closed(closedAt);
    }
    function settlementDeadline() public view returns(uint256) {
        return (closedAt==0 ? endsAt : closedAt)+SETTLEMENT_WINDOW;
    }
    function failSale() external {
        require(state==State.Open,'Not open');
        require((block.timestamp>=endsAt && raised==0) || block.timestamp>=settlementDeadline(),'Not failed');
        state=State.Failed;emit Failed();
    }
    function cancelBeforeOpen() external onlySponsor {
        require(state==State.Pending,'Already started');state=State.Failed;emit Failed();
    }
    function refund(address payable recipient) external nonReentrant {
        require(state==State.Failed && recipient!=address(0),'Not refundable');
        uint256 amount=contributions[msg.sender];require(amount>0,'Nothing owed');
        contributions[msg.sender]=0;
        (bool ok,)=recipient.call{value:amount}("");require(ok,'ETH failed');emit Refunded(msg.sender,recipient,amount);
    }
    function _addLiquidity(uint256 ethAmount,uint256 tokenAmount) internal returns(address pair,uint256 liquidity) {
        pair=IV2Factory(factory).getPair(address(token),weth);
        if(pair!=address(0)) require(IERC20(pair).totalSupply()==0,'Pool already used');
        uint256 beforeTokens=token.balanceOf(address(this));
        token.forceApprove(address(router),tokenAmount);
        (uint256 usedTokens,uint256 usedETH,uint256 minted)=router.addLiquidityETH{value:ethAmount}(
            address(token),tokenAmount,tokenAmount,ethAmount,address(this),block.timestamp);
        token.forceApprove(address(router),0);
        require(usedTokens==tokenAmount && usedETH==ethAmount && minted>0,'Bad liquidity');
        require(token.balanceOf(address(this))==beforeTokens-tokenAmount,'Bad transfer');
        liquidity=minted;
        pair=IV2Factory(factory).getPair(address(token),weth);
        require(pair.code.length>0 && IERC20(pair).balanceOf(address(this))>=liquidity,'Missing LP');
        IV2Pair p=IV2Pair(pair);
        address t0=p.token0();address t1=p.token1();
        require((t0==address(token)&&t1==weth)||(t1==address(token)&&t0==weth),'Wrong pair');
        (uint112 r0,uint112 r1,)=p.getReserves();
        require((t0==address(token) ? uint256(r0) : uint256(r1))==tokenAmount,'Token reserves');
        require((t0==weth ? uint256(r0) : uint256(r1))==ethAmount,'ETH reserves');
    }
    /// @notice Create the initial RVYN/WETH pool with the sponsor-selected ETH amount.
    /// Only the sponsor may choose the amount and trigger settlement; it is still
    /// bounded by the recorded presale proceeds.
    function createPool(uint256 ethAmount) external onlySponsor nonReentrant {
        require(state==State.Open && raised>0 && (closedAt>0 || block.timestamp>=endsAt || raised==HARD_CAP),'Not ready');
        require(block.timestamp<settlementDeadline(),'Settlement expired');
        require(ethAmount>0 && ethAmount<=raised,'Pool amount');
        uint256 tokenAmount=ethAmount*1 ether/PRICE;
        require(tokenAmount>0 && tokenAmount<=LP_TOKENS,'Liquidity amount');
        liquidityTokenAmount=tokenAmount;poolEthAmount=ethAmount;
        state=State.Succeeded;
        (address pair,)=_addLiquidity(ethAmount,tokenAmount);
        lpLock=address(new GenesisTokenLock(pair,sponsor,block.timestamp+LIQUIDITY_LOCK,0));
        teamLock=address(new GenesisTokenLock(address(token),sponsor,block.timestamp+TEAM_LOCK,0));
        reserveLock=address(new GenesisTokenLock(address(token),sponsor,block.timestamp+LIQUIDITY_LOCK,0));
        IERC20(pair).safeTransfer(lpLock,IERC20(pair).balanceOf(address(this)));
        token.safeTransfer(teamLock,TEAM_TOKENS);
        uint256 sold=raised*1 ether/PRICE;
        uint256 unsold=SALE_TOKENS-sold;
        if(unsold>0) {
            IBurnable(address(token)).burn(unsold);
            unsoldBurned=unsold;emit UnsoldBurned(unsold);
        }
        token.safeTransfer(reserveLock,LP_TOKENS-tokenAmount);
        emit Settled(raised,ethAmount,tokenAmount,pair);
    }
    /// @notice Withdraw only the recorded ETH not committed to the initial pool.
    /// This is intentionally unavailable until createPool succeeds.
    function withdraw(uint256 amount) external onlySponsor nonReentrant {
        require(state==State.Succeeded,'Not settled');
        uint256 available=raised-poolEthAmount-withdrawnEth;
        require(amount>0 && amount<=available,'Amount');
        withdrawnEth+=amount;
        (bool ok,)=payable(sponsor).call{value:amount}("");require(ok,'ETH failed');
        emit ProceedsWithdrawn(sponsor,amount,available-amount);
    }
    function withdrawableEth() external view returns(uint256) {
        if(state!=State.Succeeded) return 0;
        return raised-poolEthAmount-withdrawnEth;
    }
    function claim(address recipient) external nonReentrant {
        require(state==State.Succeeded && recipient!=address(0),'Not claimable');
        uint256 amount=contributions[msg.sender];require(amount>0,'Nothing owed');contributions[msg.sender]=0;
        uint256 tokens=amount*1 ether/PRICE;token.safeTransfer(recipient,tokens);emit Claimed(msg.sender,recipient,tokens);
    }
    function recoverFailedInventory() external onlySponsor nonReentrant {
        require(state==State.Failed,'Not failed');uint256 amount=token.balanceOf(address(this));
        token.safeTransfer(sponsor,amount);emit InventoryRecovered(amount);
    }
}
