"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, DataTable, PageHeader, RangeBar, RowCard, Segmented, Stat, useRange } from "@/components/ui";
import { sourceHref } from "@/lib/chart";
import { fmtDate, money } from "@/lib/format";
import { useMoneyBalances } from "@/lib/hooks";
import { ledger } from "@/lib/reports";
import { useDb } from "@/lib/store";
import { openModal } from "@/lib/ui-store";

export default function MoneyPage() {
  const db = useDb();
  const balances = useMoneyBalances();
  const [range, setRange] = useRange("month");
  const [accountId, setAccountId] = useState(db.accounts[0]?.id ?? "");
  const account = db.accounts.find((a) => a.id === accountId) ?? db.accounts[0];

  const statement = useMemo(() => {
    if (!account) return null;
    return ledger(db, (l) => l.moneyAccountId === account.id, { from: range.from, to: range.to, hideCancelled: true });
  }, [db, account, range]);

  const cash = db.accounts.filter((a) => a.type === "cash").reduce((s, a) => s + (balances[a.id] ?? 0), 0);
  const bank = db.accounts.filter((a) => a.type === "bank").reduce((s, a) => s + (balances[a.id] ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Cash & bank"
        subtitle="Running balances for every money account"
        actions={
          <>
            <Button size="sm" variant="secondary" onClick={() => openModal({ type: "transfer" })}>
              Transfer
            </Button>
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => openModal({ type: "account" })}>
              Add account
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Cash in hand" value={money(cash)} />
        <Stat label="Bank" value={money(bank)} />
        <Stat label="Combined" value={money(cash + bank)} />
        <Card className="flex items-center justify-center p-4">
          <Button variant="ghost" size="sm" onClick={() => openModal({ type: "account", accountType: "bank" })}>
            + Bank account
          </Button>
        </Card>
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <Segmented
          value={accountId}
          onChange={setAccountId}
          options={db.accounts.map((a) => ({ value: a.id, label: `${a.name} (${money(balances[a.id] ?? 0)})` }))}
        />
        <RangeBar value={range} onChange={setRange} />
      </div>

      {account && statement && (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-ink">{account.name}</p>
              <p className="text-sm text-muted">
                {account.type === "bank" && account.bankName ? `${account.bankName} · ` : ""}
                Opening in period {money(statement.opening)} · Closing {money(statement.closing)}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => openModal({ type: "account", id: account.id })}>
              Edit account
            </Button>
          </div>
          <DataTable
            rows={statement.rows}
            rowKey={(r) => r.key}
            href={(r) => sourceHref(r.sourceType, r.sourceId)}
            empty={<div className="px-6 py-12 text-center text-sm text-muted">No movements in this period.</div>}
            card={(r) => (
              <RowCard title={r.description} amount={money(r.debit - r.credit)} meta={`${r.ref} · ${fmtDate(r.date)}`} sub={`Balance ${money(r.balance)}`} />
            )}
            columns={[
              { key: "date", header: "Date", cell: (r) => fmtDate(r.date) },
              { key: "ref", header: "Ref", cell: (r) => r.ref },
              { key: "desc", header: "Description", cell: (r) => r.description },
              { key: "in", header: "In", align: "right", cell: (r) => (r.debit ? money(r.debit) : "") },
              { key: "out", header: "Out", align: "right", cell: (r) => (r.credit ? money(r.credit) : "") },
              { key: "bal", header: "Balance", align: "right", cell: (r) => money(r.balance) },
            ]}
          />
        </>
      )}
    </div>
  );
}
