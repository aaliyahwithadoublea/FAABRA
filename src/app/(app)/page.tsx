"use client";

import { AlertTriangle, Banknote, Boxes, HandCoins, ShoppingBag, TrendingUp, Truck, Wallet } from "lucide-react";
import Link from "next/link";
import { productLabel, todayStr } from "@/lib/engine";
import { fmtDate, money, presetRange, qty, units } from "@/lib/format";
import { useLookups } from "@/lib/hooks";
import { onHand } from "@/lib/ledger";
import { dailySeries, position, profitAndLoss, purchasesTotal } from "@/lib/reports";
import { useDb } from "@/lib/store";
import { openModal } from "@/lib/ui-store";
import { Badge, Button, ButtonLink, Card, Money, PageHeader, SectionTitle, Stat, cn } from "@/components/ui";

export default function DashboardPage() {
  const db = useDb();
  const today = todayStr();
  const { products, customers } = useLookups();
  const day = presetRange("today", today);
  const month = presetRange("month", today);
  const pos = position(db);
  const todayPnL = profitAndLoss(db, day.from, day.to);
  const monthPnL = profitAndLoss(db, month.from, month.to);
  const series = dailySeries(db, presetRange("week", today).from!, today);
  const maxSales = Math.max(1, ...series.map((d) => d.sales));
  const lowStock = db.products.filter((p) => p.active && p.lowStockLevel > 0 && onHand(db, p.id).qty <= p.lowStockLevel);
  const unpaid = db.sales.filter((s) => s.status === "posted" && s.total - s.amountPaid > 0.004).length;
  const recentSales = [...db.sales].filter((s) => s.status !== "draft").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${db.settings.businessName || "FAABRA"} · ${fmtDate(today)}`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => openModal({ type: "quick" })}>
              New entry
            </Button>
            <ButtonLink href="/sales/new" size="sm" icon={<ShoppingBag className="size-4" />}>
              New sale
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Today's sales" value={<Money value={todayPnL.combined.netSales} />} sub={`${money(purchasesTotal(db, day.from, day.to))} bought today`} icon={<ShoppingBag className="size-4" />} tone="yolk" href="/sales" />
        <Stat label="Cash" value={<Money value={pos.cash} />} sub={`Bank ${money(pos.bank)}`} icon={<Wallet className="size-4" />} tone="brand" href="/money" />
        <Stat label="Debtors" value={<Money value={pos.debtors} />} sub={unpaid ? `${unpaid} open invoice${unpaid === 1 ? "" : "s"}` : "All invoices settled"} icon={<HandCoins className="size-4" />} tone="aqua" href="/debtors" />
        <Stat label="Creditors" value={<Money value={pos.creditors} />} sub={`Stock worth ${money(pos.stockValue)}`} icon={<Truck className="size-4" />} href="/creditors" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Gross profit (month)" value={<Money value={monthPnL.combined.grossProfit} />} sub={`Sales ${money(monthPnL.combined.netSales)}`} icon={<TrendingUp className="size-4" />} tone="brand" href="/reports/profit" />
        <Stat label="Expenses (month)" value={<Money value={monthPnL.totalExpenses} />} icon={<Banknote className="size-4" />} href="/expenses" />
        <Stat label="Net profit (month)" value={<Money value={monthPnL.netProfit} signed />} sub={`Eggs ${money(monthPnL.eggs.grossProfit)} · Water ${money(monthPnL.water.grossProfit)}`} href="/reports/profit" />
        <Stat
          label="Stock on hand"
          value={qty(Object.values(db.stock).reduce((s, v) => s + v.qty, 0))}
          sub={lowStock.length ? `${lowStock.length} running low` : "Levels look fine"}
          icon={<Boxes className="size-4" />}
          tone={lowStock.length ? "yolk" : "neutral"}
          href="/stock"
        />
      </div>

      {lowStock.length > 0 && (
        <Card className="mt-4 border-yolk/30 bg-yolk-soft/40 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-yolk-ink" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-yolk-ink">Low stock</p>
              <ul className="mt-1 space-y-0.5 text-sm text-ink">
                {lowStock.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    {productLabel(p)} — {units(onHand(db, p.id).qty, p.unit)} left (alert at {qty(p.lowStockLevel)})
                  </li>
                ))}
              </ul>
            </div>
            <ButtonLink href="/purchases/new" size="sm" variant="secondary">
              Buy more
            </ButtonLink>
          </div>
        </Card>
      )}

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <SectionTitle>This week&apos;s sales</SectionTitle>
          <div className="mt-4 flex h-40 items-end gap-1.5 sm:gap-2">
            {series.map((d) => (
              <div key={d.date} className="group relative flex min-w-0 flex-1 flex-col items-center justify-end">
                <div
                  className="w-full max-w-10 rounded-t-md bg-brand-500/90 transition-colors group-hover:bg-brand-600"
                  style={{ height: `${Math.max(d.sales > 0 ? 8 : 2, (d.sales / maxSales) * 100)}%` }}
                  title={`${fmtDate(d.date)}: ${money(d.sales)}`}
                />
                <span className="mt-2 text-[10px] text-faint">{d.date.slice(8)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">Bars show net sales for each day. Hover a bar for the exact amount.</p>
        </Card>

        <Card className="p-5 lg:col-span-2">
          <SectionTitle
            action={
              <Link href="/sales" className="text-[13px] font-medium text-brand-700 hover:underline">
                See all
              </Link>
            }
          >
            Recent sales
          </SectionTitle>
          <ul className="mt-3 divide-y divide-line">
            {recentSales.length === 0 && <li className="py-6 text-center text-sm text-muted">No sales yet. Tap New sale to start.</li>}
            {recentSales.map((s) => {
              const name = s.customerId ? customers.get(s.customerId)?.name : "Walk-in";
              const bal = Math.max(0, s.total - s.amountPaid);
              return (
                <li key={s.id}>
                  <Link href={`/sales/view?id=${s.id}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{name}</p>
                      <p className="text-xs text-muted">
                        {s.number} · {fmtDate(s.date)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="num text-sm font-semibold">{money(s.total)}</p>
                      {s.status === "reversed" ? (
                        <Badge tone="danger">Reversed</Badge>
                      ) : bal > 0 ? (
                        <span className="text-[11px] text-yolk-ink">{money(bal)} due</span>
                      ) : (
                        <span className="text-[11px] text-brand-700">Paid</span>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <SectionTitle>Stock snapshot</SectionTitle>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {db.products
            .filter((p) => p.active)
            .map((p) => {
              const stock = onHand(db, p.id);
              const low = p.lowStockLevel > 0 && stock.qty <= p.lowStockLevel;
              return (
                <div key={p.id} className={cn("rounded-xl border border-line px-3 py-2.5", low && "border-yolk/40 bg-yolk-soft/30")}>
                  <p className="truncate text-[13px] font-medium">{productLabel(p)}</p>
                  <p className="num mt-0.5 text-sm font-semibold">{units(stock.qty, p.unit)}</p>
                  <p className="num text-[11px] text-muted">{money(stock.value)}</p>
                </div>
              );
            })}
          {!db.products.some((p) => p.active) && <p className="col-span-full text-sm text-muted">No active products.</p>}
        </div>
      </Card>

      {/* Keep products map referenced so tree-shaking doesn't drop the lookup. */}
      <span className="hidden">{products.size}</span>
    </div>
  );
}
