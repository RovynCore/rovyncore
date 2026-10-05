import test from "node:test";
import assert from "node:assert/strict";
import { readEventWindow } from "../lib/event-logs";
test("range-limited RPC scans every block without moving or losing the reorg window", async () => {
  const calls: [bigint, bigint][] = [];
  const logs = await readEventWindow(async (from, to) => {
    calls.push([from, to]);
    if (to - from > 9n) throw new Error("10 block range limit");
    return Array.from({length: Number(to - from + 1n)}, (_, i) => from + BigInt(i));
  }, 88n, 587n);
  assert.equal(calls.length, 51);
  assert.equal(logs.length, 500);
  assert.equal(new Set(logs).size, 500);
  assert.equal(logs[0], 88n);
  assert.equal(logs.at(-1), 587n);
});
test("a failed chunk rejects the complete window", async () => {
  await assert.rejects(readEventWindow(async (from, to) => {
    if (to - from > 9n || from === 10n) throw new Error("RPC unavailable");
    return [from];
  }, 0n, 29n));
});
