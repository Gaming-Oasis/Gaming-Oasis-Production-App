import { spawn } from "node:child_process";

const activeStops = new WeakMap();

function childHasExited(child) {
  return !child || child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child, timeoutMs) {
  if (childHasExited(child)) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (exited) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener("exit", handleExit);
      resolve(exited);
    };
    const handleExit = () => finish(true);
    const timer = setTimeout(() => finish(childHasExited(child)), Math.max(0, timeoutMs));
    child.once("exit", handleExit);
  });
}

async function terminateExactWindowsTree(child) {
  const pid = child?.pid;
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (succeeded) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(succeeded);
    };
    const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      shell: false,
      stdio: "ignore",
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      try {
        killer.kill();
      } finally {
        finish(false);
      }
    }, 5_000);
    killer.once("error", () => finish(false));
    killer.once("exit", (code) => finish(code === 0 || childHasExited(child)));
  });
}

async function forceStopProcessTree(child) {
  if (childHasExited(child)) return;
  if (process.platform === "win32" && await terminateExactWindowsTree(child)) return;
  try {
    child.kill("SIGTERM");
  } catch {
    // The process may have exited between the status check and signal.
  }
}

async function performStop(child, graceMs) {
  if (childHasExited(child)) return;
  let gracefulRequestSent = false;
  if (child.connected && typeof child.send === "function") {
    try {
      child.send({ type: "shutdown" }, () => {});
      gracefulRequestSent = true;
    } catch {
      // Fall through to exact-PID termination.
    }
  }
  if (gracefulRequestSent && await waitForExit(child, graceMs)) return;
  await forceStopProcessTree(child);
  await waitForExit(child, 2_000);
}

export function stopChild(child, graceMs = 5_000) {
  if (!child || childHasExited(child)) return Promise.resolve();
  const existing = activeStops.get(child);
  if (existing) return existing;
  const operation = performStop(child, graceMs).finally(() => {
    if (activeStops.get(child) === operation) activeStops.delete(child);
  });
  activeStops.set(child, operation);
  return operation;
}
