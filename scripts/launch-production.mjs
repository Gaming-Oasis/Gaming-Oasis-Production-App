import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stopChild } from "./process-tree.mjs";

export { stopChild } from "./process-tree.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedOutputDir = path.join(root, "JSONs");
const lockPath = path.join(root, "package-lock.json");
const installStampPath = path.join(root, "node_modules", ".gaming-oasis-lock.sha256");
const writerStatusUrl = "http://127.0.0.1:4877/api/live-json/status";
const workspaceUrl = "http://localhost:3000";
const minimumNode = [22, 13, 0];

function fail(message) {
  console.error(`\n${message}`);
  process.exitCode = 1;
}

function nodeVersionIsSupported() {
  const actual = process.versions.node.split(".").map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < minimumNode.length; index += 1) {
    if (actual[index] > minimumNode[index]) return true;
    if (actual[index] < minimumNode[index]) return false;
  }
  return true;
}

async function fetchForProbe(url, { timeoutMs = 1_500, maximumBytes = 1_000_000, accept = "*/*" } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", headers: { Accept: accept }, signal: controller.signal });
    const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
      controller.abort();
      throw new Error("Probe response is too large");
    }
    const chunks = [];
    let receivedBytes = 0;
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > maximumBytes) {
          controller.abort();
          throw new Error("Probe response is too large");
        }
        chunks.push(Buffer.from(value));
      }
    }
    const body = Buffer.concat(chunks, receivedBytes);
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

async function probeWriter() {
  try {
    const { response, body } = await fetchForProbe(writerStatusUrl, { accept: "application/json", maximumBytes: 64_000 });
    const payload = JSON.parse(body.toString("utf8"));
    const identityMatches = payload?.service === "gaming-oasis-production-os-writer"
      && payload?.protocolVersion === 2
      && path.resolve(String(payload?.outputDir ?? "")) === path.resolve(expectedOutputDir);
    return { reachable: true, healthy: response.ok && payload?.ok === true, identityMatches, payload };
  } catch {
    return { reachable: false, healthy: false, identityMatches: false, payload: null };
  }
}

async function probeWorkspace() {
  try {
    const { response, body } = await fetchForProbe(workspaceUrl, { accept: "text/html", maximumBytes: 1_000_000 });
    return response.ok && body.toString("utf8").includes("Gaming Oasis Production OS");
  } catch {
    return false;
  }
}

function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(600);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function lockDigest() {
  return createHash("sha256").update(readFileSync(lockPath)).digest("hex");
}

function dependenciesAreCurrent(digest) {
  if (!existsSync(installStampPath)) return false;
  try {
    const vinextPackagePath = path.join(root, "node_modules", "vinext", "package.json");
    const vinextPackage = JSON.parse(readFileSync(vinextPackagePath, "utf8"));
    const declaredBin = typeof vinextPackage.bin === "string" ? vinextPackage.bin : vinextPackage.bin?.vinext;
    return readFileSync(installStampPath, "utf8").trim() === digest
      && typeof declaredBin === "string"
      && existsSync(path.resolve(path.dirname(vinextPackagePath), declaredBin))
      && existsSync(path.join(root, "node_modules", "next", "package.json"))
      && existsSync(path.join(root, "node_modules", "react", "package.json"));
  } catch {
    return false;
  }
}

export function resolveNpmInvocation(args) {
  const bundledCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  if (existsSync(bundledCli)) return { command: process.execPath, args: [bundledCli, ...args] };
  if (process.platform === "win32") {
    return { command: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", "npm.cmd", ...args] };
  }
  return { command: "npm", args };
}

function runNpm(args, stdio = "inherit") {
  const invocation = resolveNpmInvocation(args);
  const result = spawnSync(invocation.command, invocation.args, { cwd: root, stdio, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`);
}

function openWorkspace() {
  if (process.platform === "win32") {
    const opener = spawn("cmd.exe", ["/d", "/c", "start", "", workspaceUrl], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    opener.unref();
    return;
  }
  const command = process.platform === "darwin" ? "open" : "xdg-open";
  const opener = spawn(command, [workspaceUrl], { detached: true, stdio: "ignore" });
  opener.unref();
}

async function waitForReadiness(child, timeoutMs = 60_000) {
  let childExit = null;
  child.once("exit", (code, signal) => { childExit = { code, signal }; });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (childExit) throw new Error(`Server exited before it was ready (${childExit.code ?? childExit.signal ?? "unknown"})`);
    const [writer, web] = await Promise.all([probeWriter(), probeWorkspace()]);
    if (writer.identityMatches && writer.healthy && web) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Server did not become ready within 60 seconds");
}

async function main() {
  if (!nodeVersionIsSupported()) {
    fail(`Node.js ${minimumNode.join(".")} or newer is required. Current version: ${process.versions.node}`);
    return;
  }
  try {
    runNpm(["--version"], "ignore");
  } catch {
    fail("npm is required to run Gaming Oasis Production OS.");
    return;
  }
  if (!existsSync(lockPath)) {
    fail("package-lock.json is missing; dependency integrity cannot be verified.");
    return;
  }

  const digest = lockDigest();
  const [existingWriter, existingWeb, port3000Open, port4877Open] = await Promise.all([
    probeWriter(),
    probeWorkspace(),
    portIsOpen(3000),
    portIsOpen(4877),
  ]);

  if (existingWriter.identityMatches && existingWriter.healthy && existingWeb) {
    if (!dependenciesAreCurrent(digest)) {
      fail("Production OS is already running, but dependencies changed. Close its server window, then run this launcher again.");
      return;
    }
    console.log("Gaming Oasis Production OS is already running. Opening the workspace...");
    openWorkspace();
    return;
  }

  if (port3000Open || port4877Open) {
    const occupied = [port3000Open ? "3000" : "", port4877Open ? "4877" : ""].filter(Boolean).join(" and ");
    fail(`Cannot start safely because local port${occupied.includes("and") ? "s" : ""} ${occupied} ${occupied.includes("and") ? "are" : "is"} already in use. Close the owning application and try again.`);
    return;
  }

  if (!dependenciesAreCurrent(digest)) {
    console.log("Preparing the verified Production OS dependency set...");
    runNpm(["ci", "--include=dev", "--prefer-offline", "--no-audit", "--no-fund"]);
    writeFileSync(installStampPath, `${digest}\n`, "utf8");
  }

  console.log("Building Gaming Oasis Production OS...");
  runNpm(["run", "build"]);
  if (await portIsOpen(3000) || await portIsOpen(4877)) {
    fail("A required port became occupied during setup. Close the owning application and try again.");
    return;
  }

  console.log("Starting the local production workspace...");
  const child = spawn(process.execPath, [path.join(root, "scripts", "local-runner.mjs"), "start"], {
    cwd: root,
    stdio: ["inherit", "inherit", "inherit", "ipc"],
    windowsHide: false,
  });
  let shutdownRequested = false;
  let requestedExitCode = 0;
  const forwardSignal = (exitCode) => {
    shutdownRequested = true;
    requestedExitCode = exitCode;
    void stopChild(child);
  };
  const handleSigint = () => forwardSignal(130);
  const handleSigterm = () => forwardSignal(143);
  process.once("SIGINT", handleSigint);
  process.once("SIGTERM", handleSigterm);
  try {
    await waitForReadiness(child);
  } catch (error) {
    await stopChild(child);
    process.removeListener("SIGINT", handleSigint);
    process.removeListener("SIGTERM", handleSigterm);
    if (shutdownRequested) {
      process.exitCode = requestedExitCode;
      return;
    }
    throw error;
  }
  if (shutdownRequested) {
    await stopChild(child);
    process.exitCode = requestedExitCode;
    return;
  }
  console.log(`Gaming Oasis Production OS is running at ${workspaceUrl}`);
  console.log("Keep this server window open while using the tool.");
  openWorkspace();
  const exitCode = child.exitCode ?? await new Promise((resolve) => child.once("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0))));
  process.removeListener("SIGINT", handleSigint);
  process.removeListener("SIGTERM", handleSigterm);
  process.exitCode = shutdownRequested ? requestedExitCode : exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => fail(`Gaming Oasis Production OS could not start: ${error.message}`));
}
