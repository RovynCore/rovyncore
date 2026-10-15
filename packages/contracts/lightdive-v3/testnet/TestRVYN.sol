// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Test RVYN for the Lightdive testnet (Robinhood Chain testnet only). It has no value and never will: it
/// exists so anyone can play the testnet game. Any wallet may take `dripAmount` once every `dripEvery` seconds from
/// the in-game button; the owner mints what the Core Light Pool is seeded with. Burnable, like RVYN, because the game
/// burns part of every payment.
/// @dev Testnet only. The mainnet game uses the real RVYN token and has no faucet.
contract TestRVYN is ERC20, ERC20Burnable, Ownable2Step {
    uint256 public constant MAX_DRIP = 100_000 ether;

    uint256 public dripAmount = 1_000 ether;
    uint32 public dripEvery = 1 days;
    mapping(address => uint64) public lastDrip;

    event Dripped(address indexed to, uint256 amount);
    event DripSet(uint256 amount, uint32 every);

    error TooSoon(uint256 nextAt);
    error OutOfBounds();

    constructor(address owner_) ERC20("RovynCore Test RVYN", "tRVYN") Ownable(owner_) {}

    /// @notice When `who` may take test RVYN again (0 = now).
    function nextDripAt(address who) public view returns (uint256) {
        uint256 last = lastDrip[who];
        return last == 0 ? 0 : last + dripEvery;
    }

    function drip() external {
        uint256 next = nextDripAt(msg.sender);
        if (block.timestamp < next) revert TooSoon(next);
        lastDrip[msg.sender] = uint64(block.timestamp);
        _mint(msg.sender, dripAmount);
        emit Dripped(msg.sender, dripAmount);
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function setDrip(uint256 amount, uint32 every) external onlyOwner {
        if (amount == 0 || amount > MAX_DRIP || every < 1 hours || every > 7 days) revert OutOfBounds();
        dripAmount = amount;
        dripEvery = every;
        emit DripSet(amount, every);
    }
}
