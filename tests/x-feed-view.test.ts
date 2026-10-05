import test from "node:test";
import assert from "node:assert/strict";
import { reconcileXFeed } from "../lib/x-feed-view.ts";
import type { XUpdate } from "../lib/x-updates.ts";
const post = (id: string, text = id): XUpdate => ({ id, text, authorName: "RovynCore", url: `https://x.com/RovynCore/status/${id}`, publishedAt: "2026-10-02T00:00:00Z" });
test("initial empty feed fills without requiring an arrival click", () => {
  assert.deepEqual(reconcileXFeed([], [post("2")]), { visible: [post("2")], incoming: [] });
});
test("new arrivals preserve reading order until accepted", () => {
  assert.deepEqual(reconcileXFeed([post("1")], [post("2"), post("1")]), { visible: [post("1")], incoming: [post("2")] });
});
test("repeated polls do not lose queued arrivals", () => {
  const first = reconcileXFeed([post("1")], [post("2"), post("1")]);
  const next = reconcileXFeed(first.visible, [post("3"), post("2"), post("1")]);
  assert.deepEqual(next.incoming.map(p => p.id), ["3", "2"]);
  assert.deepEqual(next.visible.map(p => p.id), ["1"]);
});
test("hidden posts are removed even when new arrivals are pending", () => {
  assert.deepEqual(reconcileXFeed([post("2"), post("1")], [post("3"), post("1")]), { visible: [post("1")], incoming: [post("3")] });
});
test("existing post corrections retain their reading position", () => {
  assert.deepEqual(reconcileXFeed([post("1")], [post("2"), post("1", "corrected")]).visible, [post("1", "corrected")]);
});
test("accepting a collection clears incoming indicators on subsequent polls", () => {
  const latest = [post("2"), post("1")];
  assert.deepEqual(reconcileXFeed(latest, latest), { visible: latest, incoming: [] });
});
