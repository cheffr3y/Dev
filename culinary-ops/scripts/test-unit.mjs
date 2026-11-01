import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";

async function discover(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => entry.isDirectory() ? discover(join(directory, entry.name)) :
    /(?<!\.integration)\.test\.tsx?$/.test(entry.name) ? [join(directory, entry.name)] : []));
  return files.flat();
}
const files = (await Promise.all(["lib", "app", "scripts/archive"].map(discover))).flat().sort();
if (!files.length) throw new Error("No unit tests discovered.");
const child = spawn(process.execPath, ["--import", "tsx", "--test", ...files], { stdio: "inherit" });
process.once("SIGINT", () => child.kill("SIGINT"));
process.once("SIGTERM", () => child.kill("SIGTERM"));
child.once("error", error => { throw error; });
child.once("exit", (code, signal) => { process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1); });
