import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const sourceFile = "packages/contracts/v6/RovynPresaleV6.sol";
const collectSource = (sourceName, filePath, sources) => {
  if (sources[sourceName]) return;
  const content = fs.readFileSync(filePath, "utf8");
  sources[sourceName] = { content };
  for (const match of content.matchAll(/import\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']\s*;/g)) {
    const specifier = match[1];
    const dependencyName = specifier.startsWith("@openzeppelin/")
      ? specifier
      : path.posix.normalize(path.posix.join(path.posix.dirname(sourceName), specifier)).replace(/^(?:\.\.\/)+/, "");
    const dependencyFile = dependencyName.startsWith("@openzeppelin/")
      ? path.join("node_modules", dependencyName)
      : path.join("packages/contracts", dependencyName);
    collectSource(dependencyName, dependencyFile, sources);
  }
};
const sources = {};
collectSource("RovynPresaleV6.sol", sourceFile, sources);
const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};
const result = JSON.parse(solc.compile(JSON.stringify(input)));
for (const error of result.errors || []) console.log(error.formattedMessage);
if (result.errors?.some((error) => error.severity === "error")) process.exit(1);

const main = result.contracts["RovynPresaleV6.sol"];
const imported = result.contracts["v2/GenesisPresale.sol"];
const vesting = result.contracts["v5/RovynPresaleV5.sol"];
const pick = (contract) => ({
  abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`,
  runtime: `0x${contract.evm.deployedBytecode.object}`,
});
const artifacts = {
  RovynPresaleV6: pick(main.RovynPresaleV6),
  RovynTeamVesting: pick(vesting.RovynTeamVesting),
  GenesisTokenLock: pick(imported.GenesisTokenLock),
};
const outputDir = "packages/contracts/v6/artifacts";
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "contracts.json"), JSON.stringify(artifacts));
fs.writeFileSync(path.join(outputDir, "standard-input.json"), JSON.stringify(input, null, 2));
fs.writeFileSync(path.join(outputDir, "compiler.json"), JSON.stringify({ version: solc.version(), settings: input.settings }, null, 2));
console.log(`V6 candidate compiled with solc ${solc.version()}.`);


