"use client";

import { useEffect, useRef, useState } from "react";
import { readBoundedJson } from "../../lib/bounded-json.mjs";

type PollingJsonOptions<T> = {
  endpoint: string;
  intervalMs: number;
  timeoutMs?: number;
  maximumBytes?: number;
  validate: (value: unknown) => value is T;
  normalize?: (value: T) => T;
};

/**
 * Poll a local live endpoint without overlapping requests and without forcing a
 * React render when the validated payload is unchanged.
 */
export function usePollingJson<T>({
  endpoint,
  intervalMs,
  timeoutMs = 8_000,
  maximumBytes = 2_000_000,
  validate,
  normalize,
}: PollingJsonOptions<T>) {
  const [value, setValue] = useState<T | null>(null);
  const lastPayloadRef = useRef("");

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let controller: AbortController | null = null;

    async function refresh() {
      controller = new AbortController();
      const requestController = controller;
      const timeout = window.setTimeout(() => requestController.abort(), timeoutMs);
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: requestController.signal,
        });
        if (response.status !== 204 && !response.ok) {
          await response.body?.cancel().catch(() => {});
          return;
        }
        if (response.status !== 204 && response.ok) {
          const candidate = await readBoundedJson(response, {
            maximumBytes,
            abort: () => requestController.abort(),
            message: "Overlay response is too large",
          });
          if (active && validate(candidate)) {
            const next = normalize ? normalize(candidate) : candidate;
            const serialized = JSON.stringify(next);
            if (serialized !== lastPayloadRef.current) {
              lastPayloadRef.current = serialized;
              setValue(next);
            }
          }
        }
      } catch {
        // Preserve the last valid graphic through temporary local failures.
      } finally {
        window.clearTimeout(timeout);
        if (controller === requestController) controller = null;
        if (active) timer = window.setTimeout(refresh, intervalMs);
      }
    }

    void refresh();
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
      controller?.abort();
    };
  }, [endpoint, intervalMs, maximumBytes, normalize, timeoutMs, validate]);

  return value;
}
