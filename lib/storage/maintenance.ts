import { openNutriDB } from "./indexed-db";

const STORES = ["logs", "foods", "combinations", "photos", "goals", "profile", "tombstones", "meta"] as const;
export type StoreName = (typeof STORES)[number];

/** Permanently clears the given object stores. Used for "delete my data". */
export async function clearStores(names: StoreName[]): Promise<void> {
  const db = await openNutriDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(names, "readwrite");
    for (const n of names) tx.objectStore(n).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const clearFoodLogs = () => clearStores(["logs", "photos"]);
export const clearEverything = () => clearStores([...STORES]);
