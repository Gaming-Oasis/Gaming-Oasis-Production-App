"use client";

import { useCallback, useEffect, useState } from "react";

/** Keep the last loaded graphic visible while a replacement loads or retries. */
export function useStableImageSource(source: string, retryMs = 5_000) {
  const [displayedSource, setDisplayedSource] = useState("");

  useEffect(() => {
    if (!source) {
      setDisplayedSource("");
      return;
    }
    if (source === displayedSource) return;

    let active = true;
    let retryTimer: number | undefined;
    let loader: HTMLImageElement | null = null;

    const attempt = () => {
      loader = new Image();
      loader.onload = () => {
        if (active) setDisplayedSource(source);
      };
      loader.onerror = () => {
        if (active) retryTimer = window.setTimeout(attempt, retryMs);
      };
      loader.src = source;
    };

    attempt();
    return () => {
      active = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (loader) {
        loader.onload = null;
        loader.onerror = null;
      }
    };
  }, [displayedSource, retryMs, source]);

  const handleDisplayedError = useCallback(() => {
    setDisplayedSource((current) => current === source ? "" : current);
  }, [source]);

  return {
    displayedSource: source ? displayedSource : "",
    handleDisplayedError,
  };
}
