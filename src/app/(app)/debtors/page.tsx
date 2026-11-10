"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Button, Card, DataTable, PageHeader, RowCard, Stat } from "@/components/ui";
import { todayStr } from "@/lib/engine";
import { money } from "@/lib/format";
import { useCustomerBalances } from "@/lib/hooks";
import { ageing } from "@/lib/reports";
import { useDb } from "@/lib/store";
import { openModal } from "@/lib/ui-store";

export default function DebtorsPage() {
  const db = useDb();
  const balances = useCustomerBalances();
  const asOf = todayStr();
  const rows = useMemo(() => ageing(db, "1200", asOf), [db, asOf]);
  const total = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div>
      <PageHeader title="Debtors" subtitle={`What customers owe you as at ${asOf}`} />
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
        href={(r) => `/debtors/view?id=${r.partyId}`}
        empty={<div className="px-6 py-12 text-center text-sm text-muted">No outstanding customer balances.</div>}
        card={(r) => {
          const c = db.customers.find((x) => x.id === r.partyId);
          return (
            <RowCard
              title={c?.name ?? "Customer"}
              amount={money(r.total)}
              meta={c?.phone || c?.code}
              sub={`0–30: ${money(r.current)} · 31–60: ${money(r.d31)} · 61–90: ${money(r.d61)} · 90+: ${money(r.d90)}`}
            />
          );
        }}
        columns={[
          { key: "name", header: "Customer", cell: (r) => db.customers.find((c) => c.id === r.partyId)?.name ?? "—" },
          { key: "current", header: "0–30", align: "right", cell: (r) => money(r.current) },
          { key: "d31", header: "31–60", align: "right", cell: (r) => money(r.d31) },
          { key: "d61", header: "61–90", align: "right", cell: (r) => money(r.d61) },
          { key: "d90", header: "90+", align: "right", cell: (r) => money(r.d90) },
          { key: "total", header: "Total", align: "right", cell: (r) => <span className="font-semibold">{money(r.total)}</span> },
        ]}
        footer={["Total", money(rows.reduce((s, r) => s + r.current, 0)), money(rows.reduce((s, r) => s + r.d31, 0)), money(rows.reduce((s, r) => s + r.d61, 0)), money(rows.reduce((s, r) => s + r.d90, 0)), money(total)]}
      />
      <Card className="mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted">Payments reduce the oldest debts first.</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => openModal({ type: "receipt" })}>
            Receive payment
          </Button>
          <Link href="/customers" className="text-[13px] font-medium text-brand-700 hover:underline">
            Manage customers
          </Link>
        </div>
      </Card>
      <span className="hidden">{Object.keys(balances).length}</span>
    </div>
  );
}
