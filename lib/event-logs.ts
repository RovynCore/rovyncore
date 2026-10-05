// Retry a bounded indexer window using ranges supported by free RPC tiers.
// Never advance the cursor unless every chunk succeeds.
export async function readEventWindow<T>(
  read: (from: bigint, to: bigint) => Promise<T[]>,
  from: bigint,
  to: bigint,
): Promise<T[]> {
  try {
    return await read(from, to);
  } catch (error) {
    if (to - from < 10n || to - from >= 500n) throw error;
    const chunks: Promise<T[]>[] = [];
    for (let start = from; start <= to; start += 10n) {
      const end = start + 9n < to ? start + 9n : to;
      chunks.push(read(start, end));
    }
    return (await Promise.all(chunks)).flat();
  }
}
