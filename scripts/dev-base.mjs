// Runs `next dev` with the project's `.env` loaded into the environment first,
// so its values win over `.env.development`. Next checks `process.env` ahead of
// every `.env*` file, but otherwise prefers `.env.development` in dev.
//
// A wrapper is used instead of Node's `--env-file` flag because `next dev`
// copies its own `execArgv` into `NODE_OPTIONS` for the server process it
// spawns (see next/dist/cli/next-dev.js), and Node rejects `--env-file` there.
// Spawning `next` with a clean argv keeps the flag out of that chain entirely.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const envPath = fileURLToPath(new URL("../.env", import.meta.url));
const nextBin = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));

try {
  const parsed = parseEnv(readFileSync(envPath, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    // Match the usual env-file precedence: a value already set in the real
    // environment wins, and the file only fills in what's missing.
    process.env[key] ??= value;
  }
} catch (error) {
  // No .env is fine — fall back to Next's normal `.env.development` loading.
  if (error.code !== "ENOENT") throw error;
}

// Extra args pass through, e.g. `npm run dev:base -- --port 3001`.
const child = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});
