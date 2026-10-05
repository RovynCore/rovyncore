import test from "node:test";
import assert from "node:assert/strict";
import { buildAllowlistTree, allowlistLeaf } from "../lib/allowlist-merkle.ts";
import { concatHex, keccak256, type Hex } from "viem";

function verify(root: Hex, leaf: Hex, proof: Hex[]) {
  return proof.reduce((hash, sibling) => {
    const [left, right] = hash.toLowerCase() < sibling.toLowerCase() ? [hash, sibling] : [sibling, hash];
    return keccak256(concatHex([left, right]));
  }, leaf) === root;
}

test("allowlist tree creates valid sorted-pair proofs for odd, even, and duplicate inputs", () => {
  const wallets = [
    "0x0000000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000002",
    "0x0000000000000000000000000000000000000003",
    "0x0000000000000000000000000000000000000004",
    "0x0000000000000000000000000000000000000005",
  ];
  const tree = buildAllowlistTree([...wallets, wallets[0]]);
  assert.equal(tree.addresses.length, wallets.length);
  for (const wallet of wallets) {
    const proof = tree.proofFor(wallet);
    assert.ok(proof);
    assert.ok(verify(tree.root, allowlistLeaf(wallet), proof));
  }
  assert.equal(tree.proofFor("0x0000000000000000000000000000000000000006"), null);
  assert.throws(() => buildAllowlistTree([]));
});
