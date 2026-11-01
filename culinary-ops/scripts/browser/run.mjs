import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { suites } from "./suites.mjs";

const names = [...new Set(process.argv.slice(2))];
if (!names.length || names.includes("--list")) {
  console.log("Browser suites (run through their disposable database harness):");
  for (const [name, database] of Object.entries(suites)) console.log(`  ${name.padEnd(22)} ${database}`);
  process.exit(0);
}
for (const name of names) if (!Object.hasOwn(suites, name)) throw new Error(`Unknown browser suite: ${name}. Use --list.`);
const { assertDisposableBrowserEnvironment, waitForServer } = await import("./harness.mjs");
for (const name of names) assertDisposableBrowserEnvironment(suites[name]);
await waitForServer();

// A separate process per case preserves cleanup and keeps fixture changes ordered.
for (const name of names) {
  console.log(`\nBrowser suite: ${name}`);
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL(`./cases/${name}.mjs`, import.meta.url))], {
    cwd: fileURLToPath(new URL("../../", import.meta.url)), stdio: "inherit", env: process.env,
  });
  const forward = signal => child.kill(signal);
  const onInterrupt = () => forward("SIGINT"), onTerminate = () => forward("SIGTERM");
  process.once("SIGINT", onInterrupt); process.once("SIGTERM", onTerminate);
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (status, signal) => resolve(status ?? (signal === "SIGINT" ? 130 : 1)));
  });
  process.removeListener("SIGINT", onInterrupt); process.removeListener("SIGTERM", onTerminate);
  if (code !== 0) process.exit(code);
}
