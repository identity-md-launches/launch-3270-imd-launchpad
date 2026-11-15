import { useCallback, useEffect, useState } from "react";

const KEY = "imd-launchpad:";
const bus = new EventTarget();

export function readLocal<T>(k: string, fallback: T): T {
  try { const v = localStorage.getItem(KEY + k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
export function writeLocal<T>(k: string, v: T) {
  try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch { /* storage full or blocked */ }
  bus.dispatchEvent(new Event(k));
}

/** State kept in this browser and shared between components. */
export function useLocal<T>(k: string, fallback: T): [T, (v: T | ((p: T) => T)) => void] {
  const [v, setV] = useState<T>(() => readLocal(k, fallback));
  useEffect(() => { const on = () => setV(readLocal(k, fallback)); bus.addEventListener(k, on); return () => bus.removeEventListener(k, on); }, [k]); // eslint-disable-line
  const set = useCallback((n: T | ((p: T) => T)) => { const next = typeof n === "function" ? (n as (p: T) => T)(readLocal(k, fallback)) : n; writeLocal(k, next); }, [k]); // eslint-disable-line
  return [v, set];
}

export type Launched = { mint: string; name: string; symbol: string; image: string; cluster: "devnet" | "mainnet"; creator: string; at: number; signatures: string[] };
export type Trade = { mint: string; symbol: string; side: "buy" | "sell"; amount: string; sig: string; cluster: "devnet" | "mainnet"; at: number };
export type Note = { id: string; text: string; at: number; href?: string; read?: boolean };
export type Comment = { id: string; mint: string; author: string; text: string; at: number };
export type SwarmOrder = { tx: string; jobId?: string; kind: string; objective: string; at: number; state?: string; fp?: string; payer?: string };
/** A payment the wallet has sent but the chain hasn't confirmed yet. Kept so a reload resumes it instead of paying again. */
export type PendingPayment = { tx: `0x${string}`; fp: string; kind: string; objective: string; at: number; payer: string };

export function notify(text: string, href?: string) {
  const list = readLocal<Note[]>("notes", []);
  writeLocal("notes", [{ id: crypto.randomUUID(), text, at: Date.now(), href }, ...list].slice(0, 50));
  try { if ("Notification" in window && Notification.permission === "granted" && document.hidden) new Notification("IMD Launchpad", { body: text }); } catch { /* not supported */ }
}
