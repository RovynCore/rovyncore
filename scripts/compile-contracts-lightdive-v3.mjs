import fs from "node:fs";
import path from "node:path";
import solc from "solc";

// Compiles the Lightdive v3 contracts (candidate, unaudited) with the same settings as the other RovynCore contracts
// and writes ABI/bytecode plus the exact standard input for verification. Test-only contracts under test/ are compiled
// too, but kept out of the published ABI file.
const NAMES = ["DrandEvmnetRandomness", "LightdiveConfig3", "LightdiveNFT3", "CoreLightPool3", "LightdiveMinter3", "Expedition3", "LightdiveMarket3"];
const TEST_NAMES = ["MockRandomness", "DrandProbe"];
const root = "packages/contracts/lightdive-v3";
const fileOf = {
  DrandEvmnetRandomness: "RoundRandomness.sol",
  MockRandomness: "test/MockRandomness.sol",
  DrandProbe: "test/DrandProbe.sol",
};
const sourceOf = (name) => fileOf[name] ?? `${name}.sol`;

const collectSource = (sourceName, filePath, sources) => {
  if (sources[sourceName]) return;
  const content = fs.readFileSync(filePath, "utf8");
  sources[sourceName] = { content };
  for (const match of content.matchAll(/import\s+(?:[^;]*?\s+from\s+)?["']([^"']+)["']\s*;/g)) {
    const specifier = match[1];
    const dependencyName = specifier.startsWith("@openzeppelin/")
      ? specifier
      : path.posix.normalize(path.posix.join(path.posix.dirname(sourceName), specifier));
    const dependencyFile = dependencyName.startsWith("@openzeppelin/")
      ? path.join("node_modules", dependencyName)
      : path.join(root, dependencyName);
    collectSource(dependencyName, dependencyFile, sources);
  }
};
const only = process.argv.slice(2);
const names = only.length ? [...NAMES, ...TEST_NAMES].filter((n) => only.includes(n)) : [...NAMES, ...TEST_NAMES];
const sources = {};
for (const name of names) collectSource(sourceOf(name), path.join(root, sourceOf(name)), sources);

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

const artifacts = {};
for (const name of names) {
  const contract = result.contracts[sourceOf(name)][name];
  artifacts[name] = {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
    runtime: `0x${contract.evm.deployedBytecode.object}`,
  };
  const size = contract.evm.deployedBytecode.object.length / 2;
  console.log(`${name.padEnd(22)} runtime ${size} bytes${size > 24576 ? "  <-- over the 24 KiB limit" : ""}`);
}
const outputDir = path.join(root, "artifacts");
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "contracts.json"), JSON.stringify(artifacts));
if (!only.length) {
  fs.writeFileSync(path.join(outputDir, "standard-input.json"), JSON.stringify(input, null, 2));
  fs.writeFileSync(path.join(outputDir, "compiler.json"), JSON.stringify({ version: solc.version(), settings: input.settings }, null, 2));
  // ABIs only, committed, so the site can talk to a deployment without the git-ignored build output.
  const abis = Object.fromEntries(NAMES.map((name) => [name, artifacts[name].abi]));
  fs.writeFileSync("packages/web3/lightdive-v3-abi.json", `${JSON.stringify(abis, null, 1)}\n`);
}
console.log(`Lightdive v3 compiled with solc ${solc.version()}.`);
