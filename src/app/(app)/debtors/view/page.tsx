"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Button, ButtonLink, Card, DataTable, EmptyState, PageHeader, RowCard, Stat } from "@/components/ui";
import { sourceHref } from "@/lib/chart";
import { fmtDate, money } from "@/lib/format";
import { ledger } from "@/lib/reports";
import { useDb } from "@/lib/store";
import { openModal } from "@/lib/ui-store";

function CustomerAccount() {
  const id = useSearchParams().get("id") ?? "";
  const db = useDb();
  const customer = db.customers.find((c) => c.id === id);
  const statement = useMemo(
    () => ledger(db, (l) => l.account === "1200" && l.partyId === id, { hideCancelled: true }),
    [db, id],
  );

  if (!customer) return <EmptyState title="Customer not found" action={<ButtonLink href="/debtors">Back</ButtonLink>} />;

  return (
    <div>
      <PageHeader
        title={customer.name}
        subtitle={[customer.code, customer.phone, customer.address].filter(Boolean).join(" · ")}
        back={{ href: "/debtors", label: "Debtors" }}
        actions={
          <>
            <Button size="sm" onClick={() => openModal({ type: "receipt", customerId: customer.id })}>
              Receive payment
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openModal({ type: "customer", id: customer.id })}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => openModal({ type: "adjustment", partyType: "customer", partyId: customer.id })}>
              Adjust
            </Button>
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Balance owed" value={money(statement.closing)} />
        <Stat label="Credit limit" value={customer.creditLimit ? money(customer.creditLimit) : "None"} />
        <Stat label="Category" value={customer.category} />
      </div>
      <Card className="mb-3 px-4 py-3 text-sm text-muted">Account statement — oldest entries first. Cancelled entries are hidden.</Card>
      <DataTable
        rows={statement.rows}
        rowKey={(r) => r.key}
        href={(r) => sourceHref(r.sourceType, r.sourceId)}
        empty={<div className="px-6 py-12 text-center text-sm text-muted">No movements on this account yet.</div>}
        card={(r) => (
          <RowCard title={r.description} amount={money((r.debit || 0) - (r.credit || 0))} meta={`${r.ref} · ${fmtDate(r.date)}`} sub={`Balance ${money(r.balance)}`} />
        )}
        columns={[
          { key: "date", header: "Date", cell: (r) => fmtDate(r.date) },
          { key: "ref", header: "Ref", cell: (r) => r.ref },
          { key: "desc", header: "Description", cell: (r) => r.description },
          { key: "debit", header: "Invoice", align: "right", cell: (r) => (r.debit ? money(r.debit) : "") },
          { key: "credit", header: "Payment", align: "right", cell: (r) => (r.credit ? money(r.credit) : "") },
          { key: "bal", header: "Balance", align: "right", cell: (r) => money(r.balance) },
        ]}
      />
    </div>
  );
}

export default function DebtorViewPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <CustomerAccount />
    </Suspense>
  );
}
