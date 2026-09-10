"use client";

import { useEffect, useRef, useState } from "react";

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
          const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
          if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
            requestController.abort();
            throw new Error("Overlay response is too large");
          }
          const chunks: Uint8Array[] = [];
          let receivedBytes = 0;
          if (response.body) {
            const reader = response.body.getReader();
            while (true) {
              const { done, value: chunk } = await reader.read();
              if (done) break;
              receivedBytes += chunk.byteLength;
              if (receivedBytes > maximumBytes) {
                requestController.abort();
                throw new Error("Overlay response is too large");
              }
              chunks.push(chunk);
            }
          }
          const bytes = new Uint8Array(receivedBytes);
          let offset = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
          }
          const candidate: unknown = JSON.parse(new TextDecoder().decode(bytes));
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
