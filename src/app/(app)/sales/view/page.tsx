"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { InvoiceView } from "@/components/invoice";
import { Button, ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { money } from "@/lib/format";
import { saleOutstanding } from "@/lib/ledger";
import { useDb } from "@/lib/store";
import { openModal } from "@/lib/ui-store";

function SaleDetail() {
  const id = useSearchParams().get("id");
  const db = useDb();
  const sale = db.sales.find((s) => s.id === id);

  if (!sale) {
    return (
      <EmptyState title="Invoice not found" action={<ButtonLink href="/sales">Back to sales</ButtonLink>} />
    );
  }
  if (sale.status === "draft") {
    return (
      <EmptyState
        title="This is still a draft"
        action={<ButtonLink href={`/sales/new?draft=${sale.id}`}>Continue editing</ButtonLink>}
      />
    );
  }

  const due = sale.status === "posted" ? saleOutstanding(db)[sale.id] ?? 0 : 0;

  return (
    <div>
      <PageHeader
        title={sale.number}
        subtitle={`${money(sale.total)}${due > 0 ? ` · ${money(due)} unpaid` : ""}`}
        back={{ href: "/sales", label: "Sales" }}
        actions={
          <>
            {sale.status === "posted" && due > 0 && sale.customerId && (
              <Button size="sm" onClick={() => openModal({ type: "receipt", customerId: sale.customerId!, saleId: sale.id })}>
                Receive payment
              </Button>
            )}
            {sale.status === "posted" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => openModal({ type: "reverse", docType: "sale", id: sale.id, number: sale.number, label: "Sales invoice" })}
              >
                Reverse
              </Button>
            )}
          </>
        }
      />
      {sale.status === "reversed" && sale.reversalReason && (
        <p className="mb-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-ink">
          Reversed: {sale.reversalReason}
        </p>
      )}
      <InvoiceView sale={sale} />
    </div>
  );
}

export default function SaleViewPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading invoice…</p>}>
      <SaleDetail />
    </Suspense>
  );
}
