// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IRoundRandomness} from "../RoundRandomness.sol";

/// @notice Test-only randomness with drand's timing: a round becomes usable at its publication time, and its "proof"
/// is any 64 bytes the test chooses, so tests can steer outcomes. Never deploy outside tests.
contract MockRandomness is IRoundRandomness {
    uint256 public constant GENESIS = 1727521075;
    uint256 public constant PERIOD = 3;

    error NotPublished();
    error BadProof();

    function roundAt(uint256 t) public pure returns (uint64) {
        if (t <= GENESIS) return 1;
        return uint64((t - GENESIS + PERIOD - 1) / PERIOD + 1);
    }

    function roundTime(uint64 round) public pure returns (uint256) {
        return GENESIS + (uint256(round) - 1) * PERIOD;
    }

    function randomness(uint64 round, bytes calldata proof) external view returns (bytes32) {
        if (block.timestamp < roundTime(round)) revert NotPublished();
        if (proof.length != 64) revert BadProof();
        return keccak256(abi.encode(round, proof));
    }
}
