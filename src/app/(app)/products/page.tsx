"use client";

import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { CategoryChip } from "@/components/shell";
import { Button, DataTable, PageHeader, RowCard, SearchInput, Segmented } from "@/components/ui";
import { productLabel } from "@/lib/engine";
import { money, units } from "@/lib/format";
import { onHand } from "@/lib/ledger";
import { useDb } from "@/lib/store";
import { openModal } from "@/lib/ui-store";

export default function ProductsPage() {
  const db = useDb();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | "eggs" | "water">("all");

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    return db.products
      .filter((p) => (cat === "all" || p.category === cat) && (!query || productLabel(p).toLowerCase().includes(query) || p.code.toLowerCase().includes(query)))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [db.products, q, cat]);

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Eggs and water varieties, prices and units"
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => openModal({ type: "product" })}>
            Add product
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Search products" className="sm:max-w-xs" />
        <Segmented
          value={cat}
          onChange={setCat}
          options={[
            { value: "all", label: "All" },
            { value: "eggs", label: "Eggs" },
            { value: "water", label: "Water" },
          ]}
        />
      </div>
      <DataTable
        rows={rows}
        rowKey={(p) => p.id}
        onRowClick={(p) => openModal({ type: "product", id: p.id })}
        dim={(p) => !p.active}
        card={(p) => {
          const stock = onHand(db, p.id);
          return (
            <RowCard
              title={productLabel(p)}
              amount={units(stock.qty, p.unit)}
              meta={`${p.code} · Retail ${money(p.retailPrice)}`}
              badge={<CategoryChip category={p.category} />}
            />
          );
        }}
        columns={[
          {
            key: "name",
            header: "Product",
            cell: (p) => (
              <span className="flex items-center gap-2">
                <CategoryChip category={p.category} />
                <span>
                  <span className="block font-medium">{productLabel(p)}</span>
                  <span className="text-xs text-muted">{p.code}</span>
                </span>
              </span>
            ),
          },
          { key: "cost", header: "Buy", align: "right", cell: (p) => money(p.costPrice) },
          { key: "wholesale", header: "Wholesale", align: "right", cell: (p) => money(p.wholesalePrice) },
          { key: "retail", header: "Retail", align: "right", cell: (p) => money(p.retailPrice) },
          { key: "stock", header: "Stock", align: "right", cell: (p) => units(onHand(db, p.id).qty, p.unit) },
          { key: "status", header: "", cell: (p) => (p.active ? "" : <span className="text-xs text-muted">Inactive</span>) },
        ]}
      />
    </div>
  );
}
