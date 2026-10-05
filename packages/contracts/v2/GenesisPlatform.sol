// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from '@openzeppelin/contracts/token/ERC20/ERC20.sol';
import {ERC20Burnable} from '@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import {SafeERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import {Ownable} from '@openzeppelin/contracts/access/Ownable.sol';
import {Ownable2Step} from '@openzeppelin/contracts/access/Ownable2Step.sol';
import {ReentrancyGuard} from '@openzeppelin/contracts/utils/ReentrancyGuard.sol';

/// @notice Non-upgradeable fixed supply. No owner, mint, tax, blacklist or pause.
contract LaunchToken is ERC20, ERC20Burnable {
    constructor(string memory name_, string memory symbol_, uint256 supply_, address creator_) ERC20(name_, symbol_) {
        _mint(creator_, supply_);
    }
}

/// @notice Factory, event-based registry and expiring paid promotion.
/// @dev Fees accrue as pull payments so a Treasury contract cannot block launches.
contract GenesisPlatform is Ownable2Step, ReentrancyGuard {
    struct Plan { uint256 price; uint64 duration; uint32 units; bool enabled; }
    uint256 public launchFee;
    address public treasury;
    address public pendingTreasury;
    event TreasuryProposed(address indexed currentTreasury, address indexed proposedTreasury);
    event TreasuryAccepted(address indexed previousTreasury, address indexed newTreasury);
    bool public paused;
    uint256 public tokenCount;
    mapping(address => bool) public isToken;
    mapping(uint8 => Plan) public plans;
    mapping(address => uint256) public proceeds;
    event TokenCreated(address indexed token, address indexed creator, uint256 indexed sequence, string name, string symbol, uint256 supply, string metadataURI);
    event BoostPurchased(address indexed token, address indexed buyer, uint8 plan, uint32 units, uint64 expiresAt, uint256 paid);
    event FeesUpdated(uint256 launchFee, address treasury);
    event PlanUpdated(uint8 indexed plan, uint256 price, uint64 duration, uint32 units, bool enabled);
    event Paused(bool paused);
    event ProceedsWithdrawn(address indexed treasury, uint256 amount);
    error InvalidInput(); error WrongPayment(); error Unavailable(); error TransferFailed();

    constructor(address owner_, address treasury_, uint256 fee_) Ownable(owner_) {
        if(treasury_ != owner_ || treasury_ == address(this) || fee_ > 0.01 ether) revert InvalidInput();
        treasury=treasury_; launchFee=fee_;
        plans[0]=Plan(0.0006 ether,1 days,10,true);
        plans[1]=Plan(0.0024 ether,1 days,50,true);
        plans[2]=Plan(0.0045 ether,1 days,100,true);
    }
    function launch(string calldata name_, string calldata symbol_, uint256 supply_, string calldata metadataURI) external payable nonReentrant returns(address token) {
        if(paused) revert Unavailable();
        // Reserve Genesis #001 for the platform owner; later launches are permissionless.
        if(tokenCount==0 && msg.sender!=owner()) revert Unavailable();
        if(bytes(name_).length==0 || bytes(name_).length>64 || bytes(symbol_).length==0 || bytes(symbol_).length>12 || supply_<1 ether || supply_>1_000_000_000_000 ether || bytes(metadataURI).length>200) revert InvalidInput();
        if(msg.value!=launchFee) revert WrongPayment();
        token=address(new LaunchToken(name_,symbol_,supply_,msg.sender));
        isToken[token]=true; tokenCount++; proceeds[treasury]+=msg.value;
        emit TokenCreated(token,msg.sender,tokenCount,name_,symbol_,supply_,metadataURI);
    }
    function boost(address token, uint8 planId) external payable nonReentrant {
        Plan memory p=plans[planId];
        if(paused || !isToken[token] || !p.enabled) revert Unavailable();
        if(msg.value!=p.price) revert WrongPayment();
        proceeds[treasury]+=msg.value;
        emit BoostPurchased(token,msg.sender,planId,p.units,uint64(block.timestamp)+p.duration,msg.value);
    }
    function setFees(uint256 fee, address recipient) external onlyOwner {
        if(recipient!=treasury || fee>0.01 ether) revert InvalidInput();
        launchFee=fee; treasury=recipient; emit FeesUpdated(fee,recipient);
    }
    // Recipient must explicitly accept before any new fees are routed to it.
    function proposeTreasury(address recipient) external onlyOwner {
        if(recipient==address(0) || recipient==address(this) || isToken[recipient] || recipient==treasury) revert InvalidInput();
        pendingTreasury=recipient;
        emit TreasuryProposed(treasury,recipient);
    }
    function cancelTreasuryProposal() external onlyOwner {
        pendingTreasury=address(0);
        emit TreasuryProposed(treasury,address(0));
    }
    function acceptTreasury() external {
        if(msg.sender!=pendingTreasury || pendingTreasury==address(0)) revert InvalidInput();
        address previous=treasury;
        treasury=msg.sender; pendingTreasury=address(0);
        emit TreasuryAccepted(previous,msg.sender);
    }
    // Ownership transfer must not leave an outgoing owner's Treasury proposal live.
    function _transferOwnership(address newOwner) internal override {
        super._transferOwnership(newOwner);
        if(pendingTreasury!=address(0)) {
            pendingTreasury=address(0);
            emit TreasuryProposed(treasury,address(0));
        }
    }
    function renounceOwnership() public override onlyOwner { revert Unavailable(); }
    function setPlan(uint8 id, uint256 price, uint64 duration, uint32 units, bool enabled) external onlyOwner {
        if(id>2 || price>1 ether || duration<1 hours || duration>30 days || units==0 || units>10000) revert InvalidInput();
        plans[id]=Plan(price,duration,units,enabled); emit PlanUpdated(id,price,duration,units,enabled);
    }
    function setPaused(bool value) external onlyOwner {paused=value;emit Paused(value);}
    function withdraw() external nonReentrant {
        uint256 amount=proceeds[msg.sender]; if(amount==0) revert Unavailable();
        proceeds[msg.sender]=0;
        (bool ok,)=payable(msg.sender).call{value:amount}(""); if(!ok) revert TransferFailed();
        emit ProceedsWithdrawn(msg.sender,amount);
    }
}

/// @notice Inventory-backed fixed-price sale. No claims about future returns.
contract GenesisSale is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    address public treasury;
    uint256 public immutable pricePerToken;
    bool public active;
    mapping(address=>uint256) public proceeds;
    event Purchased(address indexed buyer,uint256 wholeTokens,uint256 paid);
    event ActiveChanged(bool active);
    event ProceedsWithdrawn(address indexed treasury,uint256 amount);
    event InventoryReclaimed(address indexed recipient,uint256 amount);
    error Unavailable(); error WrongPayment(); error TransferFailed();
    constructor(address owner_,address token_,address treasury_,uint256 price_) Ownable(owner_) {
        if(token_==address(0)||token_.code.length==0||treasury_!=owner_||treasury_==address(this)||treasury_==token_||price_==0) revert Unavailable();
        token=IERC20(token_);treasury=treasury_;pricePerToken=price_;
    }
    function renounceOwnership() public override onlyOwner { revert Unavailable(); }
    function setActive(bool value) external onlyOwner {active=value;emit ActiveChanged(value);}
    function buy(uint256 wholeTokens) external payable nonReentrant {
        if(!active||wholeTokens==0||wholeTokens>1_000_000) revert Unavailable();
        if(msg.value!=wholeTokens*pricePerToken) revert WrongPayment();
        proceeds[treasury]+=msg.value;
        token.safeTransfer(msg.sender,wholeTokens*1 ether);
        emit Purchased(msg.sender,wholeTokens,msg.value);
    }
    function withdraw() external nonReentrant {
        uint256 amount=proceeds[msg.sender];if(amount==0)revert Unavailable();proceeds[msg.sender]=0;
        (bool ok,)=payable(msg.sender).call{value:amount}("");if(!ok)revert TransferFailed();
        emit ProceedsWithdrawn(msg.sender,amount);
    }
    function reclaimInventory(uint256 amount) external onlyOwner {if(active)revert Unavailable();token.safeTransfer(owner(),amount);emit InventoryReclaimed(owner(),amount);}
}
