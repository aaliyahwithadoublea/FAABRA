"use client";

import { Download } from "lucide-react";
import { useMemo } from "react";
import { Button, Card, Line, PageHeader, RangeBar, useRange } from "@/components/ui";
import { todayStr } from "@/lib/engine";
import { exportExcel } from "@/lib/files";
import { money, rangeLabel } from "@/lib/format";
import { type CategoryResult, profitAndLoss } from "@/lib/reports";
import { toast, useDb } from "@/lib/store";

function Block({ title, result, accent }: { title: string; result: CategoryResult; accent?: string }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2">
        {accent && <span className={`size-2.5 rounded-full ${accent}`} />}
        <h2 className="text-[15px] font-semibold">{title}</h2>
      </div>
      <Line label="Sales" value={money(result.sales)} muted />
      {result.discounts > 0 && <Line label="Less discounts" value={`−${money(result.discounts)}`} muted />}
      {result.returns > 0 && <Line label="Less returns" value={`−${money(result.returns)}`} muted />}
      <Line label="Net sales" value={money(result.netSales)} strong />
      <div className="my-2 border-t border-dashed border-line" />
      <Line label="Cost of goods sold" value={money(result.cogs)} muted />
      {result.stockAdjustments !== 0 && <Line label="Stock adjustments" value={money(result.stockAdjustments)} muted />}
      <Line label="Gross profit" value={money(result.grossProfit)} strong />
      {result.stockLosses > 0 && <Line label="Breakages / consumption" value={money(result.stockLosses)} muted className="mt-2" />}
    </Card>
  );
}

export default function ProfitPage() {
  const db = useDb();
  const [range, setRange] = useRange("month");
  const pnl = useMemo(() => profitAndLoss(db, range.from, range.to), [db, range]);
  const label = rangeLabel(range);

  const download = async () => {
    try {
      await exportExcel(`faabra-profit-${todayStr()}.xlsx`, [
        {
          name: "Profit and loss",
          title: [db.settings.businessName || "FAABRA GLOBAL TRADE", `Profit and loss · ${label}`],
          columns: [
            { header: "Line", width: 36 },
            { header: "Eggs", money: true },
            { header: "Water", money: true },
            { header: "Combined", money: true },
          ],
          rows: [
            ["Sales", pnl.eggs.sales, pnl.water.sales, pnl.combined.sales],
            ["Discounts", pnl.eggs.discounts, pnl.water.discounts, pnl.combined.discounts],
            ["Returns", pnl.eggs.returns, pnl.water.returns, pnl.combined.returns],
            ["Net sales", pnl.eggs.netSales, pnl.water.netSales, pnl.combined.netSales],
            ["Cost of goods sold", pnl.eggs.cogs, pnl.water.cogs, pnl.combined.cogs],
            ["Gross profit", pnl.eggs.grossProfit, pnl.water.grossProfit, pnl.combined.grossProfit],
            ["Other income", null, null, pnl.otherIncome],
            ...pnl.expenses.map((e) => [e.name, null, null, e.amount] as (string | number | null)[]),
            ["Total expenses", null, null, pnl.totalExpenses],
            ["Net profit", null, null, pnl.netProfit],
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
        title="Profit & loss"
        subtitle={label}
        actions={
          <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={() => void download()}>
            Excel
          </Button>
        }
      />
      <RangeBar value={range} onChange={setRange} className="mb-4" />

      <div className="grid gap-4 lg:grid-cols-3">
        <Block title="Eggs" result={pnl.eggs} accent="bg-yolk" />
        <Block title="Water" result={pnl.water} accent="bg-aqua" />
        <Block title="Combined business" result={pnl.combined} accent="bg-brand-500" />
      </div>

      <Card className="mt-4 p-5">
        <h2 className="mb-3 text-[15px] font-semibold">From gross profit to net profit</h2>
        <Line label="Gross profit" value={money(pnl.combined.grossProfit)} strong />
        {pnl.otherIncome !== 0 && <Line label="Other income" value={money(pnl.otherIncome)} muted />}
        {pnl.expenses.map((e) => (
          <Line key={e.code} label={e.name} value={`−${money(e.amount)}`} muted />
        ))}
        {!pnl.expenses.length && <p className="py-2 text-sm text-muted">No operating expenses in this period.</p>}
        <div className="my-2 border-t border-line" />
        <Line label="Net operating profit" value={money(pnl.netProfit)} strong />
      </Card>
    </div>
  );
}
