import { openDB } from "idb";

const DB_NAME = "tsukiichi_kakeibo_mvp";
const DB_VERSION = 1;

export async function initDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("transactions")) {
        const store = db.createObjectStore("transactions", { keyPath: "id" });
        store.createIndex("by-date", "date");
      }
      if (!db.objectStoreNames.contains("assets")) {
        const store = db.createObjectStore("assets", { keyPath: "date" });
        store.createIndex("by-date", "date");
      }
    },
  });
}

export async function upsertTransactions(db, records) {
  const tx = db.transaction("transactions", "readwrite");
  for (const record of records) {
    await tx.store.put(record);
  }
  await tx.done;
}

export async function upsertAssets(db, records) {
  const tx = db.transaction("assets", "readwrite");
  for (const record of records) {
    await tx.store.put(record);
  }
  await tx.done;
}

export async function getAllTransactions(db) {
  return db.getAll("transactions");
}

export async function getAllAssets(db) {
  return db.getAll("assets");
}
