// Read-only audit: only eth_chainId, eth_blockNumber, eth_getCode, eth_call,
// eth_getBalance and explorer GET requests. Never sends transactions.
import fs from "node:fs";
import solc from "solc";
import { createPublicClient, http, keccak256 } from "viem";
const contracts = {
  GenesisPlatform: "0xa5b8d31ce298e39ee30378d7791ec307a8cb8621",
  LaunchToken: "0x37c675766a27b98eb50bdb777ac32a920deafa8e",
  GenesisSale: "0x9b331e142efe2e8d49fe8a3a866e24dda40d1f38",
};
const owner = "0xEE4C435b9207bA5bB5f4860156409Ae78032ff6e";
const input = JSON.parse(
  fs.readFileSync("packages/contracts/artifacts/standard-input.json", "utf8"),
);
input.sources["GenesisPlatform.sol"].content = fs.readFileSync(
  "packages/contracts/GenesisPlatform.sol",
  "utf8",
);
input.settings.outputSelection = {
  "*": {
    "*": [
      "abi",
      "evm.bytecode.object",
      "evm.deployedBytecode.object",
      "evm.deployedBytecode.immutableReferences",
    ],
  },
};
const compiled = JSON.parse(solc.compile(JSON.stringify(input)));
if (compiled.errors?.some((x) => x.severity === "error"))
  throw new Error("Compilation failed");
const artifacts = JSON.parse(
  fs.readFileSync("packages/web3/artifacts.json", "utf8"),
);
const client = createPublicClient({
  transport: http("https://rpc.testnet.chain.robinhood.com", {
    timeout: 20000,
    retryCount: 1,
  }),
  cacheTime: 0,
});
const result = {
  timestamp: new Date().toISOString(),
  compiler: solc.version(),
  expectedChainId: 46630,
  contracts: {},
  errors: [],
};
try {
  result.chainId = await client.getChainId();
  if (result.chainId !== 46630) throw new Error("Wrong chain");
  const block = await client.getBlockNumber();
  result.block = String(block);
  for (const [name, address] of Object.entries(contracts)) {
    const c = compiled.contracts["GenesisPlatform.sol"][name];
    const code = await client.getCode({ address, blockNumber: block });
    const refs = Object.values(
      c.evm.deployedBytecode.immutableReferences || {},
    ).flat();
    const mask = (hex) => {
      let chars = hex.replace(/^0x/, "").split("");
      for (const r of refs)
        chars.fill("0", r.start * 2, (r.start + r.length) * 2);
      return chars.join("");
    };
    const entry = {
      address,
      hasCode: !!code && code !== "0x",
      codeHash: code ? keccak256(code) : null,
      compiledArtifactMatches:
        artifacts[name].runtime === "0x" + c.evm.deployedBytecode.object,
      runtimeMatchesIgnoringOnlyCompilerImmutableSlots: code
        ? mask(code) === mask(c.evm.deployedBytecode.object)
        : false,
      immutableSlots: refs,
      state: {},
    };
    const reads =
      name === "LaunchToken"
        ? [
            ["name"],
            ["symbol"],
            ["decimals"],
            ["totalSupply"],
            ["balanceOf", [owner]],
            ["balanceOf", [contracts.GenesisSale]],
          ]
        : name === "GenesisPlatform"
          ? [
              ["owner"],
              ["pendingOwner"],
              ["treasury"],
              ["paused"],
              ["launchFee"],
              ["tokenCount"],
              ["isToken", [contracts.LaunchToken]],
              ["plans", [0]],
              ["plans", [1]],
              ["plans", [2]],
              ["proceeds", [owner]],
            ]
          : [
              ["owner"],
              ["pendingOwner"],
              ["treasury"],
              ["active"],
              ["token"],
              ["pricePerToken"],
              ["proceeds", [owner]],
            ];
    for (const [fn, args = []] of reads) {
      try {
        entry.state[fn + (args.length ? ":" + args.join(",") : "")] =
          await client.readContract({
            address,
            abi: c.abi,
            functionName: fn,
            args,
            blockNumber: block,
          });
      } catch (e) {
        entry.state[fn] = { error: e.shortMessage || e.message };
      }
    }
    entry.ethBalance = await client.getBalance({ address, blockNumber: block });
    if (name === "GenesisSale") {
      const tokenWord = String(entry.state.token)
        .slice(2)
        .toLowerCase()
        .padStart(64, "0");
      const priceWord = BigInt(entry.state.pricePerToken)
        .toString(16)
        .padStart(64, "0");
      entry.immutableWords = refs.map((r) =>
        code.slice(2 + r.start * 2, 2 + (r.start + r.length) * 2),
      );
      entry.immutableWordsMatchReadValues = entry.immutableWords.every(
        (w) => w === tokenWord || w === priceWord,
      );
    }
    try {
      const response = await fetch(
        `https://explorer.testnet.chain.robinhood.com/api/v2/smart-contracts/${address}`,
        { signal: AbortSignal.timeout(15000) },
      );
      entry.explorer = { httpStatus: response.status };
      if (response.ok) {
        const data = await response.json();
        const details = await fetch(
          `https://explorer.testnet.chain.robinhood.com/api/v2/addresses/${address}`,
          { signal: AbortSignal.timeout(15000) },
        ).then((r) => r.json());
        entry.explorer = {
          ...entry.explorer,
          is_verified: details.is_verified,
          sourcePresent: !!data.source_code,
          abiPresent: !!data.abi,
          creationTx: details.creation_transaction_hash,
          creationBytecodeMatchesLocalPrefix:
            typeof data.creation_bytecode === "string" &&
            data.creation_bytecode.startsWith(artifacts[name].bytecode),
          name: data.name,
          compiler_version: data.compiler_version,
        };
      }
    } catch (e) {
      entry.explorer = { error: e.message };
    }
    result.contracts[name] = entry;
  }
} catch (e) {
  result.errors.push(e.shortMessage || e.message);
}
fs.mkdirSync("audit", { recursive: true });
const serialized = JSON.stringify(
  result,
  (_, v) => (typeof v === "bigint" ? v.toString() : v),
  2,
);
fs.writeFileSync("audit/deployment-snapshot.json", serialized);
console.log(serialized);
if (result.errors.length) process.exitCode = 1;
