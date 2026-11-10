"use client";

import { Plus, Trash2 } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Card,
  Combobox,
  Field,
  Input,
  Line,
  MoneyInput,
  NumberInput,
  PageHeader,
  Select,
} from "@/components/ui";
import { deleteDraft, postPurchase, productLabel, savePurchaseDraft, todayStr } from "@/lib/engine";
import { editable, money, parseNum, units } from "@/lib/format";
import { activeAccounts, activeProducts, supplierOptions, useFields, useSupplierBalances } from "@/lib/hooks";
import { onHand, r2 } from "@/lib/ledger";
import { useAct, useDb } from "@/lib/store";
import type { ID } from "@/lib/types";
import { openModal } from "@/lib/ui-store";

interface LineDraft {
  key: string;
  productId: ID;
  qty: string;
  unitCost: string;
}

function newLine(): LineDraft {
  return { key: Math.random().toString(36).slice(2), productId: "", qty: "1", unitCost: "" };
}

function PurchaseForm() {
  const db = useDb();
  const act = useAct();
  const router = useRouter();
  const draftId = useSearchParams().get("draft");
  const balances = useSupplierBalances();
  const draft = draftId ? db.purchases.find((p) => p.id === draftId && p.status === "draft") : undefined;

  const [f, set] = useFields(() => ({
    date: draft?.date ?? todayStr(),
    supplierId: draft?.supplierId ?? "",
    transportCost: editable(draft?.transportCost),
    transportAccountId: draft?.transportAccountId ?? activeAccounts(db).find((a) => a.type === "cash")?.id ?? activeAccounts(db)[0]?.id ?? "",
    amountPaid: editable(draft?.amountPaid),
    paymentAccountId: draft?.paymentAccountId ?? activeAccounts(db).find((a) => a.type === "bank")?.id ?? activeAccounts(db)[0]?.id ?? "",
    invoiceRef: draft?.invoiceRef ?? "",
    remarks: draft?.remarks ?? "",
  }));
  const [items, setItems] = useState<LineDraft[]>(() =>
    draft?.items.length
      ? draft.items.map((i) => ({
          key: Math.random().toString(36).slice(2),
          productId: i.productId,
          qty: String(i.qty),
          unitCost: String(i.unitCost),
        }))
      : [newLine()],
  );

  const parsed = items
    .filter((i) => i.productId)
    .map((i) => ({ productId: i.productId, qty: parseNum(i.qty), unitCost: parseNum(i.unitCost) }));
  const goodsTotal = r2(parsed.reduce((s, i) => s + r2(i.qty * i.unitCost), 0));
  const transportCost = parseNum(f.transportCost);
  const total = r2(goodsTotal + transportCost);
  const amountPaid = parseNum(f.amountPaid);

  const productOpts = useMemo(
    () =>
      activeProducts(db).map((p) => ({
        value: p.id,
        label: productLabel(p),
        right: units(onHand(db, p.id).qty, p.unit),
      })),
    [db],
  );

  const setItem = (key: string, patch: Partial<LineDraft>) =>
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const payload = () => ({
    id: draft?.id,
    date: f.date,
    supplierId: f.supplierId,
    items: parsed,
    transportCost,
    transportAccountId: transportCost > 0 ? f.transportAccountId : null,
    amountPaid,
    paymentAccountId: amountPaid > 0 ? f.paymentAccountId : null,
    invoiceRef: f.invoiceRef,
    remarks: f.remarks,
  });

  const saveDraft = () => {
    const id = act((d) => savePurchaseDraft(d, payload()), "Draft saved");
    if (id && !draft) router.replace(`/purchases/new?draft=${id}`);
  };

  const post = () => {
    const id = act((d) => postPurchase(d, payload()), "Purchase posted");
    if (id) router.replace(`/purchases/view?id=${id}`);
  };

  const discard = () => {
    if (!draft) {
      router.push("/purchases");
      return;
    }
    act((d) => {
      deleteDraft(d, "purchase", draft.id);
      return true;
    }, "Draft discarded");
    router.push("/purchases");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={draft ? "Continue draft" : "New purchase"} subtitle="Stock and supplier balances update when you post" back={{ href: "/purchases", label: "Purchases" }} />

      <div className="space-y-4">
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Supplier">
              <Combobox
                value={f.supplierId}
                onChange={(v) => set("supplierId", v)}
                options={supplierOptions(db, balances)}
                placeholder="Choose supplier…"
                onCreate={(typed) => openModal({ type: "supplier", name: typed, onSaved: (id) => set("supplierId", id) })}
                createLabel="Add supplier"
              />
            </Field>
            <Field label="Date">
              <Input type="date" value={f.date} max={todayStr()} onChange={(e) => set("date", e.target.value)} />
            </Field>
          </div>
          <Field label="Supplier invoice / reference" optional>
            <Input value={f.invoiceRef} onChange={(e) => set("invoiceRef", e.target.value)} />
          </Field>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[15px] font-semibold">Items</h2>
            <Button size="sm" variant="soft" icon={<Plus className="size-4" />} onClick={() => setItems((rows) => [...rows, newLine()])}>
              Add line
            </Button>
          </div>
          <ul className="divide-y divide-line">
            {items.map((row, index) => {
              const p = db.products.find((x) => x.id === row.productId);
              const lineTotal = r2(parseNum(row.qty) * parseNum(row.unitCost));
              return (
                <li key={row.key} className="flex items-start gap-2 p-4">
                  <span className="mt-3 w-5 text-xs text-faint">{index + 1}</span>
                  <div className="min-w-0 flex-1 space-y-3">
                    <Field label="Product">
                      <Combobox
                        value={row.productId}
                        onChange={(v) => {
                          const prod = db.products.find((x) => x.id === v);
                          setItem(row.key, { productId: v, unitCost: prod ? String(prod.costPrice) : "" });
                        }}
                        options={productOpts}
                        placeholder="Choose product…"
                      />
                    </Field>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <Field label="Qty">
                        <NumberInput value={row.qty} onChange={(v) => setItem(row.key, { qty: v })} suffix={p ? `${p.unit}s` : undefined} />
                      </Field>
                      <Field label="Unit cost">
                        <MoneyInput value={row.unitCost} onChange={(v) => setItem(row.key, { unitCost: v })} />
                      </Field>
                      <Field label="Line total" className="col-span-2 sm:col-span-1">
                        <div className="num flex h-11 items-center rounded-xl bg-sunken px-3.5 text-[15px] font-semibold">{money(lineTotal)}</div>
                      </Field>
                    </div>
                  </div>
                  {items.length > 1 && (
                    <button type="button" aria-label="Remove line" className="mt-8 grid size-9 place-items-center rounded-lg text-muted hover:bg-danger-soft hover:text-danger" onClick={() => setItems((rows) => rows.filter((r) => r.key !== row.key))}>
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Transport / landing cost" hint="Added to stock cost, not treated as an expense." optional>
              <MoneyInput value={f.transportCost} onChange={(v) => set("transportCost", v)} />
            </Field>
            {transportCost > 0 && (
              <Field label="Transport paid from">
                <Select value={f.transportAccountId} onChange={(e) => set("transportAccountId", e.target.value)}>
                  {activeAccounts(db).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Amount paid to supplier">
              <MoneyInput value={f.amountPaid} onChange={(v) => set("amountPaid", v)} />
            </Field>
            {amountPaid > 0 && (
              <Field label="Paid from">
                <Select value={f.paymentAccountId} onChange={(e) => set("paymentAccountId", e.target.value)}>
                  {activeAccounts(db).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
          </div>
          {goodsTotal > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => set("amountPaid", String(goodsTotal))}>
                Pay for goods in full
              </Button>
              <Button size="sm" variant="ghost" onClick={() => set("amountPaid", "0")}>
                Buy on credit
              </Button>
            </div>
          )}
          <Field label="Remarks" optional>
            <Input value={f.remarks} onChange={(e) => set("remarks", e.target.value)} />
          </Field>
          <div className="rounded-xl bg-sunken px-4 py-3">
            <Line label="Goods" value={money(goodsTotal)} muted />
            {transportCost > 0 && <Line label="Transport (into stock)" value={money(transportCost)} muted />}
            <Line label="Total" value={money(total)} strong />
            <Line label="Paid now" value={money(amountPaid)} muted />
            <Line label="Still owing supplier" value={money(Math.max(0, goodsTotal - amountPaid))} strong />
          </div>
        </Card>

        <div className="flex flex-wrap gap-2 pb-8">
          <Button onClick={post}>Post purchase</Button>
          <Button variant="secondary" onClick={saveDraft}>
            Save draft
          </Button>
          <Button variant="ghost" onClick={discard}>
            {draft ? "Discard draft" : "Cancel"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function NewPurchasePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <PurchaseForm />
    </Suspense>
  );
}
