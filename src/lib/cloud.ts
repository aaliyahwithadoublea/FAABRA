"use client";

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import { DB_KEYS, type Database } from "./types";
import { DB_VERSION } from "./engine";
import { AppError } from "./ledger";

const BOOKS_ID = "faabra";

export type CloudStatus = "off" | "connecting" | "synced" | "saving" | "offline" | "error";

export function cloudConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!cloudConfigured()) return null;
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

/** Stable id for this browser/install, used to ignore our own realtime echoes. */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  const key = "faabra-device-id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function isDatabaseShape(value: unknown): value is Database {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  for (const key of DB_KEYS) {
    if (!(key in obj)) return false;
  }
  return true;
}

export interface CloudRow {
  data: Database;
  updatedAt: string;
  deviceId: string | null;
}

/** Latest books from Supabase, or null if the row does not exist yet. */
export async function pullCloud(): Promise<CloudRow | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from("books").select("data, updated_at, device_id").eq("id", BOOKS_ID).maybeSingle();
  if (error) throw new AppError(`Cloud load failed: ${error.message}`);
  if (!data) return null;
  if (!isDatabaseShape(data.data)) throw new AppError("Cloud data looks damaged. Restore a backup in Settings.");
  const books = data.data;
  if ((books.version ?? 0) > DB_VERSION) {
    throw new AppError("Cloud books were saved by a newer app version. Update the app first.");
  }
  return {
    data: books,
    updatedAt: data.updated_at as string,
    deviceId: (data.device_id as string | null) ?? null,
  };
}

/** Upsert the full books document. */
export async function pushCloud(db: Database): Promise<string> {
  const sb = getSupabase();
  if (!sb) throw new AppError("Cloud is not configured.");
  const updatedAt = new Date().toISOString();
  const { error } = await sb.from("books").upsert(
    {
      id: BOOKS_ID,
      data: db,
      updated_at: updatedAt,
      device_id: getDeviceId(),
    },
    { onConflict: "id" },
  );
  if (error) throw new AppError(`Cloud save failed: ${error.message}`);
  return updatedAt;
}

export function subscribeCloud(onChange: (row: CloudRow) => void): () => void {
  const sb = getSupabase();
  if (!sb) return () => undefined;
  let channel: RealtimeChannel | null = sb
    .channel("faabra-books")
    .on("postgres_changes", { event: "*", schema: "public", table: "books", filter: `id=eq.${BOOKS_ID}` }, (payload) => {
      const row = (payload.new ?? payload.old) as { data?: unknown; updated_at?: string; device_id?: string | null } | null;
      if (!row?.data || !isDatabaseShape(row.data)) return;
      onChange({
        data: row.data,
        updatedAt: row.updated_at ?? new Date().toISOString(),
        deviceId: row.device_id ?? null,
      });
    })
    .subscribe();

  return () => {
    if (channel) {
      void sb.removeChannel(channel);
      channel = null;
    }
  };
}
