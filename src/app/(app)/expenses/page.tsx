"use client";

import { Plus } from "lucide-react";
import { useMemo } from "react";
import { Button, DataTable, PageHeader, RangeBar, RowCard, StatusBadge, useRange } from "@/components/ui";
import { CHART } from "@/lib/chart";
import { fmtDate, money } from "@/lib/format";
import { useLookups } from "@/lib/hooks";
import { useDb } from "@/lib/store";
import { openModal } from "@/lib/ui-store";

export default function ExpensesPage() {
  const db = useDb();
  const { accounts } = useLookups();
  const [range, setRange] = useRange("month");
  const rows = useMemo(
    () =>
      [...db.expenses]
        .filter((e) => (!range.from || e.date >= range.from) && (!range.to || e.date <= range.to))
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [db.expenses, range],
  );
  const posted = rows.filter((e) => e.status === "posted");
  const total = posted.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle={`${posted.length} entries · ${money(total)}`}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => openModal({ type: "expense" })}>
            Record expense
          </Button>
        }
      />
      <RangeBar value={range} onChange={setRange} className="mb-4" />
      <DataTable
        rows={rows}
        rowKey={(e) => e.id}
        dim={(e) => e.status === "reversed"}
        onRowClick={(e) => {
          if (e.status === "posted") openModal({ type: "reverse", docType: "expense", id: e.id, number: e.number, label: CHART[e.category].name });
        }}
        empty={<div className="px-6 py-12 text-center text-sm text-muted">No expenses in this period.</div>}
        card={(e) => (
          <RowCard
            title={e.description}
            amount={money(e.amount)}
            meta={`${CHART[e.category].name} · ${fmtDate(e.date)}`}
            badge={<StatusBadge status={e.status} />}
          />
        )}
        columns={[
          { key: "date", header: "Date", cell: (e) => fmtDate(e.date) },
          { key: "number", header: "Ref", cell: (e) => e.number },
          { key: "cat", header: "Category", cell: (e) => CHART[e.category].name },
          { key: "desc", header: "Description", cell: (e) => e.description },
          { key: "account", header: "Paid from", cell: (e) => accounts.get(e.accountId)?.name ?? "—" },
          { key: "amount", header: "Amount", align: "right", cell: (e) => money(e.amount) },
          { key: "status", header: "", cell: (e) => <StatusBadge status={e.status} /> },
        ]}
        footer={["Total", "", "", "", "", money(total), ""]}
      />
      <p className="mt-3 text-xs text-muted">Tap a posted expense to reverse it. Personal withdrawals belong under Capital & drawings, not here.</p>
    </div>
  );
}
