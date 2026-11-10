"use client";

import { useMemo } from "react";
import { CategoryChip } from "@/components/shell";
import { Button, Card, DataTable, Money, PageHeader, RangeBar, RowCard, useRange } from "@/components/ui";
import { productLabel } from "@/lib/engine";
import { money, qty, units } from "@/lib/format";
import { stockRegister } from "@/lib/reports";
import { useDb } from "@/lib/store";
import { openModal } from "@/lib/ui-store";

export default function StockPage() {
  const db = useDb();
  const [range, setRange] = useRange("month");
  const rows = useMemo(() => {
    const register = stockRegister(db, range.from, range.to);
    return register
      .map((r) => ({ ...r, product: db.products.find((p) => p.id === r.productId)! }))
      .filter((r) => r.product)
      .sort((a, b) => a.product.category.localeCompare(b.product.category) || a.product.name.localeCompare(b.product.name));
  }, [db, range]);

  const totalValue = rows.reduce((s, r) => s + r.closingValue, 0);

  return (
    <div>
      <PageHeader
        title="Stock"
        subtitle={`Closing value ${money(totalValue)}`}
        actions={
          <Button size="sm" variant="secondary" onClick={() => openModal({ type: "stockEvent" })}>
            Stock entry
          </Button>
        }
      />
      <RangeBar value={range} onChange={setRange} className="mb-4" />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["eggs", "water"] as const).map((cat) => {
          const list = rows.filter((r) => r.product.category === cat);
          return (
            <Card key={cat} className="p-4">
              <CategoryChip category={cat} />
              <p className="num mt-2 text-xl font-semibold">{money(list.reduce((s, r) => s + r.closingValue, 0))}</p>
              <p className="text-xs text-muted">{list.length} products</p>
            </Card>
          );
        })}
      </div>

      <DataTable
        rows={rows}
        rowKey={(r) => r.productId}
        empty={<div className="px-6 py-12 text-center text-sm text-muted">No stock movements yet.</div>}
        card={(r) => (
          <RowCard
            title={productLabel(r.product)}
            amount={units(r.closing, r.product.unit)}
            meta={`Worth ${money(r.closingValue)}`}
            badge={<CategoryChip category={r.product.category} />}
            sub={`In ${qty(r.purchases + r.returnsIn)} · Out ${qty(r.sales + r.returnsOut + r.losses + r.internal)}`}
          />
        )}
        columns={[
          {
            key: "product",
            header: "Product",
            cell: (r) => (
              <span className="flex items-center gap-2">
                <CategoryChip category={r.product.category} />
                <span className="font-medium">{productLabel(r.product)}</span>
              </span>
            ),
          },
          { key: "opening", header: "Opening", align: "right", cell: (r) => qty(r.opening) },
          { key: "purchases", header: "Bought", align: "right", cell: (r) => qty(r.purchases) },
          { key: "sales", header: "Sold", align: "right", cell: (r) => qty(r.sales) },
          { key: "losses", header: "Loss / use", align: "right", cell: (r) => qty(r.losses + r.internal + r.returnsOut) },
          { key: "closing", header: "Closing", align: "right", cell: (r) => <span className="font-semibold">{qty(r.closing)}</span> },
          { key: "value", header: "Value", align: "right", cell: (r) => <Money value={r.closingValue} /> },
        ]}
        footer={["Total", "", "", "", "", "", money(totalValue)]}
      />
      <p className="mt-3 text-xs text-muted">
        Closing stock = Opening + Purchases + Returns in − Sales − Returns out − Losses − Internal use ± Adjustments. Stock is valued at weighted average cost.
      </p>
    </div>
  );
}
