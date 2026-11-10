"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, DataTable, PageHeader, RowCard, SearchInput } from "@/components/ui";
import { money } from "@/lib/format";
import { useCustomerBalances } from "@/lib/hooks";
import { useDb } from "@/lib/store";
import { openModal } from "@/lib/ui-store";

export default function CustomersPage() {
  const db = useDb();
  const balances = useCustomerBalances();
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return [...db.customers]
      .filter((c) => !query || c.name.toLowerCase().includes(query) || c.phone.includes(query) || c.code.toLowerCase().includes(query))
      .sort((a, b) => (balances[b.id] ?? 0) - (balances[a.id] ?? 0) || a.name.localeCompare(b.name));
  }, [db.customers, q, balances]);

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={`${rows.length} customers · ${money(Object.values(balances).reduce((s, v) => s + Math.max(0, v), 0))} owed to you`}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => openModal({ type: "customer" })}>
            Add customer
          </Button>
        }
      />
      <SearchInput value={q} onChange={setQ} placeholder="Search customers" className="mb-4 sm:max-w-xs" />
      <DataTable
        rows={rows}
        rowKey={(c) => c.id}
        href={(c) => `/debtors/view?id=${c.id}`}
        card={(c) => (
          <RowCard
            title={c.name}
            amount={money(balances[c.id] ?? 0)}
            meta={`${c.code}${c.phone ? ` · ${c.phone}` : ""}`}
            badge={<Badge tone="neutral">{c.category}</Badge>}
          />
        )}
        columns={[
          {
            key: "name",
            header: "Customer",
            cell: (c) => (
              <span>
                <span className="block font-medium">{c.name}</span>
                <span className="text-xs text-muted">{c.code}</span>
              </span>
            ),
          },
          { key: "phone", header: "Phone", cell: (c) => c.phone || "—" },
          { key: "category", header: "Category", cell: (c) => <Badge>{c.category}</Badge> },
          { key: "limit", header: "Credit limit", align: "right", cell: (c) => (c.creditLimit ? money(c.creditLimit) : "—") },
          { key: "balance", header: "Balance", align: "right", cell: (c) => <span className="font-semibold">{money(balances[c.id] ?? 0)}</span> },
          {
            key: "edit",
            header: "",
            cell: (c) => (
              <button
                type="button"
                className="relative z-10 text-[13px] font-medium text-brand-700 hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openModal({ type: "customer", id: c.id });
                }}
              >
                Edit
              </button>
            ),
          },
        ]}
      />
      <p className="mt-3 text-xs text-muted">
        Open a customer to see their full account. Or go to the <Link href="/debtors" className="text-brand-700 hover:underline">debtors ledger</Link>.
      </p>
    </div>
  );
}
