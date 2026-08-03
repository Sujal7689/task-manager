// Local-only helper: spins up a real embedded Postgres cluster for dev/testing
// in environments where Docker isn't usable. Not part of the shipped app.
import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pg = new EmbeddedPostgres({
  databaseDir: path.join(__dirname, "..", ".dev-pg-data"),
  user: "taskmgmt",
  password: "devpassword123",
  port: 5433,
  persistent: true,
});

async function main() {
  await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase("taskmgmt");
  } catch (err) {
    console.log("createDatabase:", err.message);
  }
  console.log("READY on port 5433");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await pg.stop();
  process.exit(0);
});
