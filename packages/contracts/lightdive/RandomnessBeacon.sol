// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @notice One-minute commit-reveal randomness for Lightdive mints and dives, built on one hash
/// chain per UTC day.
///
/// Time is cut into slots of SLOT seconds; a UTC day has SLOTS_PER_DAY of them. For each day the
/// operator draws a chain v[SLOTS_PER_DAY-1] -> ... -> v[0] with v[i] = keccak256(v[i+1]) and
/// commits only anchor = keccak256(v[0]). Mints and dives are accepted only in slots whose day
/// already has an anchor, so the operator cannot pick seeds after seeing requests. After a slot
/// ends, anyone holding v[i] may reveal it: the contract hashes it forward to the last value it
/// knows. Revealing slot i also fixes every earlier slot of that day (v[j] = keccak^(i-j)(v[i]))
/// but nothing later, so one reveal per minute is enough and minutes without requests can be
/// skipped. Each request mixes the slot's seed with its own entropy (a blockhash taken at request
/// time). If a slot's seed is still unknown REVEAL_TIMEOUT after the slot ended, consumers fall
/// back to a neutral result (dives: multiplier 1.00) or to the request's own entropy (mints).
/// @dev Candidate, unaudited. The operator knows future seeds; replace with a VRF on mainnet once
/// one is available on Robinhood Chain. Consumers only depend on `currentSlot`, `hasCommitment`
/// and `randomFor`.
contract RandomnessBeacon is Ownable2Step {
    uint256 public constant SLOT = 1 minutes;
    uint256 public constant SLOTS_PER_DAY = 1 days / SLOT;
    uint256 public constant REVEAL_TIMEOUT = 48 hours;

    struct Chain {
        bytes32 anchor;
        bytes32 known; // latest revealed value, or the anchor before any reveal
        uint32 knownPlusOne; // index of `known` plus one; 0 = only the anchor is known
    }

    address public operator;
    mapping(uint32 => Chain) public chainOf; // by UTC day
    mapping(uint64 => bytes32) public revealedSeed; // by slot, for slots revealed directly

    event OperatorSet(address operator);
    event Committed(uint32 indexed day, bytes32 anchor);
    event Revealed(uint64 indexed slot, bytes32 seed);

    error NotOperator();
    error NotFuture();
    error AlreadyCommitted();
    error SlotNotOver();
    error WrongSeed();

    constructor(address owner_, address operator_) Ownable(owner_) {
        operator = operator_;
        emit OperatorSet(operator_);
    }

    function currentSlot() public view returns (uint64) {
        return uint64(block.timestamp / SLOT);
    }

    function dayOf(uint64 slot) public pure returns (uint32) {
        return uint32(slot / SLOTS_PER_DAY);
    }

    function hasCommitment(uint64 slot) external view returns (bool) {
        return chainOf[dayOf(slot)].anchor != bytes32(0);
    }

    /// @notice Whether the slot's seed is known, and the seed (0 when not).
    function seedOf(uint64 slot) public view returns (bool known, bytes32 seed) {
        seed = revealedSeed[slot];
        if (seed != bytes32(0)) return (true, seed);
        Chain storage c = chainOf[dayOf(slot)];
        uint256 index = slot % SLOTS_PER_DAY;
        if (index >= c.knownPlusOne) return (false, bytes32(0));
        return (true, _hashN(c.known, c.knownPlusOne - 1 - index));
    }

    /// @return ready whether a value can be used now
    /// @return fallbackUsed true when the slot expired without its seed
    /// @return r the random value (0 when not ready)
    function randomFor(uint64 slot, bytes32 salt) external view returns (bool ready, bool fallbackUsed, uint256 r) {
        (bool known, bytes32 seed) = seedOf(slot);
        if (known) return (true, false, uint256(keccak256(abi.encode(seed, salt))));
        if (block.timestamp >= (uint256(slot) + 1) * SLOT + REVEAL_TIMEOUT) {
            return (true, true, uint256(keccak256(abi.encode(salt, "lightdive.fallback"))));
        }
        return (false, false, 0);
    }

    /// @notice Commits the hash chain of a UTC day that has not ended. Requests can only use it once
    /// it is on chain, so committing during the day gives the operator no say over earlier slots.
    function commit(uint32 day, bytes32 anchor) external {
        if (msg.sender != operator) revert NotOperator();
        if (day < dayOf(currentSlot())) revert NotFuture();
        Chain storage c = chainOf[day];
        if (c.anchor != bytes32(0)) revert AlreadyCommitted();
        if (anchor == bytes32(0)) revert WrongSeed();
        c.anchor = anchor;
        c.known = anchor;
        emit Committed(day, anchor);
    }

    /// @notice Anyone may reveal a finished slot: only the chain value for that slot passes.
    function reveal(uint64 slot, bytes32 seed) external {
        if (slot >= currentSlot()) revert SlotNotOver();
        Chain storage c = chainOf[dayOf(slot)];
        uint256 indexPlusOne = slot % SLOTS_PER_DAY + 1;
        if (c.anchor == bytes32(0) || indexPlusOne <= c.knownPlusOne) revert WrongSeed();
        if (_hashN(seed, indexPlusOne - c.knownPlusOne) != c.known) revert WrongSeed();
        c.known = seed;
        c.knownPlusOne = uint32(indexPlusOne);
        revealedSeed[slot] = seed;
        emit Revealed(slot, seed);
    }

    function setOperator(address operator_) external onlyOwner {
        operator = operator_;
        emit OperatorSet(operator_);
    }

    /// @dev keccak256 applied n times to a 32-byte value.
    function _hashN(bytes32 v, uint256 n) internal pure returns (bytes32 out) {
        assembly {
            mstore(0x00, v)
            for { let i := 0 } lt(i, n) { i := add(i, 1) } { mstore(0x00, keccak256(0x00, 0x20)) }
            out := mload(0x00)
        }
    }
}
