import { readConfig } from "./config.js";
import { openDatabase, migrate } from "./storage/db.js";
import { createApp } from "./app.js";
let instance: ReturnType<typeof boot> | undefined;
async function boot() {
  const config = readConfig();
  const db = await openDatabase(config);
  if (!config.deployed) await migrate(db);
  return createApp(db, config);
}
export function getApp() {
  instance ??= boot().catch((e) => {
    instance = undefined;
    throw e;
  });
  return instance;
}
