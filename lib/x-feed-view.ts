import type { XUpdate } from "./x-updates";

/** Keep the reader's order until they accept new arrivals; honour removals immediately. */
export function reconcileXFeed(current: XUpdate[], latest: XUpdate[]) {
  if (!current.length) return { visible: latest, incoming: [] as XUpdate[] };
  const latestById = new Map(latest.map(post => [post.id, post]));
  const currentIds = new Set(current.map(post => post.id));
  return {
    visible: current.flatMap(post => latestById.has(post.id) ? [latestById.get(post.id)!] : []),
    incoming: latest.filter(post => !currentIds.has(post.id)),
  };
}
