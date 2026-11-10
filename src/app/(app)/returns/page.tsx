"use client";

import { Plus } from "lucide-react";
import { useMemo } from "react";
import { Button, DataTable, PageHeader, RangeBar, RowCard, StatusBadge, useRange } from "@/components/ui";
import { STOCK_EVENT_LABELS } from "@/lib/chart";
import { productLabel } from "@/lib/engine";
import { fmtDate, money, units } from "@/lib/format";
import { useLookups } from "@/lib/hooks";
import { useDb } from "@/lib/store";
import { openModal } from "@/lib/ui-store";

export default function ReturnsPage() {
  const db = useDb();
  const { products, customers, suppliers } = useLookups();
  const [range, setRange] = useRange("month");
  const rows = useMemo(
    () =>
      [...db.stockEvents]
        .filter((e) => (!range.from || e.date >= range.from) && (!range.to || e.date <= range.to))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [db.stockEvents, range],
  );

  return (
    <div>
      <PageHeader
        title="Returns & damages"
        subtitle="Customer returns, supplier returns, breakages, consumption and stock counts"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => openModal({ type: "stockEvent" })}>
            New entry
          </Button>
        }
      />
      <RangeBar value={range} onChange={setRange} className="mb-4" />
      <DataTable
        rows={rows}
        rowKey={(e) => e.id}
        dim={(e) => e.status === "reversed"}
        onRowClick={(e) => {
          if (e.status === "posted") openModal({ type: "reverse", docType: "stockEvent", id: e.id, number: e.number, label: STOCK_EVENT_LABELS[e.type] });
        }}
        empty={<div className="px-6 py-12 text-center text-sm text-muted">No stock events in this period.</div>}
        card={(e) => {
          const p = products.get(e.productId);
          return (
            <RowCard
              title={STOCK_EVENT_LABELS[e.type]}
              amount={p ? units(e.qty, p.unit) : String(e.qty)}
              meta={`${e.number} · ${fmtDate(e.date)} · ${p ? productLabel(p) : ""}`}
              badge={<StatusBadge status={e.status} />}
              sub={e.reason || (e.value ? money(e.value) : undefined)}
            />
          );
        }}
        columns={[
          { key: "date", header: "Date", cell: (e) => fmtDate(e.date) },
          { key: "number", header: "Ref", cell: (e) => e.number },
          { key: "type", header: "Type", cell: (e) => STOCK_EVENT_LABELS[e.type] },
          {
            key: "product",
            header: "Product",
            cell: (e) => {
              const p = products.get(e.productId);
              return p ? productLabel(p) : "—";
            },
          },
          {
            key: "qty",
            header: "Qty",
            align: "right",
            cell: (e) => {
              const p = products.get(e.productId);
              return p ? units(e.qty, p.unit) : String(e.qty);
            },
          },
          {
            key: "party",
            header: "Party",
            cell: (e) =>
              e.customerId ? customers.get(e.customerId)?.name ?? "—" : e.supplierId ? suppliers.get(e.supplierId)?.name ?? "—" : "—",
          },
          { key: "value", header: "Value", align: "right", cell: (e) => money(e.value) },
          { key: "status", header: "", cell: (e) => <StatusBadge status={e.status} /> },
        ]}
      />
    </div>
  );
}
