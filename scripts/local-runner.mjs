import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startJsonWriter } from "./json-writer.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pidFile = path.join(root, ".production-os.pid");
const mode = process.argv[2] === "start" ? "start" : "dev";
writeFileSync(pidFile, String(process.pid), "utf8");
const writer = await startJsonWriter({ outputDir: path.join(root, "JSONs") });
const cli = path.join(root, "node_modules", "vinext", "dist", "cli.js");

console.log(`Live JSON output: ${writer.outputDir}`);
const app = spawn(process.execPath, [cli, mode], { cwd: root, stdio: "inherit" });

let closing = false;
async function close(exitCode = 0) {
  if (closing) return;
  closing = true;
  if (!app.killed) app.kill();
  await writer.close().catch(() => {});
  try {
    if (existsSync(pidFile) && readFileSync(pidFile, "utf8").trim() === String(process.pid)) unlinkSync(pidFile);
  } catch {
    // A stale PID file is harmless; the launcher replaces it on the next start.
  }
  process.exit(exitCode);
}

process.on("SIGINT", () => close(0));
process.on("SIGTERM", () => close(0));
app.on("exit", (code) => close(code ?? 0));
app.on("error", (error) => {
  console.error(error.message);
  close(1);
});
