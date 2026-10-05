import fs from "node:fs";
import path from "node:path";
import solc from "solc";
const file = "GenesisPlatform.sol";
const input = {
  language: "Solidity",
  sources: {
    "GenesisPresale.sol": {
      content: fs.readFileSync(
        "packages/contracts/v2/GenesisPresale.sol",
        "utf8",
      ),
    },
    [file]: {
      content: fs.readFileSync("packages/contracts/v2/" + file, "utf8"),
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
const result = JSON.parse(
  solc.compile(JSON.stringify(input), {
    import: (p) => {
      const content = fs.readFileSync(path.join("node_modules", p), "utf8");
      input.sources[p] = { content };
      return { contents: content };
    },
  }),
);
for (const e of result.errors || []) console.log(e.formattedMessage);
if (result.errors?.some((e) => e.severity === "error")) process.exit(1);
const artifacts = {};
for (const [name, c] of Object.entries({
  ...result.contracts[file],
  ...result.contracts["GenesisPresale.sol"],
}))
  artifacts[name] = {
    abi: c.abi,
    bytecode: "0x" + c.evm.bytecode.object,
    runtime: "0x" + c.evm.deployedBytecode.object,
  };
fs.mkdirSync("packages/contracts/v2/artifacts", { recursive: true });
fs.writeFileSync(
  "packages/contracts/v2/artifacts/contracts.json",
  JSON.stringify(artifacts),
);
fs.writeFileSync(
  "packages/contracts/v2/artifacts/standard-input.json",
  JSON.stringify(input, null, 2),
);
fs.writeFileSync(
  "packages/contracts/v2/artifacts/compiler.json",
  JSON.stringify(
    { version: solc.version(), settings: input.settings },
    null,
    2,
  ),
);
console.log(
  "V2 candidate compiled separately; V1 website artifacts unchanged.",
);
