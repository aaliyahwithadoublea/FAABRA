"use client";

import { createStore, delMany, get as idbGet, getMany, keys as idbKeys, set as idbSet, setMany, type UseStore } from "idb-keyval";
import { useCallback } from "react";
import { create } from "zustand";
import {
  cloudConfigured,
  getDeviceId,
  pullCloud,
  pushCloud,
  subscribeCloud,
  type CloudStatus,
} from "./cloud";
import { DB_VERSION, apply, createEmptyDb, nowIso, todayStr, uid } from "./engine";
import { AppError } from "./ledger";
import { buildSampleDb } from "./sample";
import { DB_KEYS, type Database } from "./types";

/** Placeholder shown to no one: screens only render once the real books have loaded. */
const BLANK: Database = {
  version: DB_VERSION,
  meta: { createdAt: "", sample: false, lastBackupAt: null, updatedAt: "" },
  settings: {
    businessName: "FAABRA GLOBAL TRADE",
    tagline: "",
    rcNumber: "",
    phone: "",
    address: "",
    bankName: "",
    accountNumber: "",
    accountName: "",
    invoiceFooter: "",
    logo: "",
  },
  products: [],
  customers: [],
  suppliers: [],
  accounts: [],
  sales: [],
  purchases: [],
  receipts: [],
  supplierPayments: [],
  expenses: [],
  transfers: [],
  stockEvents: [],
  capitalEntries: [],
  adjustments: [],
  journal: [],
  movements: [],
  audit: [],
  counters: {},
  stock: {},
  reconciled: {},
};

function touch(db: Database): Database {
  return {
    ...db,
    meta: {
      ...db.meta,
      updatedAt: db.meta.updatedAt || db.meta.createdAt || nowIso(),
    },
  };
}

function stamp(db: Database): Database {
  return {
    ...db,
    meta: {
      ...db.meta,
      updatedAt: nowIso(),
    },
  };
}

/* ------------------------- IndexedDB persistence ------------------------- */

let books: UseStore | undefined;
let snapshots: UseStore | undefined;
const booksStore = () => (books ??= createStore("faabra-books", "data"));
const snapshotStore = () => (snapshots ??= createStore("faabra-snapshots", "daily"));

async function readBooks(): Promise<Database | null> {
  const values = await getMany<unknown>([...DB_KEYS], booksStore());
  if (values[DB_KEYS.indexOf("settings")] === undefined) return null;
  const db: Record<string, unknown> = { ...BLANK };
  DB_KEYS.forEach((key, i) => {
    if (values[i] !== undefined) db[key] = values[i];
  });
  return touch(db as unknown as Database);
}

function writeBooks(next: Database, prev?: Database): Promise<void> {
  const entries: [string, unknown][] = [];
  for (const key of DB_KEYS) {
    if (!prev || prev[key] !== next[key]) entries.push([key, next[key]]);
  }
  return entries.length ? setMany(entries, booksStore()) : Promise.resolve();
}

export interface SnapshotInfo {
  date: string;
  entries: number;
}

const SNAPSHOTS_KEPT = 7;

async function takeDailySnapshot(db: Database) {
  if (!db.journal.length) return;
  const today = todayStr();
  const existing = (await idbKeys<string>(snapshotStore())).sort();
  if (existing.includes(today)) return;
  await idbSet(today, db, snapshotStore());
  const stale = [...existing, today].sort().slice(0, -SNAPSHOTS_KEPT);
  if (stale.length) await delMany(stale, snapshotStore());
}

export async function listSnapshots(): Promise<SnapshotInfo[]> {
  const dates = (await idbKeys<string>(snapshotStore())).sort().reverse();
  const out: SnapshotInfo[] = [];
  for (const date of dates) {
    const db = await idbGet<Database>(date, snapshotStore());
    if (db) out.push({ date, entries: db.journal.length });
  }
  return out;
}

export function readSnapshot(date: string): Promise<Database | undefined> {
  return idbGet<Database>(date, snapshotStore());
}

/* ------------------------------ Cloud sync ------------------------------- */

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let unsubCloud: (() => void) | null = null;
let lastPushedAt = "";
let syncingIn = false;

function newer(a: string, b: string): boolean {
  return (Date.parse(a) || 0) > (Date.parse(b) || 0);
}

async function flushCloud(db: Database) {
  if (!cloudConfigured() || !navigator.onLine) {
    useStore.setState({ cloudStatus: cloudConfigured() ? "offline" : "off" });
    return;
  }
  useStore.setState({ cloudStatus: "saving", cloudError: null });
  try {
    const updatedAt = await pushCloud(db);
    lastPushedAt = updatedAt;
    useStore.setState({ cloudStatus: "synced", cloudError: null });
  } catch (error) {
    useStore.setState({
      cloudStatus: navigator.onLine ? "error" : "offline",
      cloudError: describe(error),
    });
  }
}

function scheduleCloudPush(db: Database) {
  if (!cloudConfigured()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void flushCloud(db);
  }, 700);
}

async function adoptCloud(remote: Database, note: string) {
  syncingIn = true;
  const next = touch({
    ...BLANK,
    ...remote,
    version: DB_VERSION,
  });
  await writeBooks(next);
  useStore.setState({ db: next, cloudStatus: "synced", cloudError: null });
  channel?.postMessage("changed");
  useToasts.getState().push("info", note);
  syncingIn = false;
}

/* --------------------------------- Store --------------------------------- */

interface State {
  db: Database;
  ready: boolean;
  loadError: string | null;
  saveError: string | null;
  cloudStatus: CloudStatus;
  cloudError: string | null;
  init: () => Promise<void>;
  run: <T>(fn: (draft: Database) => T) => T;
  replace: (db: Database, note: string) => Promise<void>;
  /** Push the current books to the cloud immediately. */
  syncNow: () => Promise<void>;
}

let started = false;
let channel: BroadcastChannel | undefined;

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const useStore = create<State>((set, get) => ({
  db: BLANK,
  ready: false,
  loadError: null,
  saveError: null,
  cloudStatus: cloudConfigured() ? "connecting" : "off",
  cloudError: null,

  init: async () => {
    if (started) return;
    started = true;
    try {
      let local = await readBooks();
      if (!local) {
        local = createEmptyDb();
        await writeBooks(local);
      }

      if (cloudConfigured() && navigator.onLine) {
        set({ cloudStatus: "connecting" });
        try {
          const remote = await pullCloud();
          if (remote) {
            const localAt = local.meta.updatedAt || local.meta.createdAt;
            const remoteAt = remote.data.meta?.updatedAt || remote.updatedAt;
            if (!local.journal.length && !local.sales.length && remote.data.journal.length) {
              local = touch(remote.data);
              await writeBooks(local);
            } else if (newer(remoteAt, localAt)) {
              local = touch(remote.data);
              await writeBooks(local);
            } else if (newer(localAt, remoteAt) || (!remote.data.journal.length && local.journal.length)) {
              // Local is ahead — push after UI is ready.
              lastPushedAt = "";
              setTimeout(() => void flushCloud(local!), 300);
            } else {
              lastPushedAt = remote.updatedAt;
            }
            set({ cloudStatus: "synced" });
          } else {
            // First cloud save for this project.
            setTimeout(() => void flushCloud(local!), 300);
          }
        } catch (error) {
          set({ cloudStatus: "error", cloudError: describe(error) });
        }
      } else if (cloudConfigured()) {
        set({ cloudStatus: "offline" });
      }

      set({ db: local, ready: true });

      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel("faabra-books");
        channel.onmessage = () => {
          void readBooks().then((fresh) => fresh && set({ db: fresh }));
        };
      }

      if (cloudConfigured()) {
        unsubCloud?.();
        unsubCloud = subscribeCloud((row) => {
          if (row.deviceId && row.deviceId === getDeviceId()) return;
          if (row.updatedAt && row.updatedAt === lastPushedAt) return;
          const current = get().db;
          const localAt = current.meta.updatedAt || current.meta.createdAt;
          const remoteAt = row.data.meta?.updatedAt || row.updatedAt;
          if (!newer(remoteAt, localAt)) return;
          void adoptCloud(row.data, "Books updated from another device");
        });

        window.addEventListener("online", () => {
          set({ cloudStatus: "connecting" });
          void flushCloud(get().db);
        });
        window.addEventListener("offline", () => {
          set({ cloudStatus: "offline" });
        });
      }

      void navigator.storage?.persist?.().catch(() => undefined);
      void takeDailySnapshot(local).catch(() => undefined);
    } catch (error) {
      started = false;
      set({ loadError: describe(error) });
    }
  },

  run: (fn) => {
    const prev = get().db;
    const [drafted, result] = apply(prev, fn);
    if (drafted === prev) return result;
    const next = stamp(drafted);
    set({ db: next });
    writeBooks(next, prev)
      .then(() => {
        channel?.postMessage("changed");
        if (get().saveError) set({ saveError: null });
        if (!syncingIn) scheduleCloudPush(next);
      })
      .catch((error) => set({ saveError: describe(error) }));
    return result;
  },

  replace: async (incoming, note) => {
    const db = stamp({
      ...BLANK,
      ...incoming,
      version: DB_VERSION,
      audit: [...incoming.audit, { id: uid(), at: nowIso(), action: "restore", entity: "Books", ref: "System", summary: note }],
    });
    await writeBooks(db);
    set({ db, saveError: null });
    channel?.postMessage("changed");
    scheduleCloudPush(db);
  },

  syncNow: async () => {
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    await flushCloud(get().db);
  },
}));

export function useDb(): Database {
  return useStore((s) => s.db);
}

export function useCloudStatus(): { status: CloudStatus; error: string | null; configured: boolean } {
  const status = useStore((s) => s.cloudStatus);
  const error = useStore((s) => s.cloudError);
  return { status, error, configured: cloudConfigured() };
}

/* ----------------------------- Toast messages ---------------------------- */

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (kind: Toast["kind"], message: string) => void;
  dismiss: (id: number) => void;
}

let toastId = 0;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (kind, message) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, kind, message }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === "error" ? 7000 : 3500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (message: string) => useToasts.getState().push("success", message),
  error: (message: string) => useToasts.getState().push("error", message),
  info: (message: string) => useToasts.getState().push("info", message),
};

export function useAct() {
  const run = useStore((s) => s.run);
  return useCallback(
    <T,>(fn: (draft: Database) => T, success?: string): T | undefined => {
      try {
        const result = run(fn);
        if (success) toast.success(success);
        return result;
      } catch (error) {
        if (error instanceof AppError) {
          toast.error(error.message);
          return undefined;
        }
        throw error;
      }
    },
    [run],
  );
}

/* ------------------------- Backup, restore, reset ------------------------ */

const BACKUP_TAG = "faabra-books-backup";

export function backupFile(db: Database): { name: string; blob: Blob } {
  const payload = { tag: BACKUP_TAG, version: DB_VERSION, exportedAt: nowIso(), db };
  return {
    name: `faabra-backup-${todayStr()}.json`,
    blob: new Blob([JSON.stringify(payload)], { type: "application/json" }),
  };
}

export async function parseBackup(file: File): Promise<Database> {
  let payload: { tag?: string; version?: number; db?: Record<string, unknown> };
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new AppError("That file could not be read. Choose a backup file saved from this app.");
  }
  if (payload?.tag !== BACKUP_TAG || !payload.db) {
    throw new AppError("That file is not a FAABRA backup.");
  }
  if ((payload.version ?? 0) > DB_VERSION) {
    throw new AppError("That backup was made by a newer version of the app. Update the app first.");
  }
  const db = payload.db;
  for (const key of DB_KEYS) {
    const expected = BLANK[key];
    const actual = db[key];
    const ok = Array.isArray(expected)
      ? Array.isArray(actual)
      : typeof expected === "object"
        ? typeof actual === "object" && actual !== null && !Array.isArray(actual)
        : typeof actual === typeof expected;
    if (!ok) throw new AppError(`The backup file is incomplete (the "${key}" section is missing or damaged).`);
  }
  return touch(db as unknown as Database);
}

export function freshBooks(current: Database): Database {
  const db = createEmptyDb();
  db.settings = { ...current.settings };
  return db;
}

export function sampleBooks(current: Database): Database {
  const db = buildSampleDb();
  db.settings = { ...current.settings };
  return db;
}
