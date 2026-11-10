"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { fmtDate, money } from "@/lib/format";
import { useLookups, useSaleOutstanding } from "@/lib/hooks";
import { useDb } from "@/lib/store";
import type { DocStatus, Sale } from "@/lib/types";
import { Badge, ButtonLink, DataTable, PageHeader, RowCard, SearchInput, Segmented, StatusBadge, useRange, RangeBar } from "@/components/ui";

type Filter = "all" | "unpaid" | "draft" | "reversed";

export default function SalesPage() {
  const db = useDb();
  const { customers } = useLookups();
  const outstanding = useSaleOutstanding();
  const [range, setRange] = useRange("month");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return [...db.sales]
      .filter((s) => {
        if (range.from && s.date < range.from) return false;
        if (range.to && s.date > range.to) return false;
        if (filter === "draft" && s.status !== "draft") return false;
        if (filter === "reversed" && s.status !== "reversed") return false;
        if (filter === "unpaid" && !(s.status === "posted" && (outstanding[s.id] ?? 0) > 0)) return false;
        if (filter === "all" && s.status === "draft") return false;
        if (!query) return true;
        const name = s.customerId ? customers.get(s.customerId)?.name ?? "" : "walk-in";
        return s.number.toLowerCase().includes(query) || name.toLowerCase().includes(query);
      })
      .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
  }, [db.sales, range, filter, q, customers, outstanding]);

  const posted = rows.filter((s) => s.status === "posted");
  const total = posted.reduce((s, x) => s + x.total, 0);
  const unpaid = posted.reduce((s, x) => s + (outstanding[x.id] ?? 0), 0);

  const payOf = (s: Sale) => {
    if (s.status !== "posted") return undefined;
    const due = outstanding[s.id] ?? 0;
    if (due <= 0) return "paid" as const;
    if (s.amountPaid > 0) return "part" as const;
    return "unpaid" as const;
  };

  return (
    <div>
      <PageHeader
        title="Sales"
        subtitle={`${posted.length} posted · ${money(total)} sales · ${money(unpaid)} unpaid`}
        actions={
          <ButtonLink href="/sales/new" icon={<Plus className="size-4" />}>
            New sale
          </ButtonLink>
        }
      />
      <div className="mb-4 flex flex-col gap-3">
        <RangeBar value={range} onChange={setRange} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput value={q} onChange={setQ} placeholder="Search invoice or customer" className="sm:max-w-xs" />
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
        rowKey={(s) => s.id}
        href={(s) => (s.status === "draft" ? `/sales/new?draft=${s.id}` : `/sales/view?id=${s.id}`)}
        dim={(s) => s.status === "reversed"}
        empty={
          <div className="px-6 py-12 text-center">
            <p className="font-semibold text-ink">No sales in this period</p>
            <p className="mt-1 text-sm text-muted">Create an invoice to record a sale of eggs or water.</p>
            <ButtonLink href="/sales/new" className="mt-4" size="sm">
              New sale
            </ButtonLink>
          </div>
        }
        card={(s) => (
          <RowCard
            title={s.customerId ? customers.get(s.customerId)?.name ?? "Customer" : "Walk-in customer"}
            amount={money(s.total)}
            meta={`${s.number || "Draft"} · ${fmtDate(s.date)}`}
            badge={<StatusBadge status={s.status as DocStatus} pay={payOf(s)} />}
            sub={s.status === "posted" && (outstanding[s.id] ?? 0) > 0 ? `${money(outstanding[s.id])} still due` : undefined}
          />
        )}
        columns={[
          { key: "number", header: "Invoice", cell: (s) => <span className="font-medium">{s.number || "Draft"}</span> },
          { key: "date", header: "Date", cell: (s) => fmtDate(s.date) },
          {
            key: "customer",
            header: "Customer",
            cell: (s) => (s.customerId ? customers.get(s.customerId)?.name ?? "—" : "Walk-in"),
          },
          { key: "total", header: "Total", align: "right", cell: (s) => money(s.total) },
          {
            key: "paid",
            header: "Paid",
            align: "right",
            cell: (s) => (s.status === "posted" ? money(s.amountPaid) : "—"),
          },
          {
            key: "status",
            header: "Status",
            cell: (s) => <StatusBadge status={s.status} pay={payOf(s)} />,
          },
        ]}
        footer={filter === "draft" || filter === "reversed" ? undefined : ["Total", "", `${posted.length} invoices`, money(total), money(posted.reduce((s, x) => s + x.amountPaid, 0)), ""]}
      />
      <span className="hidden"><Badge>x</Badge></span>
    </div>
  );
}
