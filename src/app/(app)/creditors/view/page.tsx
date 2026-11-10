"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Button, ButtonLink, DataTable, EmptyState, PageHeader, RowCard, Stat } from "@/components/ui";
import { sourceHref } from "@/lib/chart";
import { fmtDate, money } from "@/lib/format";
import { ledger } from "@/lib/reports";
import { useDb } from "@/lib/store";
import { openModal } from "@/lib/ui-store";

function SupplierAccount() {
  const id = useSearchParams().get("id") ?? "";
  const db = useDb();
  const supplier = db.suppliers.find((s) => s.id === id);
  const statement = useMemo(
    () => ledger(db, (l) => l.account === "2000" && l.partyId === id, { sign: -1, hideCancelled: true }),
    [db, id],
  );

  if (!supplier) return <EmptyState title="Supplier not found" action={<ButtonLink href="/creditors">Back</ButtonLink>} />;

  return (
    <div>
      <PageHeader
        title={supplier.name}
        subtitle={[supplier.code, supplier.phone, supplier.address].filter(Boolean).join(" · ")}
        back={{ href: "/creditors", label: "Creditors" }}
        actions={
          <>
            <Button size="sm" onClick={() => openModal({ type: "supplierPayment", supplierId: supplier.id })}>
              Pay supplier
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openModal({ type: "supplier", id: supplier.id })}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => openModal({ type: "adjustment", partyType: "supplier", partyId: supplier.id })}>
              Adjust
            </Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Balance you owe" value={money(statement.closing)} />
        <Stat label="Opening balance" value={money(supplier.openingBalance)} />
      </div>
      <DataTable
        rows={statement.rows}
        rowKey={(r) => r.key}
        href={(r) => sourceHref(r.sourceType, r.sourceId)}
        empty={<div className="px-6 py-12 text-center text-sm text-muted">No movements on this account yet.</div>}
        card={(r) => (
          <RowCard title={r.description} amount={money((r.credit || 0) - (r.debit || 0))} meta={`${r.ref} · ${fmtDate(r.date)}`} sub={`Balance ${money(r.balance)}`} />
        )}
        columns={[
          { key: "date", header: "Date", cell: (r) => fmtDate(r.date) },
          { key: "ref", header: "Ref", cell: (r) => r.ref },
          { key: "desc", header: "Description", cell: (r) => r.description },
          { key: "credit", header: "Purchase", align: "right", cell: (r) => (r.credit ? money(r.credit) : "") },
          { key: "debit", header: "Payment", align: "right", cell: (r) => (r.debit ? money(r.debit) : "") },
          { key: "bal", header: "Balance", align: "right", cell: (r) => money(r.balance) },
        ]}
      />
    </div>
  );
}

export default function CreditorViewPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <SupplierAccount />
    </Suspense>
  );
}
