// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

interface IBurnableERC20 {
    function burn(uint256 amount) external;
}

/// @notice The Core Light Pool holds the RVYN that Lightdive pays to players. Summons, renewals, departure costs, claim
/// fees, supplies and market tax flow in; RVYN only leaves as rewards a dive has earned (to the player who claims them) or as the
/// burned share of a fee. There is no owner withdrawal.
/// @dev Accounting: balance = available + owed, where `owed` is credited to players and not yet claimed. A reward can
/// never be credited beyond `available`, so the pool can never owe more than it holds. Candidate, unaudited.
contract CoreLightPool3 is Ownable2Step {
    using SafeERC20 for IERC20;

    IERC20 public immutable rvyn;
    address public expedition;
    uint256 public owed;

    event ExpeditionSet(address expedition);
    event Funded(address indexed from, uint256 amount);
    event Credited(uint256 amount);
    event Paid(address indexed to, uint256 gross, uint256 fee, uint256 burned);
    event Burned(uint256 amount);
    event Collected(address indexed from, uint256 amount, uint256 burned);

    error NotExpedition();
    error AlreadySet();

    constructor(address owner_, IERC20 rvyn_) Ownable(owner_) {
        rvyn = rvyn_;
    }

    modifier onlyExpedition() {
        if (msg.sender != expedition) revert NotExpedition();
        _;
    }

    /// @notice RVYN in the pool that is not owed to anyone yet: the basis of each day's release.
    function available() public view returns (uint256) {
        uint256 bal = rvyn.balanceOf(address(this));
        return bal > owed ? bal - owed : 0;
    }

    function setExpedition(address expedition_) external onlyOwner {
        if (expedition != address(0)) revert AlreadySet();
        expedition = expedition_;
        emit ExpeditionSet(expedition_);
    }

    /// @notice Adds RVYN to the pool (the initial 1,000,000, or any later top-up).
    function fund(uint256 amount) external {
        rvyn.safeTransferFrom(msg.sender, address(this), amount);
        emit Funded(msg.sender, amount);
    }

    /// @notice Sets aside a reward for a player; returns what was actually credited (never more than available).
    function credit(uint256 amount) external onlyExpedition returns (uint256 credited) {
        uint256 avail = available();
        credited = amount < avail ? amount : avail;
        owed += credited;
        emit Credited(credited);
    }

    /// @notice Pays a claim of `gross` minus `fee`. Of the fee, `burnShare` is burned and the rest stays in the pool.
    function pay(address to, uint256 gross, uint256 fee, uint256 burnShare) external onlyExpedition {
        owed -= gross;
        rvyn.safeTransfer(to, gross - fee);
        if (burnShare > 0) IBurnableERC20(address(rvyn)).burn(burnShare);
        emit Paid(to, gross, fee, burnShare);
    }

    /// @notice Takes a payment from a player into the pool (a supply bought at departure; the player has approved the
    /// pool) and burns `burnShare` of it.
    function collect(address from, uint256 amount, uint256 burnShare) external onlyExpedition {
        rvyn.safeTransferFrom(from, address(this), amount);
        if (burnShare > 0) IBurnableERC20(address(rvyn)).burn(burnShare);
        emit Collected(from, amount, burnShare);
    }

    /// @notice Burns part of a fee the pool kept (the burned share of a departure cost).
    function burn(uint256 amount) external onlyExpedition {
        uint256 avail = available();
        if (amount > avail) amount = avail;
        if (amount > 0) IBurnableERC20(address(rvyn)).burn(amount);
        emit Burned(amount);
    }
}
