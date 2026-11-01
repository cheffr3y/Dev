"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  CROPS, CROP_IDS, FRIENDS, FRIEND_IDS, PHASES, PROJECTS, PROJECT_IDS, TOOLS, TOOL_IDS,
  advanceHomestead, createHomestead, importHomestead, isRipe, tileDescription,
  type HomesteadAction, type HomesteadSave, type HomesteadState, type Tile,
} from "@/lib/games/homestead";
import { loadHomestead, saveHomestead } from "./actions";
import styles from "./homestead.module.css";

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className={styles.dialog} aria-labelledby="homestead-dialog-title" onClose={onClose}>
    <div className={styles.dialogHeader}><h2 id="homestead-dialog-title">{title}</h2><button type="button" onClick={onClose} aria-label="Close dialog">✕</button></div>
    {children}
  </dialog>;
}

function TileArt({ tile }: { tile: Tile }) {
  const icon = tile.companion ? FRIENDS[tile.companion].icon
    : tile.crop ? isRipe(tile) ? CROPS[tile.crop.id].icon : tile.crop.growth ? "🌿" : "🌱"
    : tile.debris === "wood" ? "🪵" : tile.debris === "stone" ? "🪨" : tile.debris === "weeds" ? "🌾"
    : tile.terrain === "pond" ? "🪷" : (tile.r * 3 + tile.c) % 7 === 0 && tile.terrain === "grass" ? "🌼" : "";
  return <><span aria-hidden="true" className={styles.sprite}>{icon}</span>
    {tile.watered && <span aria-hidden="true" className={styles.tileBadge}>💧</span>}
    {isRipe(tile) && <span aria-hidden="true" className={styles.tileBadge}>✦</span>}
    {tile.crop && !isRipe(tile) && <span aria-hidden="true" className={styles.growth}><span style={{ width: `${tile.crop.growth / CROPS[tile.crop.id].ticks * 100}%` }} /></span>}
  </>;
}

export function Homestead({ userId, initialSave }: { userId: string; initialSave: HomesteadSave | null }) {
  const [state, setState] = useState(() => initialSave?.state ?? createHomestead());
  const [message, setMessage] = useState("Welcome to your little acre. Gather the ripe sunberry to get started.");
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [panel, setPanel] = useState<"save" | "guide" | null>(null);
  const [status, setStatus] = useState(initialSave ? "Saved to account" : "Ready to grow");
  const [conflict, setConflict] = useState(false);
  const [retry, setRetry] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [imported, setImported] = useState<HomesteadState | null>(null);
  const [fileError, setFileError] = useState("");
  const latest = useRef(state);
  const revision = useRef(initialSave?.revision ?? 0);
  const edits = useRef(0);
  const dirty = useRef(false);
  const saving = useRef(false);
  const blocked = useRef(false);
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const storageKey = `mise-homestead:${userId}`;

  const backup = useCallback(() => {
    try { localStorage.setItem(storageKey, JSON.stringify({ state: latest.current, revision: revision.current })); return true; }
    catch { return false; }
  }, [storageKey]);

  const flush = useCallback(async () => {
    if (saving.current || blocked.current || !dirty.current) return;
    saving.current = true;
    const snapshot = latest.current;
    const edit = edits.current;
    setStatus("Saving…"); setRetry(false);
    try {
      const result = await saveHomestead({ state: snapshot, revision: revision.current });
      if (!mounted.current) return;
      if (!result.ok) {
        blocked.current = true;
        if (result.reason === "conflict") { setConflict(true); setStatus("Another session saved changes"); }
        else { setStatus("Save could not be validated. Download a backup."); }
        return;
      }
      revision.current = result.revision;
      dirty.current = edits.current !== edit;
      if (dirty.current) backup();
      else {
        try { localStorage.removeItem(storageKey); } catch { /* Account save succeeded. */ }
      }
      setStatus("Saved to account");
    } catch {
      if (!mounted.current) return;
      setStatus(backup() ? "Saved on this device · account sync pending" : "Not saved · download a backup");
      setRetry(true);
      return;
    } finally { saving.current = false; }
    if (dirty.current && !blocked.current && mounted.current) timer.current = setTimeout(() => { void flushRef.current(); }, 650);
  }, [backup, storageKey]);

  useEffect(() => { flushRef.current = flush; }, [flush]);

  const commit = useCallback((next: HomesteadState) => {
    latest.current = next; edits.current++; dirty.current = true;
    setState(next); backup(); setStatus("Saving…");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flushRef.current(); }, 650);
  }, [backup]);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        setMuted(localStorage.getItem(`${storageKey}:sound`) !== "on");
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const pending = JSON.parse(raw);
          const recovered = importHomestead(pending.state);
          if (JSON.stringify(recovered) === JSON.stringify(latest.current)) localStorage.removeItem(storageKey);
          else if (pending.revision === revision.current) {
            commit(recovered); setMessage("Recovered your last unsynced changes from this device.");
          } else {
            latest.current = recovered; setState(recovered); dirty.current = true;
            blocked.current = true; setConflict(true); setStatus("Choose which save to keep");
          }
        }
      } catch { setMessage("A local backup could not be read. Your account save is still available."); }
      setReady(true);
    });
    const online = () => { void flushRef.current(); };
    const leaving = () => { if (dirty.current) backup(); };
    window.addEventListener("online", online); window.addEventListener("pagehide", leaving);
    return () => {
      cancelled = true;
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("online", online); window.removeEventListener("pagehide", leaving);
      if (dirty.current) backup();
      void audio.current?.close(); audio.current = null;
    };
  }, [backup, commit, storageKey]);

  function chime() {
    if (muted) return;
    try {
      audio.current ??= new AudioContext();
      const context = audio.current;
      void context.resume().catch(() => {});
      const tone = context.createOscillator(), gain = context.createGain();
      tone.connect(gain); gain.connect(context.destination);
      tone.frequency.setValueAtTime(523.25, context.currentTime);
      tone.frequency.exponentialRampToValueAtTime(659.25, context.currentTime + .12);
      gain.gain.setValueAtTime(.045, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .2);
      tone.start(); tone.stop(context.currentTime + .2);
      tone.onended = () => { tone.disconnect(); gain.disconnect(); };
    } catch { /* Sound is optional; gameplay remains available. */ }
  }
  function act(action: HomesteadAction) {
    if (!ready || blocked.current) return;
    const result = advanceHomestead(latest.current, action);
    setMessage(result.message);
    if (JSON.stringify(result.state) !== JSON.stringify(latest.current)) commit(result.state);
    chime();
  }
  useEffect(() => {
    if (!ready || paused || panel || conflict) return;
    const interval = setInterval(() => {
      if (document.hidden || blocked.current) return;
      const result = advanceHomestead(latest.current, { type: "tick" });
      commit(result.state); setMessage(result.message);
    }, 25_000);
    return () => clearInterval(interval);
  }, [ready, paused, panel, conflict, commit]);

  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(latest.current, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `willowbrook-day-${latest.current.day}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function restoreAccountSave() {
    try {
      const cloud = await loadHomestead();
      // Loading an account save is an explicit replacement, after offering export.
      latest.current = cloud?.state ?? createHomestead(); revision.current = cloud?.revision ?? 0;
      dirty.current = false; blocked.current = false;
      try { localStorage.removeItem(storageKey); } catch { /* No local storage. */ }
      setState(latest.current); setConflict(false); setRetry(false); setStatus(cloud ? "Saved to account" : "Ready to grow");
      setMessage("Your account’s latest garden is ready.");
    } catch { setStatus("Could not load the account save. Try again when connected."); }
  }
  const ripe = state.grid.filter(isRipe).length;
  const unlocked = FRIEND_IDS.filter(id => state.companions[id].unlocked).length;
  const restored = PROJECT_IDS.filter(id => state.projects[id]).length;
  const phase = PHASES[state.timeIndex];
  const disabled = !ready || conflict;

  return <div className={styles.homestead}>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>Mise · The break room</p><h1>Willowbrook Acre<span> A little room to grow.</span></h1><p>Your own cozy homestead & animal sanctuary.</p></div>
      <div className={styles.headerActions}>
        <button type="button" onClick={() => setPanel("guide")}>Field guide <span aria-hidden="true">↗</span></button>
        <button type="button" onClick={() => setPanel("save")}>Save & settings</button>
      </div>
    </header>
    <div className={styles.saveLine}><span className={styles.saveDot} data-pending={status !== "Saved to account"} /><span role="status" aria-live="polite">{status}</span>{retry && <button type="button" onClick={() => void flush()}>Retry sync</button>}</div>
    {conflict && <div role="alert" className={styles.notice}><strong>Your garden has two different saves.</strong><p>Another tab or device saved changes. Download this device’s garden before switching to the account save. You can import the backup later.</p><div><button type="button" onClick={download}>Download this garden</button><button type="button" onClick={() => void restoreAccountSave()}>Use account save</button></div></div>}
    <div className={styles.resources} aria-label="Garden resources">
      {([['wood', '🪵', 'Wood'], ['stone', '🪨', 'Stone'], ['crops', '🧺', 'Harvests'], ['coins', '🪙', 'Coins']] as const).map(([key, icon, label]) => <div key={key}><span aria-hidden="true">{icon}</span><div><span>{label}</span><strong data-resource={key}>{state.resources[key].toLocaleString()}</strong></div></div>)}
      <button type="button" disabled={disabled || !state.resources.crops} onClick={() => act({ type: "sell" })}>Sell harvests <span>+{state.resources.crops * 5} coins</span></button>
    </div>
    <div className={styles.workspace}>
      <section className={styles.garden} aria-label="Your homestead">
        <div className={styles.landscape} data-phase={state.timeIndex}>
          <div className={styles.gardenHeading}><div><span>{phase.icon} Day {state.day} · {phase.name}</span><h2>The meadow</h2></div><span className={styles.acre}>{state.gridSize} × {state.gridSize} acre</span></div>
          <div className={styles.scene} aria-hidden="true"><span>🌳</span><span>🌲</span><span className={styles.cottage}>{state.projects.cozy_barn ? "🏡" : "🏠"}</span><span>{state.projects.flower_arch ? "🌸" : "🌳"}</span><span>🌲</span></div>
          <div className={styles.gridScroll} tabIndex={0} aria-label="Meadow tiles; scroll sideways on a small screen">
            <div className={styles.grid} style={{ gridTemplateColumns: `repeat(${state.gridSize}, minmax(44px, 1fr))`, minWidth: state.gridSize * 44 + (state.gridSize - 1) * 5 + 20 }}>
              {state.grid.map(tile => <button key={`${tile.r}-${tile.c}`} type="button" disabled={disabled}
                className={styles.tile} data-terrain={tile.terrain} data-watered={tile.watered} data-ready={isRipe(tile)}
                aria-label={tileDescription(tile)} title={tileDescription(tile)} data-tile={`${tile.r}-${tile.c}`}
                onClick={() => act({ type: "tile", r: tile.r, c: tile.c })}
                onKeyDown={event => {
                  const move: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -state.gridSize, ArrowDown: state.gridSize };
                  if (!(event.key in move)) return;
                  event.preventDefault();
                  const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button");
                  buttons?.[tile.r * state.gridSize + tile.c + move[event.key]]?.focus();
                }}><TileArt tile={tile} /></button>)}
            </div>
          </div>
          <div className={styles.meadowFooter}><span>{ripe ? `${ripe} ready to gather` : "Good things take a little tending"}</span><span>🌱 Seeds are always free</span></div>
        </div>
        <p className={styles.message} role="status" aria-live="polite"><span aria-hidden="true">✦</span>{message}</p>
        <div className={styles.controls}>
          <div className={styles.tools} role="group" aria-label="Garden tools">
            {TOOL_IDS.map(id => <button key={id} type="button" aria-pressed={state.selectedTool === id} disabled={disabled} onClick={() => act({ type: "tool", tool: id })}><span aria-hidden="true">{TOOLS[id].icon}</span>{TOOLS[id].name}</button>)}
          </div>
          {state.selectedTool === "plant" && <div className={styles.seeds} role="group" aria-label="Choose a seed">{CROP_IDS.map(id => <button key={id} type="button" disabled={disabled} aria-pressed={state.selectedSeed === id} title={CROPS[id].hint} onClick={() => act({ type: "seed", seed: id })}><span aria-hidden="true">{CROPS[id].icon}</span><span>{CROPS[id].name}<small>{CROPS[id].ticks} growth steps</small></span></button>)}</div>}
          <p className={styles.toolHint}>{TOOLS[state.selectedTool].hint}</p>
          <div className={styles.timeControls}><button type="button" className={styles.primary} disabled={disabled} onClick={() => act({ type: "tick" })}>Let time pass <span aria-hidden="true">→</span></button><button type="button" disabled={disabled} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "Resume" : "Pause"} auto-growth</button><span>{paused ? "The meadow can wait." : "A step every 25s while you’re here."}</span></div>
        </div>
      </section>
      <aside className={styles.journal}>
        <section className={styles.card}><div className={styles.sectionHeading}><p className={styles.eyebrow}>Little by little</p><span>{restored}/3 restored</span></div><h2>Make yourself at home</h2><p className={styles.cardIntro}>A few repairs. A few new friends. An acre that feels like yours.</p>
          <div className={styles.projects}>{PROJECT_IDS.map(id => {
            const project = PROJECTS[id], done = state.projects[id];
            const afford = state.resources.wood >= project.wood && state.resources.stone >= project.stone && state.resources.coins >= project.coins;
            return <article key={id} className={styles.project} data-complete={done}><span className={styles.projectIcon} aria-hidden="true">{project.icon}</span><div><h3>{project.name}</h3><p>{project.hint}</p>{done ? <span className={styles.complete}>✓ Restored</span> : <><div className={styles.cost}>{(["wood", "stone", "coins"] as const).map(key => <span key={key} data-enough={state.resources[key] >= project[key]}>{project[key]} {key}</span>)}</div><button type="button" disabled={disabled || !afford} onClick={() => act({ type: "restore", id })}>Restore {project.name}</button></>}</div></article>;
          })}</div>
          <button type="button" className={styles.forage} disabled={disabled || state.lastForageDay === state.day} onClick={() => act({ type: "forage" })}>🌲 {state.lastForageDay === state.day ? "Woods explored · back tomorrow" : "Explore the woods · +3 wood, +2 stone"}</button>
        </section>
        <section className={styles.card}><div className={styles.sectionHeading}><p className={styles.eyebrow}>A softer kind of company</p><span>{unlocked}/6 friends</span></div><h2>Sanctuary friends</h2><div className={styles.friends}>{FRIEND_IDS.map(id => <button key={id} type="button" disabled={disabled} className={styles.friend} data-unlocked={state.companions[id].unlocked} onClick={() => state.companions[id].unlocked ? act({ type: "pet", id }) : setPanel("guide")}><span aria-hidden="true">{state.companions[id].unlocked ? FRIENDS[id].icon : "🐾"}</span><strong>{state.companions[id].unlocked ? FRIENDS[id].name : "A new friend"}</strong><small>{state.companions[id].unlocked ? state.companions[id].lastGiftDay === state.day ? "Gift collected" : "Pet for a gift" : "See how to invite"}</small></button>)}</div><button type="button" className={styles.textButton} onClick={() => setPanel("guide")}>Open the field guide →</button></section>
        {!state.carePackageClaimed && <button type="button" disabled={disabled} className={styles.parcel} onClick={() => act({ type: "gift" })}><span aria-hidden="true">🎁</span><span><strong>A welcome parcel for you</strong><small>A few supplies to help you settle in. Open once.</small></span><span aria-hidden="true">↗</span></button>}
      </aside>
    </div>
    {panel === "guide" && <Dialog title="The sanctuary field guide" onClose={() => setPanel(null)}><p className={styles.dialogIntro}>Grow a little haven for six good friends. Once they arrive, they stay. Each has one gift for you per garden day.</p><div className={styles.guide}>{FRIEND_IDS.map(id => <article key={id}><span aria-hidden="true">{FRIENDS[id].icon}</span><div><h3>{FRIENDS[id].name} <small>{FRIENDS[id].species}</small></h3><p>{FRIENDS[id].hint}</p><p>{FRIENDS[id].coins} coins{FRIENDS[id].wood ? ` + ${FRIENDS[id].wood} wood` : ""} per daily gift.</p><span aria-label={`${state.companions[id].hearts} of 5 hearts`}>{state.companions[id].unlocked ? "♥".repeat(state.companions[id].hearts) + "♡".repeat(5 - state.companions[id].hearts) : "Not yet visiting"}</span></div></article>)}</div></Dialog>}
    {panel === "save" && <Dialog title="Your little acre, kept safe" onClose={() => { setPanel(null); setResetConfirm(false); setImported(null); setFileError(""); }}>
      <p className={styles.dialogIntro}>Your garden saves to your Mise account as you play. Growth pauses when you leave. Game supplies belong only to this garden.</p>
      <div className={styles.settingRow}><div><strong>Soft garden sounds</strong><p>Gentle notes when you tend the meadow.</p></div><button type="button" aria-pressed={!muted} onClick={() => { setMuted(!muted); try { localStorage.setItem(`${storageKey}:sound`, muted ? "on" : "off"); } catch {} }}>{muted ? "Sound off" : "Sound on"}</button></div>
      <div className={styles.settingRow}><div><strong>A copy to keep</strong><p>Download your garden as a backup.</p></div><button type="button" onClick={download}>Download save</button></div>
      <div className={styles.import}><label htmlFor="homestead-import"><strong>Bring a garden with you</strong><p>Import a JSON backup, including one copied from the original Willowbrook HTML. You’ll review it before replacing your garden.</p></label><input id="homestead-import" type="file" accept=".json,application/json" disabled={disabled} onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = ""; setImported(null); setFileError("");
        if (!file) return;
        if (file.size > 100_000) { setFileError("Choose a garden JSON file smaller than 100 KB."); return; }
        try { setImported(importHomestead(JSON.parse(await file.text()))); }
        catch { setFileError("This file isn’t a valid Willowbrook save. Your garden hasn’t changed."); }
      }} />{fileError && <p role="alert" className={styles.error}>{fileError}</p>}
      {imported && <div className={styles.confirm}><p>Day {imported.day} · {imported.gridSize} × {imported.gridSize} meadow · {imported.resources.coins} coins. Replace your current garden?</p><button type="button" onClick={download}>Back up current garden</button><button type="button" disabled={disabled} onClick={() => { commit(imported); setImported(null); setPanel(null); setMessage("Welcome back. Your garden has moved in safely."); }}>Use imported garden</button><button type="button" onClick={() => setImported(null)}>Cancel import</button></div>}</div>
      <div className={styles.settingRow}><div><strong>Start a fresh morning</strong><p>Replaces this account’s garden. Download a backup first if you want to keep it.</p></div><button type="button" disabled={disabled} onClick={() => setResetConfirm(true)}>Reset garden…</button></div>
      {resetConfirm && <div className={styles.confirm}><p>Start again from Day 1? Your current progress will be replaced.</p><button type="button" disabled={disabled} onClick={() => { commit(createHomestead()); setResetConfirm(false); setPanel(null); setMessage("A fresh morning, and a little room to grow."); }}>Yes, start fresh</button><button type="button" onClick={() => setResetConfirm(false)}>Keep my garden</button></div>}
    </Dialog>}
  </div>;
}
