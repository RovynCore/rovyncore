import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const sourceFile = "packages/contracts/v4/GenesisPresaleV4.sol";
const source = fs.readFileSync(sourceFile, "utf8");
const input = {
  language: "Solidity",
  sources: { "GenesisPresaleV4.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};
const result = JSON.parse(solc.compile(JSON.stringify(input), {
  import: (specifier) => {
    const candidate = specifier.startsWith("@openzeppelin/")
      ? path.join("node_modules", specifier)
      : path.resolve(path.dirname(sourceFile), "..", specifier);
    try { return { contents: fs.readFileSync(candidate, "utf8") }; }
    catch { return { error: `Import not found: ${specifier}` }; }
  },
}));
for (const error of result.errors || []) console.log(error.formattedMessage);
if (result.errors?.some((error) => error.severity === "error")) process.exit(1);
const contract = result.contracts["GenesisPresaleV4.sol"].GenesisPresaleV4;
const lock = result.contracts["../v2/GenesisPresale.sol"]?.GenesisTokenLock;
const artifacts = {
  GenesisPresaleV4: {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
    runtime: `0x${contract.evm.deployedBytecode.object}`,
  },
  ...(lock ? { GenesisTokenLock: { abi: lock.abi, bytecode: `0x${lock.evm.bytecode.object}`, runtime: `0x${lock.evm.deployedBytecode.object}` } } : {}),
};
const outputDir = "packages/contracts/v4/artifacts";
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "contracts.json"), JSON.stringify(artifacts));
fs.writeFileSync(path.join(outputDir, "standard-input.json"), JSON.stringify(input, null, 2));
fs.writeFileSync(path.join(outputDir, "compiler.json"), JSON.stringify({ version: solc.version(), settings: input.settings }, null, 2));
console.log(`V4 candidate compiled separately with solc ${solc.version()}.`);
