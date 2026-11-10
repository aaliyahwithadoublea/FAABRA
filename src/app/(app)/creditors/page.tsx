"use client";

import { useMemo } from "react";
import { Button, DataTable, PageHeader, RowCard, Stat } from "@/components/ui";
import { todayStr } from "@/lib/engine";
import { money } from "@/lib/format";
import { ageing } from "@/lib/reports";
import { useDb } from "@/lib/store";
import { openModal } from "@/lib/ui-store";

export default function CreditorsPage() {
  const db = useDb();
  const asOf = todayStr();
  const rows = useMemo(() => ageing(db, "2000", asOf), [db, asOf]);
  const total = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div>
      <PageHeader
        title="Creditors"
        subtitle={`What you owe suppliers as at ${asOf}`}
        actions={
          <Button size="sm" onClick={() => openModal({ type: "supplierPayment" })}>
            Pay supplier
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Total owed" value={money(total)} />
        <Stat label="0–30 days" value={money(rows.reduce((s, r) => s + r.current, 0))} />
        <Stat label="31–60 days" value={money(rows.reduce((s, r) => s + r.d31, 0))} />
        <Stat label="61–90 days" value={money(rows.reduce((s, r) => s + r.d61, 0))} />
        <Stat label="Over 90 days" value={money(rows.reduce((s, r) => s + r.d90, 0))} tone="yolk" />
      </div>
      <DataTable
        rows={rows}
        rowKey={(r) => r.partyId}
        href={(r) => `/creditors/view?id=${r.partyId}`}
        empty={<div className="px-6 py-12 text-center text-sm text-muted">You do not owe any supplier right now.</div>}
        card={(r) => {
          const s = db.suppliers.find((x) => x.id === r.partyId);
          return <RowCard title={s?.name ?? "Supplier"} amount={money(r.total)} meta={s?.phone || s?.code} />;
        }}
        columns={[
          { key: "name", header: "Supplier", cell: (r) => db.suppliers.find((s) => s.id === r.partyId)?.name ?? "—" },
          { key: "current", header: "0–30", align: "right", cell: (r) => money(r.current) },
          { key: "d31", header: "31–60", align: "right", cell: (r) => money(r.d31) },
          { key: "d61", header: "61–90", align: "right", cell: (r) => money(r.d61) },
          { key: "d90", header: "90+", align: "right", cell: (r) => money(r.d90) },
          { key: "total", header: "Total", align: "right", cell: (r) => <span className="font-semibold">{money(r.total)}</span> },
        ]}
        footer={["Total", money(rows.reduce((s, r) => s + r.current, 0)), money(rows.reduce((s, r) => s + r.d31, 0)), money(rows.reduce((s, r) => s + r.d61, 0)), money(rows.reduce((s, r) => s + r.d90, 0)), money(total)]}
      />
    </div>
  );
}
