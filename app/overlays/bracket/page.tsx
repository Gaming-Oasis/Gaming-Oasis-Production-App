"use client";

import { useEffect, useState } from "react";
import { isBracketOverlayState } from "../../../lib/bracket.mjs";
import { usePollingJson } from "../usePollingJson";
import { BracketStage } from "./BracketStage";
import styles from "./bracket.module.css";

export default function BracketOverlay() {
  const value = usePollingJson({ endpoint: "http://127.0.0.1:4877/api/overlays/bracket", intervalMs: 500, validate: isBracketOverlayState });
  const [frame, setFrame] = useState({ scale: 1, left: 0 });
  useEffect(() => {
    const resize = () => { const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080); setFrame({ scale, left: Math.max(0, (window.innerWidth - 1920 * scale) / 2) }); };
    resize(); window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize);
  }, []);
  return <div className={styles.viewport}>
    <style>{"html,body{margin:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:transparent!important;}"}</style>
    <div className={styles.frame} style={{ transform: `translateX(${frame.left}px) scale(${frame.scale})` }}>{value ? <BracketStage value={value} /> : null}</div>
  </div>;
}
