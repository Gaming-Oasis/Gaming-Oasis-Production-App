"use client";

import { useState, type CSSProperties } from "react";
import { layoutBracket, type BracketState, type BracketParticipant } from "../../../lib/bracket.mjs";
import { detectImagePlate, readableText, resolveImagePlate } from "../../../lib/readable-text.mjs";
import { sponsorLogoSrc } from "../../../lib/sponsor-logo-url.mjs";
import { useStableImageSource } from "../useStableImageSource";
import styles from "./bracket.module.css";

function TeamLogo({ participant }: { participant: BracketParticipant }) {
  const [plate, setPlate] = useState(resolveImagePlate(""));
  let src = participant.logo;
  try {
    const url = new URL(src);
    src = url.origin === "https://hub.gamingoasis.gg" && /^\/api\/public\/logos\/(teams|leagues)\/[0-9a-f-]{36}$/i.test(url.pathname)
      ? `http://127.0.0.1:4877${url.pathname}` : sponsorLogoSrc(src);
  } catch { src = ""; }
  const image = useStableImageSource(src);
  return <span className={styles.logo} style={{ backgroundColor: src ? plate : "transparent" }} aria-hidden="true">
    {image.displayedSource ? <img src={image.displayedSource} crossOrigin="anonymous" alt="" onError={image.handleDisplayedError} onLoad={event => {
      const detected = detectImagePlate(event.currentTarget); if (detected) setPlate(detected);
    }} /> : null}
  </span>;
}

export function BracketStage({ value }: { value: BracketState }) {
  const snapshot = value.snapshot;
  const layout = layoutBracket(value);
  if (!snapshot) return <div className={styles.stage} data-background={value.background} aria-label="No bracket loaded" />;
  const cutoff = snapshot.stage.formatSummary.match(/Cutoff Top (\d+)/i)?.[1];
  const qualification = snapshot.advancement || (cutoff ? `Top ${cutoff} qualify` : "");
  const lastColumn = layout.cards.filter(card => card.column === layout.headers.length - 1);
  const qualificationCard = lastColumn.length === 1 ? lastColumn[0] : null;
  const qualificationTop = qualificationCard ? qualificationCard.y + qualificationCard.height + 34 : 0;
  const qualificationLines = Math.floor((988 - qualificationTop - 20) / 24);
  return <div className={styles.stage} data-background={value.background} style={{ "--bracket-accent": snapshot.league.primaryColor, "--bracket-accent-text": readableText(snapshot.league.primaryColor) } as CSSProperties} aria-label={`${snapshot.event.name} — ${snapshot.stage.name}`}>
    <header className={styles.header}>
      <div className={styles.heading}><p title={snapshot.event.name}>{snapshot.event.name}</p><h1 title={snapshot.stage.name}>{snapshot.stage.name}</h1></div>
      <div className={styles.brand}><img src="/gaming-oasis-logo-light.png" alt="Gaming Oasis" /><p title={layout.label}>{layout.label}</p></div>
    </header>
    {layout.headers.map((header, index) => <div key={index} className={styles.roundHeading} style={{ left: header.x, width: header.width }} title={header.label}>{header.label.replace(/^\d+\.\s*/, "")}</div>)}
    <svg className={styles.connectors} viewBox="0 0 1920 1080" aria-hidden="true">{layout.connectors.map((path, index) => <g key={index}><path className={styles.connectorContrast} d={path} /><path className={styles.connectorLine} d={path} /></g>)}</svg>
    {layout.cards.map(card => <section key={card.match.id} className={`${styles.match} ${card.height < 100 ? styles.compact : ""}`} data-match-id={card.match.id} style={{ left: card.x, top: card.y, width: card.width, height: card.height }} aria-label={`Match ${card.match.matchNumber ?? ""}`}>
      <div className={styles.matchHeading}><span>{card.match.matchNumber === null ? "Match" : `M${card.match.matchNumber}`}</span><span>{card.match.isBye ? "Bye" : card.match.outcome === "forfeit" ? "Forfeit" : card.match.outcome === "dnf" ? "Did not finish" : card.match.bestOf ? `Bo${card.match.bestOf}` : ""}</span></div>
      {[card.match.team1, card.match.team2].map((participant, index) => <div key={index} className={styles.matchRow} data-winner={participant.result === "win"} data-pending={!participant.teamId} aria-label={`${participant.seed !== null ? `Seed ${participant.seed}, ` : ""}${participant.name}, ${participant.score ?? "pending"}${participant.result === "win" ? ", winner" : ""}`}>
        <span className={styles.seed}>{participant.seed ?? ""}</span>
        <div className={styles.team}><TeamLogo key={participant.teamId} participant={participant} /><span className={styles.teamName} title={participant.name}>{participant.name}</span></div>
        <span className={styles.score} data-pending={participant.score === null}>{participant.score ?? "—"}</span>
      </div>)}
    </section>)}
    {qualification && qualificationCard && qualificationCard.y + qualificationCard.height + 88 < 988 ? <div className={styles.qualification} title={qualification} style={{ left: qualificationCard.x, top: qualificationTop, width: qualificationCard.width, WebkitLineClamp: qualificationLines }}>{qualification}</div> : null}
    <footer className={styles.footer}><span title={snapshot.league.name}>{snapshot.league.name}</span><span title={snapshot.stage.formatSummary}>{snapshot.stage.formatSummary}</span></footer>
  </div>;
}
