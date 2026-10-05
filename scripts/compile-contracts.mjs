import solc from "solc";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
const filename = "GenesisPlatform.sol";
const input = {
  language: "Solidity",
  sources: {
    [filename]: {
      content: readFileSync("packages/contracts/" + filename, "utf8"),
    },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    outputSelection: {
      "*": {
        "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
      },
    },
  },
};
const output = JSON.parse(
  solc.compile(JSON.stringify(input), {
    import: (p) => {
      try {
        const content = readFileSync(path.join("node_modules", p), "utf8");
        input.sources[p] = { content };
        return { contents: content };
      } catch {
        return { error: "Missing " + p };
      }
    },
  }),
);
for (const e of output.errors ?? []) console.log(e.formattedMessage);
if (output.errors?.some((e) => e.severity === "error")) process.exit(1);
mkdirSync("packages/web3", { recursive: true });
mkdirSync("packages/contracts/artifacts", { recursive: true });
const artifacts = {};
for (const [name, c] of Object.entries(output.contracts[filename]))
  artifacts[name] = {
    abi: c.abi,
    bytecode: "0x" + c.evm.bytecode.object,
    runtime: "0x" + c.evm.deployedBytecode.object,
  };
writeFileSync("packages/web3/artifacts.json", JSON.stringify(artifacts));
writeFileSync(
  "packages/contracts/artifacts/standard-input.json",
  JSON.stringify(input, null, 2),
);
writeFileSync(
  "packages/contracts/artifacts/compiler.json",
  JSON.stringify(
    { version: solc.version(), settings: input.settings },
    null,
    2,
  ),
);
console.log("Compiled", Object.keys(artifacts).join(", "));
