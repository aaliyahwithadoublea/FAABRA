"use client";

import { Download } from "lucide-react";
import { Button, DataTable, PageHeader, RowCard } from "@/components/ui";
import { todayStr } from "@/lib/engine";
import { exportExcel } from "@/lib/files";
import { fmtDate, money } from "@/lib/format";
import { trialBalance } from "@/lib/reports";
import { toast, useDb } from "@/lib/store";

export default function TrialBalancePage() {
  const db = useDb();
  const asOf = todayStr();
  const tb = trialBalance(db, asOf);

  const download = async () => {
    try {
      await exportExcel(`faabra-trial-${asOf}.xlsx`, [
        {
          name: "Trial balance",
          title: [db.settings.businessName || "FAABRA GLOBAL TRADE", `Trial balance as at ${fmtDate(asOf)}`],
          columns: [
            { header: "Code", width: 10 },
            { header: "Account", width: 32 },
            { header: "Debit", money: true },
            { header: "Credit", money: true },
          ],
          rows: tb.rows.map((r) => [r.code, r.name, r.debit || null, r.credit || null]),
          totals: ["", "Total", tb.debit, tb.credit],
        },
      ]);
      toast.success("Excel file saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    }
  };

  return (
    <div>
      <PageHeader
        title="Trial balance"
        subtitle={`As at ${fmtDate(asOf)} · Debits ${money(tb.debit)} · Credits ${money(tb.credit)}`}
        actions={
          <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={() => void download()}>
            Excel
          </Button>
        }
      />
      <DataTable
        rows={tb.rows}
        rowKey={(r) => r.code}
        empty={<div className="px-6 py-12 text-center text-sm text-muted">No ledger balances yet.</div>}
        card={(r) => <RowCard title={r.name} amount={money(r.debit || r.credit)} meta={r.code} sub={r.debit ? "Debit" : "Credit"} />}
        columns={[
          { key: "code", header: "Code", cell: (r) => r.code },
          { key: "name", header: "Account", cell: (r) => r.name },
          { key: "debit", header: "Debit", align: "right", cell: (r) => (r.debit ? money(r.debit) : "") },
          { key: "credit", header: "Credit", align: "right", cell: (r) => (r.credit ? money(r.credit) : "") },
        ]}
        footer={["", "Total", money(tb.debit), money(tb.credit)]}
      />
    </div>
  );
}
