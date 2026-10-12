// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {DrandEvmnet} from "../DrandEvmnet.sol";

/// @notice Test-only: exposes the drand library so tests can check real evmnet rounds and measure gas.
contract DrandProbe {
    bytes32 public last;

    function check(uint64 round, bytes calldata signature) external view returns (bytes32) {
        return DrandEvmnet.verify(round, signature);
    }

    function store(uint64 round, bytes calldata signature) external {
        last = DrandEvmnet.verify(round, signature);
    }

    function roundAt(uint256 t) external pure returns (uint64) {
        return DrandEvmnet.roundAt(t);
    }

    function roundTime(uint64 round) external pure returns (uint256) {
        return DrandEvmnet.roundTime(round);
    }
}
