/** One cancellable request at a time. Injected scheduling also makes retry/teardown testable. */
export function startHubPolling({ load, accept, status, schedule = setTimeout, cancel = clearTimeout, now = () => new Date().toISOString() }) {
  let active = true;
  let controller = null;
  let timer = null;
  let failures = 0;
  let lastSuccess = "";
  let lastError = "";
  let refreshQueued = false;
  const poll = async () => {
    if (!active || controller) return;
    timer = null;
    controller = new AbortController();
    const signal = controller.signal;
    const timeout = schedule(() => controller?.abort("timeout"), 10_000);
    status({ busy: true, error: lastError, lastSuccess });
    try {
      const result = await load(signal);
      if (!active || signal.aborted) return;
      accept(result);
      failures = 0;
      lastError = "";
      lastSuccess = now();
      status({ busy: false, error: "", lastSuccess });
    } catch (error) {
      if (!active) return;
      failures += 1;
      lastError = signal.aborted ? "League Hub request timed out" : error?.message || "League Hub is unavailable";
      status({ busy: false, error: lastError, lastSuccess });
    } finally {
      cancel(timeout);
      controller = null;
      if (active) {
        timer = schedule(poll, refreshQueued ? 0 : Math.min(30_000, 2_000 * 2 ** Math.min(failures, 4)));
        refreshQueued = false;
      }
    }
  };
  void poll();
  return {
    refresh() {
      if (!active) return;
      if (controller) { refreshQueued = true; return; }
      if (timer !== null) cancel(timer);
      void poll();
    },
    stop() {
      active = false;
      if (timer !== null) cancel(timer);
      controller?.abort();
    },
  };
}
