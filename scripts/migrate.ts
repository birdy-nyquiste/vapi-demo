import { readConfig } from "../src/server/config.js";
import { openDatabase, migrate } from "../src/server/storage/db.js";
const db = await openDatabase(readConfig());
try {
  await migrate(db);
  console.log("Schema ready");
} finally {
  await db.close();
}
