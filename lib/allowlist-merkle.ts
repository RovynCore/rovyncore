import {
  concatHex,
  encodeAbiParameters,
  getAddress,
  keccak256,
  type Address,
  type Hex,
} from "viem";

export type AllowlistLeaf = { address: Address; hash: Hex };

export function allowlistLeaf(wallet: string): Hex {
  const encoded = encodeAbiParameters([{ type: "address" }], [getAddress(wallet)]);
  return keccak256(keccak256(encoded));
}

function hashPair(a: Hex, b: Hex): Hex {
  const [left, right] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a];
  return keccak256(concatHex([left, right]));
}

export function buildAllowlistTree(wallets: readonly string[]) {
  const unique = [...new Set(wallets.map((wallet) => getAddress(wallet).toLowerCase()))];
  if (unique.length === 0) throw new Error("白名單至少需要一個有效錢包地址");

  const leaves: AllowlistLeaf[] = unique
    .map((wallet) => ({ address: getAddress(wallet), hash: allowlistLeaf(wallet) }))
    .sort((a, b) => a.hash.toLowerCase().localeCompare(b.hash.toLowerCase()));
  const levels: Hex[][] = [leaves.map((leaf) => leaf.hash)];
  while (levels.at(-1)!.length > 1) {
    const current = levels.at(-1)!;
    const next: Hex[] = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(i + 1 < current.length ? hashPair(current[i], current[i + 1]) : current[i]);
    }
    levels.push(next);
  }

  const proofs = new Map<string, Hex[]>();
  for (let leafIndex = 0; leafIndex < leaves.length; leafIndex++) {
    const proof: Hex[] = [];
    let index = leafIndex;
    for (let level = 0; level < levels.length - 1; level++) {
      const sibling = index ^ 1;
      if (sibling < levels[level].length) proof.push(levels[level][sibling]);
      index = Math.floor(index / 2);
    }
    proofs.set(leaves[leafIndex].address.toLowerCase(), proof);
  }

  return {
    root: levels.at(-1)![0],
    addresses: leaves.map((leaf) => leaf.address),
    proofFor(wallet: string) {
      return proofs.get(getAddress(wallet).toLowerCase()) ?? null;
    },
  };
}
