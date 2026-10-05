import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const root = process.cwd();
const releaseRoot = resolve(root, "releases", "production");
const sourceRoots = ["app/", "components/", "hooks/", "lib/", "db/", "drizzle/", "packages/", "public/", "scripts/", "tests/"];
const rootFiles = new Set(["package.json", "package-lock.json", "next.config.ts", "vite.config.ts", "tsconfig.json", "eslint.config.mjs", "wrangler.production.jsonc"]);

function requireReleasePath(value) {
  if (!value) throw new Error("Provide a file below releases/production.");
  const target = resolve(root, value);
  if (!target.startsWith(`${releaseRoot}${sep}`) || !target.endsWith(".json")) {
    throw new Error("Manifest paths must be JSON files below releases/production.");
  }
  return target;
}

const args = process.argv.slice(2);
const outputIndex = args.indexOf("--out");
const compareIndex = args.indexOf("--compare");
const output = requireReleasePath(args[outputIndex + 1]);
const compare = compareIndex < 0 ? null : requireReleasePath(args[compareIndex + 1]);
const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const paths = [...new Set(listed.toString("utf8").split("\0").filter(Boolean))]
  .map((path) => path.replaceAll("\\", "/"))
  .filter((path) => rootFiles.has(path) || sourceRoots.some((prefix) => path.startsWith(prefix)))
  .filter((path) => !path.startsWith("scripts/.cache/"))
  .sort();
const files = Object.fromEntries(paths.map((path) => {
  const data = readFileSync(resolve(root, path));
  return [path, { sha256: createHash("sha256").update(data).digest("hex"), bytes: data.byteLength }];
}));
const manifest = {
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  gitCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  scope: "Build inputs; excludes local secrets, output, tmp, node_modules, dist and Wrangler state.",
  fileCount: paths.length,
  files,
};
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${relative(root, output)} with ${paths.length} source files.`);
if (compare) {
  const previous = JSON.parse(readFileSync(compare, "utf8"));
  const changed = [...new Set([...Object.keys(previous.files), ...paths])]
    .filter((path) => previous.files[path]?.sha256 !== files[path]?.sha256)
    .sort();
  console.log(`Changed from ${relative(root, compare)}: ${changed.length}`);
  for (const path of changed) console.log(path);
}
