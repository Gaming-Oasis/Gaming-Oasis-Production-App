"use client";

import { useEffect, useState } from "react";

/** Local display ticks; the persisted deadline only changes on operator actions. */
export function useCountdownClock(deadline: number) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const current = Date.now();
    setNow(current);
    if (deadline <= current) return;
    const timer = window.setInterval(() => {
      const next = Date.now();
      setNow(next);
      if (next >= deadline) window.clearInterval(timer);
    }, 250);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return now;
}
