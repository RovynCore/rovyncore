import { db, fail } from "./server";
import { readStoredXUpdates, writeStoredXUpdate } from "./x-updates-storage";
import type { XUpdate } from "./x-updates";

export async function readXUpdates(): Promise<XUpdate[]> {
  return readStoredXUpdates(db());
}
export async function saveXUpdate(change: XUpdate | { remove: string }): Promise<XUpdate[]> {
  try { return await writeStoredXUpdate(db(), change); }
  catch (error) {
    if (error instanceof Error && error.message === "Updates changed in another session. Please try again.") fail(409, error.message);
    throw error;
  }
}
