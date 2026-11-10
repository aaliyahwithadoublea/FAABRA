"use client";

import { Plus, Trash2 } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
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
  Segmented,
  Select,
} from "@/components/ui";
import { deleteDraft, postSale, productLabel, saveSaleDraft, todayStr } from "@/lib/engine";
import { editable, money, parseNum, units } from "@/lib/format";
import {
  activeAccounts,
  activeProducts,
  customerOptions,
  useCustomerBalances,
  useFields,
} from "@/lib/hooks";
import { onHand, r2 } from "@/lib/ledger";
import { toast, useAct, useDb } from "@/lib/store";
import type { ID, PriceType } from "@/lib/types";
import { openModal } from "@/lib/ui-store";

interface LineDraft {
  key: string;
  productId: ID;
  qty: string;
  unitPrice: string;
}

function newLine(): LineDraft {
  return { key: Math.random().toString(36).slice(2), productId: "", qty: "1", unitPrice: "" };
}

function SaleForm() {
  const db = useDb();
  const act = useAct();
  const router = useRouter();
  const draftId = useSearchParams().get("draft");
  const balances = useCustomerBalances();
  const draft = draftId ? db.sales.find((s) => s.id === draftId && s.status === "draft") : undefined;

  const [f, set] = useFields(() => ({
    date: draft?.date ?? todayStr(),
    customerId: draft?.customerId ?? "",
    priceType: (draft?.priceType ?? "retail") as PriceType,
    discount: editable(draft?.discount),
    amountPaid: editable(draft?.amountPaid),
    paymentAccountId: draft?.paymentAccountId ?? activeAccounts(db)[0]?.id ?? "",
    remarks: draft?.remarks ?? "",
  }));
  const [items, setItems] = useState<LineDraft[]>(() =>
    draft?.items.length
      ? draft.items.map((i) => ({
          key: Math.random().toString(36).slice(2),
          productId: i.productId,
          qty: String(i.qty),
          unitPrice: String(i.unitPrice),
        }))
      : [newLine()],
  );
  const [confirmLimit, setConfirmLimit] = useState(false);

  const customer = f.customerId ? db.customers.find((c) => c.id === f.customerId) : null;
  const parsed = items
    .filter((i) => i.productId)
    .map((i) => ({ productId: i.productId, qty: parseNum(i.qty), unitPrice: parseNum(i.unitPrice) }));
  const subtotal = r2(parsed.reduce((s, i) => s + r2(i.qty * i.unitPrice), 0));
  const discount = parseNum(f.discount);
  const total = r2(Math.max(0, subtotal - discount));
  const amountPaid = parseNum(f.amountPaid);
  const balance = r2(total - amountPaid);

  const owed = customer ? balances[customer.id] ?? 0 : 0;
  const overLimit =
    customer && customer.creditLimit > 0 && balance > 0 && owed + balance > customer.creditLimit;

  const productOpts = useMemo(
    () =>
      activeProducts(db).map((p) => ({
        value: p.id,
        label: productLabel(p),
        right: units(onHand(db, p.id).qty, p.unit),
      })),
    [db],
  );

  useEffect(() => {
    if (draftId && !draft) toast.error("That draft is no longer available.");
  }, [draftId, draft]);

  const setItem = (key: string, patch: Partial<LineDraft>) =>
    setItems((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const chooseProduct = (key: string, productId: ID) => {
    const p = db.products.find((x) => x.id === productId);
    setItem(key, {
      productId,
      unitPrice: p ? String(f.priceType === "wholesale" ? p.wholesalePrice : p.retailPrice) : "",
    });
  };

  const switchPriceType = (priceType: PriceType) => {
    set("priceType", priceType);
    setItems((rows) =>
      rows.map((r) => {
        const p = db.products.find((x) => x.id === r.productId);
        if (!p) return r;
        return { ...r, unitPrice: String(priceType === "wholesale" ? p.wholesalePrice : p.retailPrice) };
      }),
    );
  };

  const payload = () => ({
    id: draft?.id,
    date: f.date,
    customerId: f.customerId || null,
    priceType: f.priceType,
    items: parsed,
    discount,
    amountPaid,
    paymentAccountId: amountPaid > 0 ? f.paymentAccountId : null,
    remarks: f.remarks,
  });

  const saveDraft = () => {
    const id = act((d) => saveSaleDraft(d, payload()), "Draft saved");
    if (id && !draft) router.replace(`/sales/new?draft=${id}`);
  };

  const post = (allowOverLimit = false) => {
    if (overLimit && !allowOverLimit) {
      setConfirmLimit(true);
      return;
    }
    const posted = act((d) => postSale(d, payload(), { allowOverLimit }), "Sale posted");
    if (posted) router.replace(`/sales/view?id=${posted}`);
  };

  const postWithConfirm = () => {
    setConfirmLimit(false);
    const posted = act((d) => postSale(d, payload(), { allowOverLimit: true }), "Sale posted");
    if (posted) router.replace(`/sales/view?id=${posted}`);
  };

  const discard = () => {
    if (!draft) {
      router.push("/sales");
      return;
    }
    act((d) => {
      deleteDraft(d, "sale", draft.id);
      return true;
    }, "Draft discarded");
    router.push("/sales");
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={draft ? "Continue draft" : "New sale"}
        subtitle="Eggs and water can share one invoice"
        back={{ href: "/sales", label: "Sales" }}
      />

      <div className="space-y-4">
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer" hint={customer ? `Owes ${money(owed)}` : "Leave blank for a walk-in cash sale"}>
              <Combobox
                value={f.customerId}
                onChange={(v) => {
                  set("customerId", v);
                  const c = db.customers.find((x) => x.id === v);
                  if (c && (c.category === "wholesale" || c.category === "distributor")) switchPriceType("wholesale");
                }}
                options={customerOptions(db, balances)}
                emptyLabel="Walk-in customer"
                onCreate={(typed) => openModal({ type: "customer", name: typed, onSaved: (id) => set("customerId", id) })}
                createLabel="Add customer"
              />
            </Field>
            <Field label="Date">
              <Input type="date" value={f.date} max={todayStr()} onChange={(e) => set("date", e.target.value)} />
            </Field>
          </div>
          <Field label="Price list">
            <Segmented
              full
              value={f.priceType}
              onChange={switchPriceType}
              options={[
                { value: "retail", label: "Retail / B2C" },
                { value: "wholesale", label: "Wholesale / B2B" },
              ]}
            />
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
              const stock = p ? onHand(db, p.id).qty : 0;
              const lineTotal = r2(parseNum(row.qty) * parseNum(row.unitPrice));
              return (
                <li key={row.key} className="space-y-3 p-4">
                  <div className="flex items-start gap-2">
                    <span className="mt-3 w-5 text-xs text-faint">{index + 1}</span>
                    <div className="min-w-0 flex-1 space-y-3">
                      <Field label="Product">
                        <Combobox value={row.productId} onChange={(v) => chooseProduct(row.key, v)} options={productOpts} placeholder="Choose product…" />
                      </Field>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        <Field label="Qty" hint={p ? `${units(stock, p.unit)} in stock` : undefined}>
                          <NumberInput value={row.qty} onChange={(v) => setItem(row.key, { qty: v })} suffix={p ? `${p.unit}s` : undefined} />
                        </Field>
                        <Field label="Unit price">
                          <MoneyInput value={row.unitPrice} onChange={(v) => setItem(row.key, { unitPrice: v })} />
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
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Discount" optional>
              <MoneyInput value={f.discount} onChange={(v) => set("discount", v)} />
            </Field>
            <Field label="Amount paid now">
              <MoneyInput value={f.amountPaid} onChange={(v) => set("amountPaid", v)} />
            </Field>
          </div>
          {amountPaid > 0 && (
            <Field label="Paid into">
              <Select value={f.paymentAccountId} onChange={(e) => set("paymentAccountId", e.target.value)}>
                {activeAccounts(db).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {total > 0 && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" onClick={() => set("amountPaid", String(total))}>
                Paid in full
              </Button>
              {customer && (
                <Button size="sm" variant="ghost" onClick={() => set("amountPaid", "0")}>
                  Full credit
                </Button>
              )}
            </div>
          )}
          <Field label="Remarks" optional>
            <Input value={f.remarks} onChange={(e) => set("remarks", e.target.value)} />
          </Field>

          <div className="rounded-xl bg-sunken px-4 py-3">
            <Line label="Subtotal" value={money(subtotal)} muted />
            {discount > 0 && <Line label="Discount" value={`−${money(discount)}`} muted />}
            <Line label="Total" value={money(total)} strong />
            <Line label="Paid now" value={money(amountPaid)} muted />
            <Line label="Balance due" value={money(balance)} strong />
          </div>

          {balance > 0 && !customer && (
            <p className="text-sm text-danger">A walk-in sale must be paid in full, or choose a customer to sell on credit.</p>
          )}
          {overLimit && (
            <p className="rounded-xl bg-yolk-soft px-3.5 py-2.5 text-sm text-yolk-ink">
              This takes {customer!.name} above their credit limit of {money(customer!.creditLimit)} (already owes {money(owed)}).
              You can still post it if you accept the risk.
            </p>
          )}
        </Card>

        <div className="flex flex-wrap items-center gap-2 pb-8">
          <Button onClick={() => post(false)}>Post invoice</Button>
          <Button variant="secondary" onClick={saveDraft}>
            Save draft
          </Button>
          <Button variant="ghost" onClick={discard}>
            {draft ? "Discard draft" : "Cancel"}
          </Button>
        </div>
      </div>

      {confirmLimit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-brand-950/45 p-4">
          <Card className="w-full max-w-md space-y-4 p-5">
            <h2 className="text-lg font-semibold">Post above credit limit?</h2>
            <p className="text-sm text-muted">
              {customer?.name} already owes {money(owed)}. This invoice adds {money(balance)}, taking them to {money(owed + balance)} against a limit of {money(customer?.creditLimit ?? 0)}.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmLimit(false)}>
                Go back
              </Button>
              <Button onClick={postWithConfirm}>Post anyway</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function NewSalePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <SaleForm />
    </Suspense>
  );
}
