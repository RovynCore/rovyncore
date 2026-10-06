// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {LightdiveConfig} from "./LightdiveConfig.sol";

/// @notice The Core Light Pool holds the RVYN that Lightdive pays to players.
/// RVYN can only leave through `pay`, called by the Expedition for rewards that daily emission
/// already assigned to a player. There is no owner withdrawal.
/// @dev Accounting: balance = available + reserved + owed.
///   reserved: emitted to closed days but not yet assigned to a settled dive
///   owed:     assigned to players and not yet claimed
/// A day's budget is fixed when the day closes: min(available * emissionRate, dayPoints * cap).
/// Candidate, unaudited.
contract CoreLightPool is Ownable2Step {
    using SafeERC20 for IERC20;

    uint256 public constant POINT_SCALE = 10_000; // dive points = luminance * depthCoefBp

    IERC20 public immutable rvyn;
    LightdiveConfig public immutable config;
    address public expedition;

    uint256 public reserved;
    uint256 public owed;
    mapping(uint32 => bool) public dayClosed;
    mapping(uint32 => uint256) public dayBudget;
    mapping(uint32 => uint256) public dayRemaining;

    event ExpeditionSet(address expedition);
    event Funded(address indexed from, uint256 amount);
    event DayClosed(uint32 indexed day, uint256 points, uint256 budget, uint256 availableBefore);
    event DayReleased(uint32 indexed day, uint256 unused);
    event Paid(address indexed to, uint256 gross, uint256 fee);

    error NotExpedition();
    error AlreadySet();
    error AlreadyClosed();

    constructor(address owner_, IERC20 rvyn_, LightdiveConfig config_) Ownable(owner_) {
        rvyn = rvyn_;
        config = config_;
    }

    modifier onlyExpedition() {
        if (msg.sender != expedition) revert NotExpedition();
        _;
    }

    function available() public view returns (uint256) {
        uint256 bal = rvyn.balanceOf(address(this));
        uint256 locked = reserved + owed;
        return bal > locked ? bal - locked : 0;
    }

    function setExpedition(address expedition_) external onlyOwner {
        if (expedition != address(0)) revert AlreadySet();
        expedition = expedition_;
        emit ExpeditionSet(expedition_);
    }

    /// @notice Adds RVYN to the pool (the initial seed, or any later top-up).
    function fund(uint256 amount) external {
        rvyn.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    function closeDay(uint32 day, uint256 points) external onlyExpedition returns (uint256 budget) {
        if (dayClosed[day]) revert AlreadyClosed();
        uint256 avail = available();
        budget = avail * config.emissionRateBp() / config.BP();
        uint256 cap = points * config.yieldCapPerPoint() / POINT_SCALE;
        if (budget > cap) budget = cap;
        dayClosed[day] = true;
        dayBudget[day] = budget;
        dayRemaining[day] = budget;
        reserved += budget;
        emit DayClosed(day, points, budget, avail);
    }

    /// @notice Moves a settled dive's reward from the day's budget to `owed`. Lucky days can pay
    /// slightly more than the budget (multipliers average 1.00, not exactly 1.00 per day); the
    /// difference comes from the available balance, so the pool can never pay out more than it holds.
    function assign(uint32 day, uint256 amount) external onlyExpedition returns (uint256 assigned) {
        uint256 fromBudget = amount < dayRemaining[day] ? amount : dayRemaining[day];
        dayRemaining[day] -= fromBudget;
        reserved -= fromBudget;
        uint256 extra = amount - fromBudget;
        uint256 avail = available();
        if (extra > avail) extra = avail;
        assigned = fromBudget + extra;
        owed += assigned;
    }

    /// @notice Returns a fully settled day's unused budget to the available balance.
    function releaseDay(uint32 day) external onlyExpedition {
        uint256 unused = dayRemaining[day];
        dayRemaining[day] = 0;
        reserved -= unused;
        emit DayReleased(day, unused);
    }

    /// @notice Pays a claim. The fee is not transferred anywhere: it stays in the pool.
    function pay(address to, uint256 gross, uint256 fee) external onlyExpedition {
        owed -= gross;
        rvyn.safeTransfer(to, gross - fee);
        emit Paid(to, gross, fee);
    }
}
