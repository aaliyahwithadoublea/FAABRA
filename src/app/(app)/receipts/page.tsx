"use client";

import { Plus } from "lucide-react";
import { useMemo } from "react";
import { Button, DataTable, PageHeader, RangeBar, RowCard, StatusBadge, useRange } from "@/components/ui";
import { fmtDate, money } from "@/lib/format";
import { useLookups } from "@/lib/hooks";
import { useDb } from "@/lib/store";
import { openModal } from "@/lib/ui-store";

export default function ReceiptsPage() {
  const db = useDb();
  const { customers, accounts } = useLookups();
  const [range, setRange] = useRange("month");
  const rows = useMemo(
    () =>
      [...db.receipts]
        .filter((r) => (!range.from || r.date >= range.from) && (!range.to || r.date <= range.to))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [db.receipts, range],
  );
  const posted = rows.filter((r) => r.status === "posted");

  return (
    <div>
      <PageHeader
        title="Customer payments"
        subtitle={`${posted.length} receipts · ${money(posted.reduce((s, r) => s + r.amount, 0))}`}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => openModal({ type: "receipt" })}>
            Receive payment
          </Button>
        }
      />
      <RangeBar value={range} onChange={setRange} className="mb-4" />
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        dim={(r) => r.status === "reversed"}
        onRowClick={(r) => {
          if (r.status === "posted") openModal({ type: "reverse", docType: "receipt", id: r.id, number: r.number, label: "Customer payment" });
        }}
        empty={<div className="px-6 py-12 text-center text-sm text-muted">No customer payments in this period.</div>}
        card={(r) => (
          <RowCard
            title={customers.get(r.customerId)?.name ?? "Customer"}
            amount={money(r.amount)}
            meta={`${r.number} · ${fmtDate(r.date)} · ${accounts.get(r.accountId)?.name ?? ""}`}
            badge={<StatusBadge status={r.status} />}
          />
        )}
        columns={[
          { key: "date", header: "Date", cell: (r) => fmtDate(r.date) },
          { key: "number", header: "Receipt", cell: (r) => r.number },
          { key: "customer", header: "Customer", cell: (r) => customers.get(r.customerId)?.name ?? "—" },
          { key: "account", header: "Into", cell: (r) => accounts.get(r.accountId)?.name ?? "—" },
          { key: "amount", header: "Amount", align: "right", cell: (r) => money(r.amount) },
          { key: "status", header: "", cell: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
    </div>
  );
}
