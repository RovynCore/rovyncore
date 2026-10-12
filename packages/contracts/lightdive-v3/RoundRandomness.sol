// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {DrandEvmnet} from "./DrandEvmnet.sol";

/// @notice Where Lightdive gets randomness: a value per drand round that anyone can supply with its proof.
interface IRoundRandomness {
    /// @notice The first round published at or after time `t`.
    function roundAt(uint256 t) external view returns (uint64);
    /// @notice When `round` is published.
    function roundTime(uint64 round) external view returns (uint256);
    /// @notice The randomness of `round`, checked against `proof`. Reverts if the proof is wrong.
    function randomness(uint64 round, bytes calldata proof) external view returns (bytes32);
}

/// @notice The production source: drand evmnet, verified on chain. No owner, no operator, nothing to configure.
/// @dev Candidate, unaudited.
contract DrandEvmnetRandomness is IRoundRandomness {
    function roundAt(uint256 t) external pure returns (uint64) {
        return DrandEvmnet.roundAt(t);
    }

    function roundTime(uint64 round) external pure returns (uint256) {
        return DrandEvmnet.roundTime(round);
    }

    function randomness(uint64 round, bytes calldata proof) external view returns (bytes32) {
        return DrandEvmnet.verify(round, proof);
    }
}
