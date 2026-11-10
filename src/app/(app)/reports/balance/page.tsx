"use client";

import { Download } from "lucide-react";
import { Button, Card, Line, PageHeader } from "@/components/ui";
import { todayStr } from "@/lib/engine";
import { exportExcel } from "@/lib/files";
import { fmtDate, money } from "@/lib/format";
import { balanceSheet } from "@/lib/reports";
import { toast, useDb } from "@/lib/store";

export default function BalanceSheetPage() {
  const db = useDb();
  const asOf = todayStr();
  const bs = balanceSheet(db, asOf);

  const download = async () => {
    try {
      await exportExcel(`faabra-balance-${asOf}.xlsx`, [
        {
          name: "Balance sheet",
          title: [db.settings.businessName || "FAABRA GLOBAL TRADE", `Balance sheet as at ${fmtDate(asOf)}`],
          columns: [
            { header: "Item", width: 36 },
            { header: "Amount", money: true },
          ],
          rows: [
            ["Cash", bs.cash],
            ["Bank", bs.bank],
            ["Debtors", bs.debtors],
            ["Stock", bs.stock],
            ["Total assets", bs.totalAssets],
            ["Creditors", bs.creditors],
            ["Opening capital", bs.openingCapital],
            ["Capital introduced", bs.capitalIntroduced],
            ["Drawings", -bs.drawings],
            ["Retained profit", bs.retainedProfit],
            ["Total equity", bs.totalEquity],
          ],
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
        title="Balance sheet"
        subtitle={`As at ${fmtDate(asOf)}`}
        actions={
          <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={() => void download()}>
            Excel
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Assets</h2>
          <Line label="Cash" value={money(bs.cash)} muted />
          <Line label="Bank" value={money(bs.bank)} muted />
          <Line label="Debtors (customers)" value={money(bs.debtors)} muted />
          <Line label="Stock" value={money(bs.stock)} muted />
          <div className="my-2 border-t border-line" />
          <Line label="Total assets" value={money(bs.totalAssets)} strong />
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-semibold">Liabilities & equity</h2>
          <Line label="Creditors (suppliers)" value={money(bs.creditors)} muted />
          <div className="my-2 border-t border-dashed border-line" />
          <Line label="Opening capital" value={money(bs.openingCapital)} muted />
          <Line label="Capital introduced" value={money(bs.capitalIntroduced)} muted />
          <Line label="Less drawings" value={`−${money(bs.drawings)}`} muted />
          <Line label="Retained profit" value={money(bs.retainedProfit)} muted />
          <div className="my-2 border-t border-line" />
          <Line label="Total equity" value={money(bs.totalEquity)} strong />
          <Line label="Liabilities + equity" value={money(bs.totalLiabilities + bs.totalEquity)} strong className="mt-3" />
        </Card>
      </div>
      {bs.difference !== 0 && (
        <p className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink">
          The books do not balance by {money(bs.difference)}. Please contact support with a backup of your data.
        </p>
      )}
    </div>
  );
}
