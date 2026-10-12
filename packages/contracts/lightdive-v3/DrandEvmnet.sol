// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Verifies drand "evmnet" beacons on chain. evmnet is drand's public randomness network on the BN254 curve:
/// a new round every 3 seconds, each a threshold BLS signature (scheme bls-bn254-unchained-on-g1) by the League of
/// Entropy. Nobody, including us, can know a round's value before drand publishes it, and anyone can submit a
/// published round; the signature check makes a wrong value impossible.
///
/// Round r is signed over keccak256(uint64 r, big-endian), hashed to G1 per RFC 9380 (expand_message_xmd with
/// keccak256, Shallue-van de Woestijne map). The round's randomness is sha256(signature), as drand defines it.
///
/// Adapted from randa-mu/bls-solidity (MIT, libraries/BLS.sol and demos/EvmnetRegistry.sol), itself based on
/// kevincharm/bls-bn254. Field inversion and square roots use the modexp precompile instead of addition chains.
/// @dev Candidate, unaudited.
library DrandEvmnet {
    uint256 internal constant GENESIS = 1727521075;
    uint256 internal constant PERIOD = 3;
    bytes internal constant DST = "BLS_SIG_BN254G1_XMD:KECCAK-256_SVDW_RO_NUL_";

    // evmnet group public key (G2), in the order the pairing precompile takes it: x1, x0, y1, y0.
    uint256 private constant PK_X1 = 0x07e1d1d335df83fa98462005690372c643340060d205306a9aa8106b6bd0b382;
    uint256 private constant PK_X0 = 0x0557ec32c2ad488e4d4f6008f89a346f18492092ccc0d594610de2732c8b808f;
    uint256 private constant PK_Y1 = 0x0095685ae3a85ba243747b1b2f426049010f6b73a0cf1d389351d5aaaa1047f6;
    uint256 private constant PK_Y0 = 0x297d3a4f9749b33eb2d904c9d9ebf17224150ddd7abd7567a9bec6c74480ee0b;

    // BN254 base field
    uint256 private constant N = 21888242871839275222246405745257275088696311157297823662689037894645226208583;
    // negated G2 generator
    uint256 private constant NG2_X1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 private constant NG2_X0 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 private constant NG2_Y1 = 17805874995975841540914202342111839520379459829704422454583296818431106115052;
    uint256 private constant NG2_Y0 = 13392588948715843804641432497768002650278120570034223513918757245338268106653;

    uint256 private constant T24 = 0x1000000000000000000000000000000000000000000000000;
    uint256 private constant MASK24 = 0xffffffffffffffffffffffffffffffffffffffffffffffff;
    // Shallue-van de Woestijne constants for y^2 = x^3 + 3 with Z = 1
    uint256 private constant C1 = 0x4;
    uint256 private constant C2 = 0x183227397098d014dc2822db40c0ac2ecbc0b548b438e5469e10460b6c3e7ea3;
    uint256 private constant C3 = 0x16789af3a83522eb353c98fc6b36d713d5d8d1cc5dffffffa;
    uint256 private constant C4 = 0x10216f7ba065e00de81ac1e7808072c9dd2b2385cd7b438469602eb24829a9bd;
    uint256 private constant HALF = 0x183227397098d014dc2822db40c0ac2ecbc0b548b438e5469e10460b6c3e7ea3; // (N - 1) / 2
    uint256 private constant SQRT_EXP = 0xc19139cb84c680a6e14116da060561765e05aa45a1c72a34f082305b61f3f52; // (N + 1) / 4

    error BadSignature();
    error PrecompileFailed();

    /// @notice The first round published at or after time `t`.
    function roundAt(uint256 t) internal pure returns (uint64) {
        if (t <= GENESIS) return 1;
        return uint64((t - GENESIS + PERIOD - 1) / PERIOD + 1);
    }

    /// @notice When round `round` is published.
    function roundTime(uint64 round) internal pure returns (uint256) {
        return GENESIS + (uint256(round) - 1) * PERIOD;
    }

    /// @notice Checks a 64-byte signature (x, y) for `round` and returns the round's randomness. Reverts if invalid.
    function verify(uint64 round, bytes calldata signature) internal view returns (bytes32) {
        if (signature.length != 64) revert BadSignature();
        uint256 sx = uint256(bytes32(signature[0:32]));
        uint256 sy = uint256(bytes32(signature[32:64]));
        if (sx >= N || sy >= N || mulmod(sy, sy, N) != addmod(mulmod(mulmod(sx, sx, N), sx, N), 3, N)) revert BadSignature();
        (uint256 hx, uint256 hy) = hashToPoint(abi.encodePacked(keccak256(abi.encodePacked(round))));
        uint256[12] memory input = [sx, sy, NG2_X1, NG2_X0, NG2_Y1, NG2_Y0, hx, hy, PK_X1, PK_X0, PK_Y1, PK_Y0];
        uint256[1] memory out;
        bool ok;
        assembly {
            ok := staticcall(gas(), 0x08, input, 384, out, 0x20)
        }
        if (!ok || out[0] != 1) revert BadSignature();
        return sha256(signature);
    }

    function hashToPoint(bytes memory message) internal view returns (uint256 x, uint256 y) {
        (uint256 u0, uint256 u1) = hashToField(message);
        uint256[2] memory p0 = mapToPoint(u0);
        uint256[2] memory p1 = mapToPoint(u1);
        uint256[4] memory input = [p0[0], p0[1], p1[0], p1[1]];
        uint256[2] memory r;
        bool ok;
        assembly {
            ok := staticcall(gas(), 0x06, input, 128, r, 64)
        }
        if (!ok) revert PrecompileFailed();
        return (r[0], r[1]);
    }

    /// @dev Two field elements from 96 bytes of expand_message_xmd (RFC 9380 5.3.1, H = keccak256, block size 136).
    function hashToField(bytes memory message) internal pure returns (uint256 a0, uint256 a1) {
        bytes memory dst = DST;
        uint256 dlen = dst.length;
        bytes32 b0 = keccak256(abi.encodePacked(new bytes(136), message, uint8(0), uint8(96), uint8(0), dst, uint8(dlen)));
        bytes32 b1 = keccak256(abi.encodePacked(b0, uint8(1), dst, uint8(dlen)));
        bytes32 b2 = keccak256(abi.encodePacked(b0 ^ b1, uint8(2), dst, uint8(dlen)));
        bytes32 b3 = keccak256(abi.encodePacked(b0 ^ b2, uint8(3), dst, uint8(dlen)));
        bytes memory m = abi.encodePacked(b1, b2, b3);
        assembly {
            let hi := and(mload(add(m, 24)), MASK24)
            let lo := and(mload(add(m, 48)), MASK24)
            a0 := addmod(mulmod(hi, T24, N), lo, N)
            hi := and(mload(add(m, 72)), MASK24)
            lo := and(mload(add(m, 96)), MASK24)
            a1 := addmod(mulmod(hi, T24, N), lo, N)
        }
    }

    function mapToPoint(uint256 u) internal view returns (uint256[2] memory p) {
        uint256 tv1 = mulmod(mulmod(u, u, N), C1, N);
        uint256 tv2 = addmod(1, tv1, N);
        tv1 = addmod(1, N - tv1, N);
        uint256 tv3 = _expmod(mulmod(tv1, tv2, N), N - 2);
        uint256 tv5 = mulmod(mulmod(mulmod(u, tv1, N), tv3, N), C3, N);
        uint256 x1 = addmod(C2, N - tv5, N);
        uint256 x2 = addmod(C2, tv5, N);
        uint256 tv8 = mulmod(mulmod(tv2, tv2, N), tv3, N);
        uint256 x3 = addmod(1, mulmod(C4, mulmod(tv8, tv8, N), N), N);
        uint256 gx;
        if (_isSquare(gx = _g(x1))) p[0] = x1;
        else if (_isSquare(gx = _g(x2))) p[0] = x2;
        else {
            p[0] = x3;
            gx = _g(x3);
        }
        p[1] = _expmod(gx, SQRT_EXP);
        if (mulmod(p[1], p[1], N) != gx) revert PrecompileFailed();
        if (u % 2 != p[1] % 2) p[1] = N - p[1];
    }

    function _g(uint256 x) private pure returns (uint256) {
        return addmod(mulmod(mulmod(x, x, N), x, N), 3, N);
    }

    function _isSquare(uint256 v) private view returns (bool) {
        uint256 l = _expmod(v, HALF);
        return l == 1 || l == 0;
    }

    function _expmod(uint256 base, uint256 e) private view returns (uint256 r) {
        bool ok;
        assembly {
            let p := mload(0x40)
            mstore(p, 32)
            mstore(add(p, 32), 32)
            mstore(add(p, 64), 32)
            mstore(add(p, 96), base)
            mstore(add(p, 128), e)
            mstore(add(p, 160), N)
            ok := staticcall(gas(), 0x05, p, 192, p, 32)
            r := mload(p)
        }
        if (!ok) revert PrecompileFailed();
    }
}
