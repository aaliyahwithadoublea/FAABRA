"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, DataTable, PageHeader, RowCard, SearchInput } from "@/components/ui";
import { money } from "@/lib/format";
import { useSupplierBalances } from "@/lib/hooks";
import { useDb } from "@/lib/store";
import { openModal } from "@/lib/ui-store";

export default function SuppliersPage() {
  const db = useDb();
  const balances = useSupplierBalances();
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return [...db.suppliers]
      .filter((s) => !query || s.name.toLowerCase().includes(query) || s.phone.includes(query) || s.code.toLowerCase().includes(query))
      .sort((a, b) => (balances[b.id] ?? 0) - (balances[a.id] ?? 0) || a.name.localeCompare(b.name));
  }, [db.suppliers, q, balances]);

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle={`${rows.length} suppliers · ${money(Object.values(balances).reduce((s, v) => s + Math.max(0, v), 0))} you owe`}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => openModal({ type: "supplier" })}>
            Add supplier
          </Button>
        }
      />
      <SearchInput value={q} onChange={setQ} placeholder="Search suppliers" className="mb-4 sm:max-w-xs" />
      <DataTable
        rows={rows}
        rowKey={(s) => s.id}
        href={(s) => `/creditors/view?id=${s.id}`}
        card={(s) => (
          <RowCard title={s.name} amount={money(balances[s.id] ?? 0)} meta={`${s.code}${s.phone ? ` · ${s.phone}` : ""}`} />
        )}
        columns={[
          {
            key: "name",
            header: "Supplier",
            cell: (s) => (
              <span>
                <span className="block font-medium">{s.name}</span>
                <span className="text-xs text-muted">{s.code}</span>
              </span>
            ),
          },
          { key: "phone", header: "Phone", cell: (s) => s.phone || "—" },
          { key: "address", header: "Address", cell: (s) => s.address || "—" },
          { key: "balance", header: "Balance", align: "right", cell: (s) => <span className="font-semibold">{money(balances[s.id] ?? 0)}</span> },
          {
            key: "edit",
            header: "",
            cell: (s) => (
              <button
                type="button"
                className="relative z-10 text-[13px] font-medium text-brand-700 hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openModal({ type: "supplier", id: s.id });
                }}
              >
                Edit
              </button>
            ),
          },
        ]}
      />
      <p className="mt-3 text-xs text-muted">
        Open a supplier to see their account, or visit the <Link href="/creditors" className="text-brand-700 hover:underline">creditors ledger</Link>.
      </p>
    </div>
  );
}
