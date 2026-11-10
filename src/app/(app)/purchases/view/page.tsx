"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button, ButtonLink, Card, EmptyState, Line, PageHeader, StatusBadge } from "@/components/ui";
import { productLabel } from "@/lib/engine";
import { fmtDate, money, units } from "@/lib/format";
import { purchaseOutstanding } from "@/lib/reports";
import { useDb } from "@/lib/store";
import { openModal } from "@/lib/ui-store";

function PurchaseDetail() {
  const id = useSearchParams().get("id");
  const db = useDb();
  const purchase = db.purchases.find((p) => p.id === id);

  if (!purchase) return <EmptyState title="Purchase not found" action={<ButtonLink href="/purchases">Back</ButtonLink>} />;
  if (purchase.status === "draft") {
    return <EmptyState title="This is still a draft" action={<ButtonLink href={`/purchases/new?draft=${purchase.id}`}>Continue editing</ButtonLink>} />;
  }

  const supplier = db.suppliers.find((s) => s.id === purchase.supplierId);
  const due = purchase.status === "posted" ? purchaseOutstanding(db)[purchase.id] ?? 0 : 0;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={purchase.number}
        subtitle={`${supplier?.name ?? "Supplier"} · ${fmtDate(purchase.date)}`}
        back={{ href: "/purchases", label: "Purchases" }}
        actions={
          <>
            <StatusBadge status={purchase.status} pay={due <= 0 ? "paid" : purchase.amountPaid > 0 ? "part" : "unpaid"} />
            {purchase.status === "posted" && due > 0 && (
              <Button size="sm" onClick={() => openModal({ type: "supplierPayment", supplierId: purchase.supplierId })}>
                Pay supplier
              </Button>
            )}
            {purchase.status === "posted" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => openModal({ type: "reverse", docType: "purchase", id: purchase.id, number: purchase.number, label: "Purchase" })}
              >
                Reverse
              </Button>
            )}
          </>
        }
      />

      {purchase.status === "reversed" && purchase.reversalReason && (
        <p className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink">Reversed: {purchase.reversalReason}</p>
      )}

      <Card className="overflow-hidden">
        <ul className="divide-y divide-line">
          {purchase.items.map((item, i) => {
            const p = db.products.find((x) => x.id === item.productId);
            return (
              <li key={i} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{p ? productLabel(p) : "Product"}</p>
                  <p className="text-muted">
                    {units(item.qty, p?.unit ?? "unit")} @ {money(item.unitCost)}
                    {item.landedUnitCost !== item.unitCost ? ` · landed ${money(item.landedUnitCost)}` : ""}
                  </p>
                </div>
                <p className="num font-semibold">{money(item.landedValue)}</p>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-line bg-sunken/50 px-4 py-3">
          <Line label="Goods" value={money(purchase.goodsTotal)} muted />
          {purchase.transportCost > 0 && <Line label="Transport (in stock cost)" value={money(purchase.transportCost)} muted />}
          <Line label="Total" value={money(purchase.total)} strong />
          <Line label="Paid" value={money(purchase.amountPaid)} muted />
          <Line label="Outstanding" value={money(due)} strong />
          {purchase.invoiceRef && <Line label="Supplier invoice" value={purchase.invoiceRef} muted />}
        </div>
      </Card>
    </div>
  );
}

export default function PurchaseViewPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <PurchaseDetail />
    </Suspense>
  );
}
