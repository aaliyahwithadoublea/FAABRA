"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { ButtonLink, DataTable, PageHeader, RangeBar, RowCard, SearchInput, Segmented, StatusBadge, useRange } from "@/components/ui";
import { fmtDate, money } from "@/lib/format";
import { useLookups } from "@/lib/hooks";
import { purchaseOutstanding } from "@/lib/reports";
import { useDb } from "@/lib/store";

type Filter = "all" | "unpaid" | "draft" | "reversed";

export default function PurchasesPage() {
  const db = useDb();
  const { suppliers } = useLookups();
  const outstanding = useMemo(() => purchaseOutstanding(db), [db]);
  const [range, setRange] = useRange("month");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return [...db.purchases]
      .filter((p) => {
        if (range.from && p.date < range.from) return false;
        if (range.to && p.date > range.to) return false;
        if (filter === "draft" && p.status !== "draft") return false;
        if (filter === "reversed" && p.status !== "reversed") return false;
        if (filter === "unpaid" && !(p.status === "posted" && (outstanding[p.id] ?? 0) > 0)) return false;
        if (filter === "all" && p.status === "draft") return false;
        if (!query) return true;
        const name = suppliers.get(p.supplierId)?.name ?? "";
        return p.number.toLowerCase().includes(query) || name.toLowerCase().includes(query) || p.invoiceRef.toLowerCase().includes(query);
      })
      .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
  }, [db.purchases, range, filter, q, suppliers, outstanding]);

  const posted = rows.filter((p) => p.status === "posted");

  return (
    <div>
      <PageHeader
        title="Purchases"
        subtitle={`${posted.length} posted · ${money(posted.reduce((s, p) => s + p.total, 0))}`}
        actions={
          <ButtonLink href="/purchases/new" icon={<Plus className="size-4" />}>
            New purchase
          </ButtonLink>
        }
      />
      <div className="mb-4 flex flex-col gap-3">
        <RangeBar value={range} onChange={setRange} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchInput value={q} onChange={setQ} placeholder="Search purchase or supplier" className="sm:max-w-xs" />
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "Posted" },
              { value: "unpaid", label: "Unpaid" },
              { value: "draft", label: "Drafts" },
              { value: "reversed", label: "Reversed" },
            ]}
          />
        </div>
      </div>
      <DataTable
        rows={rows}
        rowKey={(p) => p.id}
        href={(p) => (p.status === "draft" ? `/purchases/new?draft=${p.id}` : `/purchases/view?id=${p.id}`)}
        dim={(p) => p.status === "reversed"}
        empty={
          <div className="px-6 py-12 text-center">
            <p className="font-semibold">No purchases in this period</p>
            <ButtonLink href="/purchases/new" className="mt-4" size="sm">
              New purchase
            </ButtonLink>
          </div>
        }
        card={(p) => (
          <RowCard
            title={suppliers.get(p.supplierId)?.name ?? "Supplier"}
            amount={money(p.total)}
            meta={`${p.number || "Draft"} · ${fmtDate(p.date)}`}
            badge={
              <StatusBadge
                status={p.status}
                pay={p.status === "posted" ? ((outstanding[p.id] ?? 0) <= 0 ? "paid" : p.amountPaid > 0 ? "part" : "unpaid") : undefined}
              />
            }
          />
        )}
        columns={[
          { key: "number", header: "Purchase", cell: (p) => <span className="font-medium">{p.number || "Draft"}</span> },
          { key: "date", header: "Date", cell: (p) => fmtDate(p.date) },
          { key: "supplier", header: "Supplier", cell: (p) => suppliers.get(p.supplierId)?.name ?? "—" },
          { key: "total", header: "Total", align: "right", cell: (p) => money(p.total) },
          { key: "paid", header: "Paid", align: "right", cell: (p) => (p.status === "posted" ? money(p.amountPaid) : "—") },
          {
            key: "status",
            header: "Status",
            cell: (p) => (
              <StatusBadge
                status={p.status}
                pay={p.status === "posted" ? ((outstanding[p.id] ?? 0) <= 0 ? "paid" : p.amountPaid > 0 ? "part" : "unpaid") : undefined}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
