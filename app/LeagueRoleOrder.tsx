"use client";

import { useState } from "react";
import { LEAGUE_ROLES } from "../lib/league-of-legends.mjs";

const roles: string[] = LEAGUE_ROLES;

export function LeagueRoleOrder({ side, picks, order, onAssign }: {
  side: "blue" | "red"; picks: string[]; order: number[];
  onAssign: (role: number, pick: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const move = (target: number, pick: number) => {
    const role = order.indexOf(pick);
    if (role < 0 || target < 0 || target >= picks.length) return;
    onAssign(role, target);
    setAnnouncement(`${roles[role]} assigned to pick ${target + 1}. Champions remain in pick order.`);
    setSelected(null);
    setOver(null);
  };
  return <>
    <div className="league-role-fields" onKeyDown={(event) => { if (event.key === "Escape") { setSelected(null); setOver(null); } }}>
      {picks.map((champion, index) => {
        const pick = index;
        const role = roles[order.indexOf(pick)];
        return <div key={pick} className="league-role-card">
          <strong>{champion || "Unselected"}</strong>
          <small>Pick {pick + 1}</small>
          <button type="button"
          className={`league-role-handle${selected === pick ? " selected" : ""}${over === index ? " drag-over" : ""}`}
          draggable aria-pressed={selected === pick}
          aria-label={`${side} pick ${pick + 1}: ${champion || "Unselected"}, ${role}. ${selected === null ? "Select role to swap" : "Assign selected role here"}`}
          onClick={() => selected === null ? setSelected(pick) : move(index, selected)}
          onDragStart={(event) => {
            event.dataTransfer.setData("application/x-league-role", `${side}:${pick}`);
            event.dataTransfer.effectAllowed = "move";
            setSelected(pick);
          }}
          onDragOver={(event) => {
            if (selected === null || !event.dataTransfer.types.includes("application/x-league-role")) return;
            event.preventDefault(); event.dataTransfer.dropEffect = "move"; setOver(index);
          }}
          onDragLeave={() => setOver(null)}
          onDragEnd={() => { setSelected(null); setOver(null); }}
          onDrop={(event) => {
            event.preventDefault();
            const [sourceSide, sourcePick] = event.dataTransfer.getData("application/x-league-role").split(":");
            if (sourceSide === side && /^\d$/.test(sourcePick)) move(index, Number(sourcePick));
            setOver(null);
          }}>
          <span className="league-role-card-label"><span aria-hidden="true">⠿</span> {role}</span>
          </button>
        </div>;
      })}
    </div>
    <span className="sr-only" role="status">{announcement}</span>
  </>;
}
