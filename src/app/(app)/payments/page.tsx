"use client";

import { Plus } from "lucide-react";
import { useMemo } from "react";
import { Button, DataTable, PageHeader, RangeBar, RowCard, StatusBadge, useRange } from "@/components/ui";
import { fmtDate, money } from "@/lib/format";
import { useLookups } from "@/lib/hooks";
import { useDb } from "@/lib/store";
import { openModal } from "@/lib/ui-store";

export default function PaymentsPage() {
  const db = useDb();
  const { suppliers, accounts } = useLookups();
  const [range, setRange] = useRange("month");
  const rows = useMemo(
    () =>
      [...db.supplierPayments]
        .filter((p) => (!range.from || p.date >= range.from) && (!range.to || p.date <= range.to))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [db.supplierPayments, range],
  );
  const posted = rows.filter((p) => p.status === "posted");

  return (
    <div>
      <PageHeader
        title="Supplier payments"
        subtitle={`${posted.length} payments · ${money(posted.reduce((s, p) => s + p.amount, 0))}`}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => openModal({ type: "supplierPayment" })}>
            Pay supplier
          </Button>
        }
      />
      <RangeBar value={range} onChange={setRange} className="mb-4" />
      <DataTable
        rows={rows}
        rowKey={(p) => p.id}
        dim={(p) => p.status === "reversed"}
        onRowClick={(p) => {
          if (p.status === "posted") openModal({ type: "reverse", docType: "supplierPayment", id: p.id, number: p.number, label: "Supplier payment" });
        }}
        empty={<div className="px-6 py-12 text-center text-sm text-muted">No supplier payments in this period.</div>}
        card={(p) => (
          <RowCard
            title={suppliers.get(p.supplierId)?.name ?? "Supplier"}
            amount={money(p.amount)}
            meta={`${p.number} · ${fmtDate(p.date)} · ${accounts.get(p.accountId)?.name ?? ""}`}
            badge={<StatusBadge status={p.status} />}
          />
        )}
        columns={[
          { key: "date", header: "Date", cell: (p) => fmtDate(p.date) },
          { key: "number", header: "Payment", cell: (p) => p.number },
          { key: "supplier", header: "Supplier", cell: (p) => suppliers.get(p.supplierId)?.name ?? "—" },
          { key: "account", header: "From", cell: (p) => accounts.get(p.accountId)?.name ?? "—" },
          { key: "amount", header: "Amount", align: "right", cell: (p) => money(p.amount) },
          { key: "status", header: "", cell: (p) => <StatusBadge status={p.status} /> },
        ]}
      />
    </div>
  );
}
