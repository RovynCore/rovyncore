// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice Hourly commit-reveal randomness for Lightdive mints and dives.
/// The operator commits keccak256(seed) for an hour before that hour starts. Mints and dives are
/// only accepted in hours that already have a commitment, so the operator cannot choose a seed
/// after seeing requests. After the hour ends anyone holding the seed may reveal it, and every
/// request of that hour mixes the seed with its own entropy (a blockhash taken at request time).
/// If a seed is not revealed within REVEAL_TIMEOUT the hour expires: consumers then fall back to
/// a neutral result (dives: multiplier 1.00) or to the request's own entropy (mints).
/// @dev Candidate, unaudited. Replace with a VRF (Pyth Entropy / Chainlink VRF) on mainnet if one
/// is available on Robinhood Chain; consumers only depend on `randomFor`.
contract RandomnessBeacon is Ownable2Step {
    uint256 public constant REVEAL_TIMEOUT = 48 hours;

    address public operator;
    mapping(uint64 => bytes32) public commitment;
    mapping(uint64 => bytes32) public seedOf;
    mapping(uint64 => bool) public revealed;

    event OperatorSet(address operator);
    event Committed(uint64 indexed hour, bytes32 commitment);
    event Revealed(uint64 indexed hour, bytes32 seed);

    error NotOperator();
    error NotFuture();
    error AlreadyCommitted();
    error HourNotOver();
    error WrongSeed();

    constructor(address owner_, address operator_) Ownable(owner_) {
        operator = operator_;
        emit OperatorSet(operator_);
    }

    function currentHour() public view returns (uint64) {
        return uint64(block.timestamp / 1 hours);
    }

    function hasCommitment(uint64 hour) external view returns (bool) {
        return commitment[hour] != bytes32(0);
    }

    /// @return ready whether a value can be used now
    /// @return fallbackUsed true when the hour expired without a reveal
    /// @return r the random value (0 when not ready)
    function randomFor(uint64 hour, bytes32 salt) external view returns (bool ready, bool fallbackUsed, uint256 r) {
        if (revealed[hour]) return (true, false, uint256(keccak256(abi.encode(seedOf[hour], salt))));
        if (block.timestamp >= (uint256(hour) + 1) * 1 hours + REVEAL_TIMEOUT) {
            return (true, true, uint256(keccak256(abi.encode(salt, "lightdive.fallback"))));
        }
        return (false, false, 0);
    }

    /// @notice Commits seeds for `hashes.length` consecutive hours starting at `startHour`.
    function commit(uint64 startHour, bytes32[] calldata hashes) external {
        if (msg.sender != operator) revert NotOperator();
        if (startHour <= currentHour()) revert NotFuture();
        for (uint256 i; i < hashes.length; ++i) {
            uint64 hour = startHour + uint64(i);
            if (commitment[hour] != bytes32(0)) revert AlreadyCommitted();
            if (hashes[i] == bytes32(0)) revert WrongSeed();
            commitment[hour] = hashes[i];
            emit Committed(hour, hashes[i]);
        }
    }

    /// @notice Anyone may reveal: only the committed seed passes the check.
    function reveal(uint64 hour, bytes32 seed) external {
        if (hour >= currentHour()) revert HourNotOver();
        if (revealed[hour] || keccak256(abi.encode(seed)) != commitment[hour]) revert WrongSeed();
        revealed[hour] = true;
        seedOf[hour] = seed;
        emit Revealed(hour, seed);
    }

    function setOperator(address operator_) external onlyOwner {
        operator = operator_;
        emit OperatorSet(operator_);
    }
}
