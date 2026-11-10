"use client";

import { Plus } from "lucide-react";
import { useMemo } from "react";
import { Badge, Button, DataTable, PageHeader, RangeBar, RowCard, StatusBadge, useRange } from "@/components/ui";
import { fmtDate, money } from "@/lib/format";
import { useLookups } from "@/lib/hooks";
import { balanceSheet } from "@/lib/reports";
import { useDb } from "@/lib/store";
import { openModal } from "@/lib/ui-store";

export default function CapitalPage() {
  const db = useDb();
  const { accounts } = useLookups();
  const [range, setRange] = useRange("year");
  const bs = balanceSheet(db);
  const rows = useMemo(
    () =>
      [...db.capitalEntries]
        .filter((e) => (!range.from || e.date >= range.from) && (!range.to || e.date <= range.to))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [db.capitalEntries, range],
  );

  return (
    <div>
      <PageHeader
        title="Capital & drawings"
        subtitle="Owner's money kept separate from sales and expenses"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => openModal({ type: "capital" })}>
            Record entry
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <p className="text-[13px] text-muted">Opening capital</p>
          <p className="num mt-1 text-xl font-semibold">{money(bs.openingCapital)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <p className="text-[13px] text-muted">Capital introduced</p>
          <p className="num mt-1 text-xl font-semibold">{money(bs.capitalIntroduced)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <p className="text-[13px] text-muted">Drawings</p>
          <p className="num mt-1 text-xl font-semibold">{money(bs.drawings)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
          <p className="text-[13px] text-muted">Owner&apos;s equity</p>
          <p className="num mt-1 text-xl font-semibold">{money(bs.totalEquity)}</p>
        </div>
      </div>
      <RangeBar value={range} onChange={setRange} className="mb-4" />
      <DataTable
        rows={rows}
        rowKey={(e) => e.id}
        dim={(e) => e.status === "reversed"}
        onRowClick={(e) => {
          if (e.status === "posted") openModal({ type: "reverse", docType: "capital", id: e.id, number: e.number, label: e.type === "capital" ? "Capital introduced" : "Owner's drawing" });
        }}
        empty={<div className="px-6 py-12 text-center text-sm text-muted">No capital or drawings recorded yet.</div>}
        card={(e) => (
          <RowCard
            title={e.type === "capital" ? "Capital introduced" : "Owner's drawing"}
            amount={money(e.amount)}
            meta={`${e.number} · ${fmtDate(e.date)} · ${accounts.get(e.accountId)?.name ?? ""}`}
            badge={<StatusBadge status={e.status} />}
          />
        )}
        columns={[
          { key: "date", header: "Date", cell: (e) => fmtDate(e.date) },
          { key: "number", header: "Ref", cell: (e) => e.number },
          {
            key: "type",
            header: "Type",
            cell: (e) => <Badge tone={e.type === "capital" ? "brand" : "yolk"}>{e.type === "capital" ? "Capital in" : "Drawing out"}</Badge>,
          },
          { key: "account", header: "Account", cell: (e) => accounts.get(e.accountId)?.name ?? "—" },
          { key: "remarks", header: "Remarks", cell: (e) => e.remarks || "—" },
          { key: "amount", header: "Amount", align: "right", cell: (e) => money(e.amount) },
          { key: "status", header: "", cell: (e) => <StatusBadge status={e.status} /> },
        ]}
      />
    </div>
  );
}
