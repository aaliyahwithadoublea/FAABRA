"use client";

import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Card, Field, Input, PageHeader, SectionTitle, Textarea } from "@/components/ui";
import { updateSettings } from "@/lib/engine";
import { downloadBlob, imageToDataUrl } from "@/lib/files";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { cloudConfigured } from "@/lib/cloud";
import {
  backupFile,
  freshBooks,
  listSnapshots,
  parseBackup,
  readSnapshot,
  sampleBooks,
  toast,
  useAct,
  useCloudStatus,
  useDb,
  useStore,
  type SnapshotInfo,
} from "@/lib/store";

const CLOUD_LABEL = {
  off: "Not connected — add free Supabase keys in .env.local",
  connecting: "Connecting to cloud…",
  synced: "Synced to cloud",
  saving: "Saving to cloud…",
  offline: "Offline — will sync when you reconnect",
  error: "Cloud error",
} as const;

export default function SettingsPage() {
  const db = useDb();
  const act = useAct();
  const replace = useStore((s) => s.replace);
  const syncNow = useStore((s) => s.syncNow);
  const { status: cloudStatus, error: cloudError } = useCloudStatus();
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const [snapshots, setSnapshots] = useState<SnapshotInfo[] | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof typeof db.settings>(key: K, value: (typeof db.settings)[K]) => {
    act((d) => updateSettings(d, { [key]: value }));
  };

  const saveBackup = () => {
    const { name, blob } = backupFile(db);
    downloadBlob(blob, name);
    toast.success("Backup downloaded");
  };

  const restoreFile = async (file: File) => {
    setBusy(true);
    try {
      const next = await parseBackup(file);
      if (!window.confirm("Replace everything on this device with the backup? Current data will be overwritten.")) return;
      await replace(next, `Restored from backup file ${file.name}`);
      toast.success("Backup restored");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore");
    } finally {
      setBusy(false);
    }
  };

  const loadSnapshots = async () => {
    setSnapshots(await listSnapshots());
  };

  const restoreSnapshot = async (date: string) => {
    const snap = await readSnapshot(date);
    if (!snap) return toast.error("That snapshot is no longer available.");
    if (!window.confirm(`Restore the automatic copy from ${fmtDate(date)}? Current data on this device will be replaced.`)) return;
    await replace(snap, `Restored automatic copy from ${date}`);
    toast.success("Snapshot restored");
  };

  const loadSample = async () => {
    if (!window.confirm("Load sample trading data? This replaces the books currently on this device. Download a backup first if you need them.")) return;
    await replace(sampleBooks(db), "Loaded sample trading data");
    toast.success("Sample data loaded");
  };

  const reset = async () => {
    if (!window.confirm("Erase all transactions and start fresh? Your business details will be kept. Download a backup first if you need the current books.")) return;
    await replace(freshBooks(db), "Started fresh books");
    toast.success("Books cleared");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" subtitle="Business details, backups and data" />

      <div className="space-y-4">
        <Card className="space-y-4 p-4 sm:p-5">
          <SectionTitle>Business details</SectionTitle>
          <p className="text-sm text-muted">These appear on invoices and the home screen.</p>
          <Field label="Business name">
            <Input value={db.settings.businessName} onChange={(e) => set("businessName", e.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="RC / registration number" optional>
              <Input value={db.settings.rcNumber} onChange={(e) => set("rcNumber", e.target.value)} />
            </Field>
            <Field label="Phone" optional>
              <Input value={db.settings.phone} onChange={(e) => set("phone", e.target.value)} />
            </Field>
          </div>
          <Field label="Address" optional>
            <Input value={db.settings.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <Field label="Invoice footer" optional>
            <Textarea value={db.settings.invoiceFooter} onChange={(e) => set("invoiceFooter", e.target.value)} />
          </Field>
          <div>
            <p className="mb-1.5 text-[13px] font-medium">Logo</p>
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={db.settings.logo || "/logo.png"}
                alt=""
                className="size-14 rounded-xl border border-line object-cover"
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => logoRef.current?.click()}>
                  Upload logo
                </Button>
                {db.settings.logo && (
                  <Button size="sm" variant="ghost" onClick={() => set("logo", "")}>
                    Remove
                  </Button>
                )}
              </div>
              <input
                ref={logoRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  void imageToDataUrl(file)
                    .then((url) => {
                      set("logo", url);
                      toast.success("Logo updated");
                    })
                    .catch((err) => toast.error(err instanceof Error ? err.message : "Could not read image"));
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        </Card>

        <Card className="space-y-4 p-4 sm:p-5">
          <SectionTitle>Pay-by-transfer box</SectionTitle>
          <p className="text-sm text-muted">Shown on customer invoices so they know where to pay.</p>
          <Field label="Bank name">
            <Input value={db.settings.bankName} onChange={(e) => set("bankName", e.target.value)} placeholder="e.g. United Bank for Africa" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Account number">
              <Input value={db.settings.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
            </Field>
            <Field label="Account name">
              <Input value={db.settings.accountName} onChange={(e) => set("accountName", e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-4 p-4 sm:p-5">
          <SectionTitle>Cloud sync (free)</SectionTitle>
          <p className="text-sm text-muted">
            When Supabase is connected, every change is saved online automatically. Phone and computer stay in sync. The free plan is enough for this business.
          </p>
          <div className="rounded-xl border border-line bg-sunken/60 px-3.5 py-3">
            <p className="text-sm font-medium text-ink">{CLOUD_LABEL[cloudStatus]}</p>
            {cloudError && <p className="mt-1 text-xs text-danger">{cloudError}</p>}
            {!cloudConfigured() && (
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-[13px] text-muted">
                <li>
                  Create a free project at{" "}
                  <a className="font-medium text-brand-700 hover:underline" href="https://supabase.com" target="_blank" rel="noreferrer">
                    supabase.com
                  </a>
                </li>
                <li>
                  In SQL Editor, run the file <code className="text-ink">supabase/schema.sql</code>
                </li>
                <li>
                  Copy URL + anon key into <code className="text-ink">.env.local</code> (see <code className="text-ink">.env.example</code>)
                </li>
                <li>Restart the app</li>
              </ol>
            )}
          </div>
          {cloudConfigured() && (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || cloudStatus === "saving"}
              onClick={() => {
                setBusy(true);
                void syncNow()
                  .then(() => toast.success("Cloud sync complete"))
                  .catch((e) => toast.error(e instanceof Error ? e.message : "Sync failed"))
                  .finally(() => setBusy(false));
              }}
            >
              Sync now
            </Button>
          )}
        </Card>

        <Card className="space-y-4 p-4 sm:p-5">
          <SectionTitle>Backup & restore</SectionTitle>
          <p className="text-sm text-muted">
            Books are also kept on this device for offline use. A downloadable backup is still useful before clearing or loading sample data.
            {db.meta.createdAt ? ` Books opened ${fmtDateTime(db.meta.createdAt)}.` : ""}
            {db.meta.sample ? " Sample data is currently loaded." : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button icon={<Download className="size-4" />} onClick={saveBackup}>
              Download backup
            </Button>
            <Button variant="secondary" icon={<Upload className="size-4" />} disabled={busy} onClick={() => fileRef.current?.click()}>
              Restore backup
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void restoreFile(file);
                e.target.value = "";
              }}
            />
          </div>
          <div className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Automatic copies on this device</p>
              <Button size="sm" variant="ghost" onClick={() => void loadSnapshots()}>
                {snapshots ? "Refresh" : "Show"}
              </Button>
            </div>
            {snapshots && (
              <ul className="mt-2 divide-y divide-line">
                {!snapshots.length && <li className="py-2 text-sm text-muted">No automatic copies yet.</li>}
                {snapshots.map((s) => (
                  <li key={s.date} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span>
                      {fmtDate(s.date)} · {s.entries} journal entries
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => void restoreSnapshot(s.date)}>
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="space-y-4 p-4 sm:p-5">
          <SectionTitle>Sample data & reset</SectionTitle>
          <p className="text-sm text-muted">
            Sample data fills the app with about a month of invented trading so you can explore every screen. It is not your real business.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void loadSample()}>
              Load sample data
            </Button>
            <Button variant="danger" onClick={() => void reset()}>
              Start fresh
            </Button>
          </div>
        </Card>

        <Card className="space-y-2 p-4 sm:p-5">
          <SectionTitle>About</SectionTitle>
          <p className="text-sm text-muted">
            FAABRA GLOBAL TRADE business management. One app for phone and computer, double-entry books, weighted-average stock,
            debtors, creditors, cash, bank, expenses and profitability. Built with Next.js and TypeScript.
          </p>
          <p className="text-xs text-faint">Journal entries: {db.journal.length} · Products: {db.products.length}</p>
        </Card>
      </div>
    </div>
  );
}
