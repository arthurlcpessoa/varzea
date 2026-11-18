import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Banco descartável só para testes: apaga o arquivo e recria o schema.
export default function setup() {
  const dbFile = path.resolve(__dirname, "../prisma/test.db");
  fs.rmSync(dbFile, { force: true });
  fs.rmSync(`${dbFile}-journal`, { force: true });
  execSync("npx prisma db push --skip-generate", {
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
}
