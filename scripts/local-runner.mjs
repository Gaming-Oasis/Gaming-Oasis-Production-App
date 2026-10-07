import { spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startJsonWriter } from "./json-writer.mjs";
import { stopChild } from "./process-tree.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pidFile = path.join(root, ".production-os.pid");
const mode = process.argv[2] === "start" ? "start" : "dev";
const vinextPackagePath = path.join(root, "node_modules", "vinext", "package.json");
let writer;
let app;

try {
  const vinextPackage = JSON.parse(readFileSync(vinextPackagePath, "utf8"));
  const declaredBin = typeof vinextPackage.bin === "string" ? vinextPackage.bin : vinextPackage.bin?.vinext;
  if (typeof declaredBin !== "string" || !declaredBin) throw new Error("Vinext does not declare its command entry point");
  const cli = path.resolve(path.dirname(vinextPackagePath), declaredBin);
  if (!existsSync(cli)) throw new Error("Vinext command entry point is missing; run npm ci");

  writer = await startJsonWriter({ outputDir: path.join(root, "JSONs"), seedValorantMapData: true });
  writeFileSync(pidFile, String(process.pid), "utf8");
  console.log(`Live JSON output: ${writer.outputDir}`);
  app = spawn(process.execPath, [cli, mode], { cwd: root, stdio: "inherit" });
} catch (error) {
  if (writer) await writer.close().catch(() => {});
  try {
    if (existsSync(pidFile) && readFileSync(pidFile, "utf8").trim() === String(process.pid)) unlinkSync(pidFile);
  } catch {
    // Startup cleanup is best effort; a stale PID file is never trusted by the launcher.
  }
  console.error(`Production OS could not start: ${error.message}`);
  process.exit(1);
}

let closing = false;
async function close(exitCode = 0) {
  if (closing) return;
  closing = true;
  await Promise.all([
    stopChild(app, 1_000),
    writer.close().catch(() => {}),
  ]);
  try {
    if (existsSync(pidFile) && readFileSync(pidFile, "utf8").trim() === String(process.pid)) unlinkSync(pidFile);
  } catch {
    // A stale PID file is harmless; the launcher replaces it on the next start.
  }
  process.exit(exitCode);
}

process.on("SIGINT", () => close(0));
process.on("SIGTERM", () => close(0));
process.on("message", (message) => {
  if (message?.type === "shutdown") close(0);
});
process.on("disconnect", () => close(0));
app.on("exit", (code, signal) => close(code ?? (signal ? 1 : 0)));
app.on("error", (error) => {
  console.error(error.message);
  close(1);
});
