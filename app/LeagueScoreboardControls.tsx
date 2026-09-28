"use client";

import { LEAGUE_DRAGON_TYPES, LEAGUE_SCOREBOARD_STATS, leagueBaronSecondsRemaining, leagueElderSecondsRemaining, normalizeLeagueScoreboard, resetLeagueScoreboardCounts, setLeagueBaronActive, setLeagueElderActive, updateLeagueDragons } from "../lib/league-scoreboard.mjs";
import LeagueDragonIcon from "./LeagueDragonIcon";
import { useCountdownClock } from "./useCountdownClock";

export type LeagueScoreboardSettings = {
  hideScoreboard: boolean; hideCountdowns: boolean;
  goldSource: "disabled" | "api";
  clockSource: "disabled" | "api";
  stats: Record<string, { source: "manual" | "api"; team1: number; team2: number }>;
  dragons: Record<"team1" | "team2", { types: string[]; soulActive: boolean; soulType: string }>;
  baronBuffs: Record<"team1" | "team2", { expiresAt: number | null }>;
  elderBuffs: Record<"team1" | "team2", { expiresAt: number | null }>;
};

export default function LeagueScoreboardControls({ value, blueTeamKey, teamOne, teamTwo, onChange }: {
  value: LeagueScoreboardSettings; blueTeamKey: "team1" | "team2"; teamOne: string; teamTwo: string;
  onChange: (value: LeagueScoreboardSettings) => void;
}) {
  const teams = blueTeamKey === "team1" ? ["team1", "team2"] as const : ["team2", "team1"] as const;
  const teamNames = { team1: teamOne, team2: teamTwo };
  const now = useCountdownClock(Math.max(value.baronBuffs.team1.expiresAt ?? 0, value.baronBuffs.team2.expiresAt ?? 0, value.elderBuffs.team1.expiresAt ?? 0, value.elderBuffs.team2.expiresAt ?? 0));
  const updateStat = (key: string, patch: Partial<LeagueScoreboardSettings["stats"][string]>) => onChange(normalizeLeagueScoreboard({ ...value, stats: { ...value.stats, [key]: { ...value.stats[key], ...patch } } }) as LeagueScoreboardSettings);
  const updateDragons = (team: "team1" | "team2", patch: Partial<LeagueScoreboardSettings["dragons"]["team1"]>) => onChange(updateLeagueDragons(value, team, patch) as LeagueScoreboardSettings);
  const dragonOptions = <><option value="unknown">Unspecified</option>{LEAGUE_DRAGON_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</>;
  const buffControl = (team: "team1" | "team2", kind: "baron" | "elder") => {
    const elder = kind === "elder";
    const label = elder ? "Elder Dragon" : "Baron";
    const remaining = elder ? leagueElderSecondsRemaining(value.elderBuffs[team], now) : leagueBaronSecondsRemaining(value.baronBuffs[team], now);
    const update = elder ? setLeagueElderActive : setLeagueBaronActive;
    return <>
      <div className="league-dragon-soul-toggle"><span>{label} active</span><label className="switch"><input type="checkbox" aria-label={`${teamNames[team]} ${label} active`} checked={remaining > 0} onChange={event => onChange(update(value, team, event.target.checked) as LeagueScoreboardSettings)} /><span /></label></div>
      <small className="league-buff-status">{remaining > 0 ? <output aria-label={`${teamNames[team]} ${label} buff remaining`}>{Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")} remaining</output> : `Activate to start ${elder ? "2:30" : "3:00"}`}</small>
    </>;
  };
  return <section className="panel-card browser-overlay-card browser-overlay-workspace league-scoreboard-controls" aria-label="League scoreboard controls">
    <div className="card-title-row"><div><h2>Scoreboard controls</h2><p>Manual values stay on air without a game connection. API is unavailable for Grubs, Baron, Dragons, and Gold.</p></div></div>
    <div className="browser-overlay-widget-controls">
      {([
        ["hideScoreboard", "Hide Scoreboard", "Hide the top scoreboard; the sponsor box has its own toggle."],
        ["hideCountdowns", "Hide Countdowns", "Hide the Baron and Dragon respawn timer boxes."],
      ] as const).map(([key, label, description]) => <div className="browser-overlay-widget-toggle" key={key}>
        <div><strong>{label}</strong><small>{description}</small></div>
        <label className="switch large"><input type="checkbox" aria-label={label} checked={value[key]} onChange={event => onChange({ ...value, [key]: event.target.checked })} /><span /></label>
      </div>)}
    </div>
    <div className="league-scoreboard-table-wrap"><table className="league-scoreboard-table">
      <thead><tr><th scope="col">Statistic</th><th scope="col">Source</th>{teams.map((team, index) => <th scope="col" key={team}>{index === 0 ? "Left" : "Right"} · {teamNames[team]}</th>)}</tr></thead>
      <tbody>{LEAGUE_SCOREBOARD_STATS.map(({ key, label, api, max }) => <tr key={key} className={key === "dragons" ? "league-dragons-row" : undefined}>
        <th scope="row">{label}</th>
        <td><div className="league-stat-source" role="group" aria-label={`${label} source`}>
          <button type="button" aria-pressed={value.stats[key].source === "manual"} onClick={() => updateStat(key, { source: "manual" })}>Manual</button>
          <button type="button" disabled={!api} title={!api ? "API unavailable for this statistic" : undefined} aria-pressed={value.stats[key].source === "api"} onClick={() => updateStat(key, { source: "api" })}>API</button>
        </div></td>
        {teams.map(team => <td key={team}>{key === "dragons" ? <div className="league-dragon-controls">
          {Array.from({ length: 4 }, (_, index) => value.dragons[team].types[index] ?? "").map((type, index) => <label className="field" key={index}>
            <span className="field-label">Dragon {index + 1}{index === 3 ? " · Soul" : ""}</span>
            <span className="league-dragon-select"><span className="league-dragon-preview" style={{ opacity: type ? 1 : 0.35 }}><LeagueDragonIcon type={type} /></span><select aria-label={`${teamNames[team]} Dragon ${index + 1}`} value={type} onChange={event => updateDragons(team, { types: Array.from({ length: 4 }, (_, slot) => slot === index ? event.target.value : value.dragons[team].types[slot] ?? "") })}>
              <option value="">Not taken</option>{dragonOptions}
            </select></span>
          </label>)}
          <small className="league-buff-status">{value.dragons[team].soulActive ? "Dragon Soul secured · fourth dragon" : "The fourth dragon automatically grants Soul."}</small>
          {buffControl(team, "elder")}
        </div> : <div className="league-stat-values"><input className="setting-input" type="number" min={0} max={max} step={1} inputMode="numeric" aria-label={`${teamNames[team]} ${label}`} disabled={value.stats[key].source === "api"} value={value.stats[key][team]} onChange={event => updateStat(key, { [team]: event.target.value === "" ? 0 : Number(event.target.value) })} />
          {key === "barons" ? buffControl(team, "baron") : null}
        </div>}</td>)}
      </tr>)}
      <tr><th scope="row">Gold</th><td><div className="league-stat-source" role="group" aria-label="Gold source">
        <button type="button" aria-pressed={value.goldSource === "disabled"} onClick={() => onChange({ ...value, goldSource: "disabled" })}>Disabled</button>
        <button type="button" disabled title="API unavailable for this statistic" aria-pressed={false}>API</button>
      </div></td><td colSpan={2}><span className="muted">Hidden — team gold API unavailable</span></td></tr>
      <tr><th scope="row">Game clock</th><td><div className="league-stat-source" role="group" aria-label="Game clock source">
        <button type="button" aria-pressed={value.clockSource === "disabled"} onClick={() => onChange({ ...value, clockSource: "disabled" })}>Disabled</button>
        <button type="button" aria-pressed={value.clockSource === "api"} onClick={() => onChange({ ...value, clockSource: "api" })}>API</button>
      </div></td><td colSpan={2}><span className="muted">Live match time</span></td></tr>
      </tbody>
    </table></div>
    <div className="browser-overlay-actions"><button className="button secondary" type="button" onClick={() => { if (window.confirm("Clear all manual League scoreboard counts?")) onChange(resetLeagueScoreboardCounts(value) as LeagueScoreboardSettings); }}>Clear manual counts</button></div>
  </section>;
}
