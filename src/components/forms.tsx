"use client";

import { useMemo, useState } from "react";
import { CHART, EXPENSE_CATEGORIES, STOCK_EVENT_LABELS } from "@/lib/chart";
import {
  postAdjustment,
  postCapital,
  postExpense,
  postReceipt,
  postStockEvent,
  postSupplierPayment,
  postTransfer,
  productLabel,
  reverseDoc,
  saveAccount,
  saveCustomer,
  saveProduct,
  saveSupplier,
  todayStr,
} from "@/lib/engine";
import { editable, fmtDate, money, parseNum, units } from "@/lib/format";
import {
  activeAccounts,
  customerOptions,
  productOptions,
  supplierOptions,
  useCustomerBalances,
  useFields,
  useMoneyBalances,
  useSaleOutstanding,
  useSupplierBalances,
} from "@/lib/hooks";
import { avgCost, onHand, r2 } from "@/lib/ledger";
import { useAct, useDb } from "@/lib/store";
import type { CustomerCategory, Database, ExpenseCategory, ID, ProductCategory, ReceiptAllocation, StockEventType } from "@/lib/types";
import { type ModalState, useUI } from "@/lib/ui-store";
import { Button, Combobox, Field, Input, Modal, MoneyInput, NumberInput, Segmented, Select, Textarea } from "./ui";

type Props<K extends ModalState["type"]> = Extract<ModalState, { type: K }> & { onClose: () => void };

function AccountField({
  label,
  value,
  onChange,
  exclude,
  hint,
}: {
  label: string;
  value: ID;
  onChange: (id: ID) => void;
  exclude?: ID;
  hint?: string;
}) {
  const db = useDb();
  const balances = useMoneyBalances();
  return (
    <Field label={label} hint={hint}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose account…</option>
        {activeAccounts(db)
          .filter((a) => a.id !== exclude)
          .map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({money(balances[a.id] ?? 0)})
            </option>
          ))}
      </Select>
    </Field>
  );
}

function firstAccount(db: Database, type?: "cash" | "bank"): ID {
  const list = activeAccounts(db);
  return (list.find((a) => !type || a.type === type) ?? list[0])?.id ?? "";
}

function Footer({ onClose, submit, danger }: { onClose: () => void; submit: string; danger?: boolean }) {
  return (
    <>
      <Button variant="ghost" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" variant={danger ? "danger" : "primary"}>
        {submit}
      </Button>
    </>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-sunken px-3.5 py-2.5 text-[13px] leading-relaxed text-muted">{children}</p>;
}

/* --------------------------- Customer payment --------------------------- */

export function ReceiptForm({ customerId: initialCustomer, saleId, onClose }: Props<"receipt">) {
  const db = useDb();
  const act = useAct();
  const balances = useCustomerBalances();
  const outstanding = useSaleOutstanding();
  const [f, set] = useFields(() => ({
    date: todayStr(),
    customerId: initialCustomer ?? "",
    amount: saleId && outstanding[saleId] ? String(outstanding[saleId]) : "",
    accountId: firstAccount(db),
    reference: "",
    remarks: "",
  }));
  /** Amounts typed against invoices; null means "spread automatically, oldest first". */
  const [manual, setManual] = useState<Record<ID, string> | null>(null);

  const openInvoices = useMemo(() => {
    const list = db.sales
      .filter((s) => s.status === "posted" && s.customerId === f.customerId && (outstanding[s.id] ?? 0) > 0)
      .sort((a, b) => (a.date === b.date ? a.number.localeCompare(b.number) : a.date.localeCompare(b.date)));
    // An invoice the user came from is settled first.
    return saleId ? [...list.filter((s) => s.id === saleId), ...list.filter((s) => s.id !== saleId)] : list;
  }, [db.sales, f.customerId, outstanding, saleId]);

  const amount = parseNum(f.amount);
  const allocations: ReceiptAllocation[] = useMemo(() => {
    if (manual) {
      return openInvoices.map((s) => ({ saleId: s.id, amount: r2(parseNum(manual[s.id])) })).filter((a) => a.amount > 0);
    }
    let left = amount;
    const out: ReceiptAllocation[] = [];
    for (const s of openInvoices) {
      if (left <= 0) break;
      const take = Math.min(left, outstanding[s.id]);
      out.push({ saleId: s.id, amount: r2(take) });
      left = r2(left - take);
    }
    return out;
  }, [manual, openInvoices, amount, outstanding]);
  const allocated = r2(allocations.reduce((s, a) => s + a.amount, 0));
  const owed = balances[f.customerId] ?? 0;

  const submit = () => {
    const id = act(
      (d) =>
        postReceipt(d, {
          date: f.date,
          customerId: f.customerId,
          amount,
          accountId: f.accountId,
          allocations,
          reference: f.reference,
          remarks: f.remarks,
        }),
      "Payment recorded",
    );
    if (id) onClose();
  };

  return (
    <Modal onClose={onClose} title="Receive payment" subtitle="Money paid by a customer against what they owe." onSubmit={submit} footer={<Footer onClose={onClose} submit="Record payment" />}>
      <div className="space-y-4">
        <Field label="Customer" hint={f.customerId ? `Currently owes ${money(owed)}` : undefined}>
          <Combobox
            value={f.customerId}
            onChange={(v) => {
              set("customerId", v);
              setManual(null);
            }}
            options={customerOptions(db, balances)}
            placeholder="Choose customer…"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount received">
            <MoneyInput value={f.amount} onChange={(v) => set("amount", v)} autoFocus={Boolean(initialCustomer)} />
          </Field>
          <Field label="Date">
            <Input type="date" value={f.date} max={todayStr()} onChange={(e) => set("date", e.target.value)} />
          </Field>
        </div>
        {owed > 0 && amount !== owed && (
          <button type="button" className="-mt-2 text-[13px] font-medium text-brand-700 hover:underline" onClick={() => set("amount", String(owed))}>
            Use full balance ({money(owed)})
          </button>
        )}
        <AccountField label="Received into" value={f.accountId} onChange={(v) => set("accountId", v)} />

        {openInvoices.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[13px] font-medium text-ink">Invoices being paid</span>
              {manual ? (
                <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setManual(null)}>
                  Spread automatically
                </button>
              ) : (
                <span className="text-xs text-faint">Oldest first · edit to change</span>
              )}
            </div>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {openInvoices.map((s) => {
                const applied = allocations.find((a) => a.saleId === s.id)?.amount ?? 0;
                return (
                  <li key={s.id} className="flex items-center gap-3 px-3.5 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{s.number}</p>
                      <p className="text-xs text-muted">
                        {fmtDate(s.date)} · {money(outstanding[s.id])} unpaid
                      </p>
                    </div>
                    <div className="w-32">
                      <MoneyInput
                        aria-label={`Amount for ${s.number}`}
                        align="right"
                        className="h-9"
                        value={manual ? (manual[s.id] ?? "") : editable(applied)}
                        onChange={(v) => {
                          const base = manual ?? Object.fromEntries(allocations.map((a) => [a.saleId, String(a.amount)]));
                          setManual({ ...base, [s.id]: v });
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            {allocated > amount ? (
              <p className="mt-1.5 text-xs font-medium text-danger">The invoices add up to {money(allocated)}, more than the amount received.</p>
            ) : amount > allocated && amount > 0 ? (
              <p className="mt-1.5 text-xs text-muted">{money(amount - allocated)} is not matched to an invoice and will sit on the customer&apos;s account.</p>
            ) : null}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Transaction reference" optional>
            <Input value={f.reference} onChange={(e) => set("reference", e.target.value)} placeholder="Transfer or teller no." />
          </Field>
          <Field label="Remarks" optional>
            <Input value={f.remarks} onChange={(e) => set("remarks", e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* --------------------------- Supplier payment --------------------------- */

export function SupplierPaymentForm({ supplierId, onClose }: Props<"supplierPayment">) {
  const db = useDb();
  const act = useAct();
  const balances = useSupplierBalances();
  const [f, set] = useFields(() => ({
    date: todayStr(),
    supplierId: supplierId ?? "",
    amount: "",
    accountId: firstAccount(db, "bank"),
    reference: "",
    remarks: "",
  }));
  const owed = balances[f.supplierId] ?? 0;
  const amount = parseNum(f.amount);

  const submit = () => {
    const id = act(
      (d) => postSupplierPayment(d, { date: f.date, supplierId: f.supplierId, amount, accountId: f.accountId, reference: f.reference, remarks: f.remarks }),
      "Supplier payment recorded",
    );
    if (id) onClose();
  };

  return (
    <Modal onClose={onClose} title="Pay supplier" subtitle="Money paid to a supplier for goods already bought." onSubmit={submit} footer={<Footer onClose={onClose} submit="Record payment" />}>
      <div className="space-y-4">
        <Field label="Supplier" hint={f.supplierId ? `You owe ${money(owed)}` : undefined}>
          <Combobox value={f.supplierId} onChange={(v) => set("supplierId", v)} options={supplierOptions(db, balances)} placeholder="Choose supplier…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount paid">
            <MoneyInput value={f.amount} onChange={(v) => set("amount", v)} />
          </Field>
          <Field label="Date">
            <Input type="date" value={f.date} max={todayStr()} onChange={(e) => set("date", e.target.value)} />
          </Field>
        </div>
        {owed > 0 && amount !== owed && (
          <button type="button" className="-mt-2 text-[13px] font-medium text-brand-700 hover:underline" onClick={() => set("amount", String(owed))}>
            Pay full balance ({money(owed)})
          </button>
        )}
        {amount > owed && f.supplierId && <Note>This is {money(amount - owed)} more than you owe. The extra will show as an advance held by the supplier.</Note>}
        <AccountField label="Paid from" value={f.accountId} onChange={(v) => set("accountId", v)} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Transaction reference" optional>
            <Input value={f.reference} onChange={(e) => set("reference", e.target.value)} />
          </Field>
          <Field label="Remarks" optional>
            <Input value={f.remarks} onChange={(e) => set("remarks", e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------- Expense -------------------------------- */

export function ExpenseForm({ onClose }: Props<"expense">) {
  const db = useDb();
  const act = useAct();
  const open = useUI((s) => s.open);
  const [f, set] = useFields(() => ({
    date: todayStr(),
    category: "6000" as ExpenseCategory,
    description: "",
    amount: "",
    accountId: firstAccount(db, "cash"),
    reference: "",
  }));

  const submit = () => {
    const id = act(
      (d) => postExpense(d, { date: f.date, category: f.category, description: f.description, amount: parseNum(f.amount), accountId: f.accountId, reference: f.reference }),
      "Expense recorded",
    );
    if (id) onClose();
  };

  return (
    <Modal onClose={onClose} title="Record expense" subtitle="A cost of running the business." onSubmit={submit} footer={<Footer onClose={onClose} submit="Record expense" />}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={f.category} onChange={(e) => set("category", e.target.value as ExpenseCategory)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CHART[c].name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date">
            <Input type="date" value={f.date} max={todayStr()} onChange={(e) => set("date", e.target.value)} />
          </Field>
        </div>
        <Field label="Description">
          <Input value={f.description} onChange={(e) => set("description", e.target.value)} placeholder="What was it for?" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <MoneyInput value={f.amount} onChange={(v) => set("amount", v)} />
          </Field>
          <Field label="Receipt / reference" optional>
            <Input value={f.reference} onChange={(e) => set("reference", e.target.value)} />
          </Field>
        </div>
        <AccountField label="Paid from" value={f.accountId} onChange={(v) => set("accountId", v)} />
        <Note>
          Money you take for personal use is not a business expense.{" "}
          <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => open({ type: "capital", entryType: "drawing" })}>
            Record it as owner&apos;s drawings
          </button>
          . Transport that brings goods in belongs on the purchase, so it is added to stock cost.
        </Note>
      </div>
    </Modal>
  );
}

/* -------------------------------- Transfer ------------------------------- */

export function TransferForm({ onClose }: Props<"transfer">) {
  const db = useDb();
  const act = useAct();
  const [f, set] = useFields(() => ({
    date: todayStr(),
    fromAccountId: firstAccount(db, "cash"),
    toAccountId: firstAccount(db, "bank") === firstAccount(db, "cash") ? "" : firstAccount(db, "bank"),
    amount: "",
    remarks: "",
  }));

  const submit = () => {
    const id = act(
      (d) => postTransfer(d, { date: f.date, fromAccountId: f.fromAccountId, toAccountId: f.toAccountId, amount: parseNum(f.amount), remarks: f.remarks }),
      "Transfer recorded",
    );
    if (id) onClose();
  };

  return (
    <Modal onClose={onClose} title="Move money" subtitle="Bank deposits, cash withdrawals and transfers between your accounts." onSubmit={submit} footer={<Footer onClose={onClose} submit="Record transfer" />}>
      <div className="space-y-4">
        <AccountField label="From" value={f.fromAccountId} onChange={(v) => set("fromAccountId", v)} />
        <AccountField label="To" value={f.toAccountId} onChange={(v) => set("toAccountId", v)} exclude={f.fromAccountId} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <MoneyInput value={f.amount} onChange={(v) => set("amount", v)} />
          </Field>
          <Field label="Date">
            <Input type="date" value={f.date} max={todayStr()} onChange={(e) => set("date", e.target.value)} />
          </Field>
        </div>
        <Field label="Remarks" optional>
          <Input value={f.remarks} onChange={(e) => set("remarks", e.target.value)} />
        </Field>
        <Note>A transfer only moves money between your own accounts. It is never counted as income or expense.</Note>
      </div>
    </Modal>
  );
}

/* --------------------------- Capital & drawings -------------------------- */

export function CapitalForm({ entryType, onClose }: Props<"capital">) {
  const db = useDb();
  const act = useAct();
  const [f, set] = useFields(() => ({
    type: entryType ?? ("capital" as "capital" | "drawing"),
    date: todayStr(),
    amount: "",
    accountId: firstAccount(db),
    remarks: "",
  }));
  const isCapital = f.type === "capital";

  const submit = () => {
    const id = act(
      (d) => postCapital(d, { date: f.date, type: f.type, amount: parseNum(f.amount), accountId: f.accountId, remarks: f.remarks }),
      isCapital ? "Capital recorded" : "Drawing recorded",
    );
    if (id) onClose();
  };

  return (
    <Modal onClose={onClose} title="Owner's money" subtitle="Keep your personal money separate from the business." onSubmit={submit} footer={<Footer onClose={onClose} submit={isCapital ? "Record capital" : "Record drawing"} />}>
      <div className="space-y-4">
        <Segmented
          full
          value={f.type}
          onChange={(v) => set("type", v)}
          options={[
            { value: "capital", label: "Money I put in" },
            { value: "drawing", label: "Money I took out" },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <MoneyInput value={f.amount} onChange={(v) => set("amount", v)} />
          </Field>
          <Field label="Date">
            <Input type="date" value={f.date} max={todayStr()} onChange={(e) => set("date", e.target.value)} />
          </Field>
        </div>
        <AccountField label={isCapital ? "Paid into" : "Taken from"} value={f.accountId} onChange={(v) => set("accountId", v)} />
        <Field label="Remarks" optional>
          <Input value={f.remarks} onChange={(e) => set("remarks", e.target.value)} />
        </Field>
        <Note>{isCapital ? "Capital you introduce is not sales income. It increases what the business owes you as owner." : "Personal withdrawals are not business expenses. They reduce your capital, not your profit."}</Note>
      </div>
    </Modal>
  );
}

/* --------------------------- Account adjustment -------------------------- */

export function AdjustmentForm({ partyType, partyId, onClose }: Props<"adjustment">) {
  const db = useDb();
  const act = useAct();
  const isCustomer = partyType === "customer";
  const party = isCustomer ? db.customers.find((c) => c.id === partyId) : db.suppliers.find((s) => s.id === partyId);
  const [f, set] = useFields(() => ({ direction: "decrease" as "increase" | "decrease", date: todayStr(), amount: "", reason: "" }));

  const submit = () => {
    const id = act(
      (d) => postAdjustment(d, { date: f.date, partyType, partyId, direction: f.direction, amount: parseNum(f.amount), reason: f.reason }),
      "Adjustment recorded",
    );
    if (id) onClose();
  };

  const effect = isCustomer
    ? f.direction === "decrease"
      ? "Reduces what the customer owes and records the amount as a bad debt written off."
      : "Increases what the customer owes and records the amount as other income."
    : f.direction === "decrease"
      ? "Reduces what you owe the supplier and records the amount as other income (for example a discount received)."
      : "Increases what you owe the supplier and records the amount as an expense.";

  return (
    <Modal onClose={onClose} title="Adjust account" subtitle={party?.name} onSubmit={submit} footer={<Footer onClose={onClose} submit="Record adjustment" />}>
      <div className="space-y-4">
        <Segmented
          full
          value={f.direction}
          onChange={(v) => set("direction", v)}
          options={[
            { value: "decrease", label: "Reduce balance" },
            { value: "increase", label: "Increase balance" },
          ]}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount">
            <MoneyInput value={f.amount} onChange={(v) => set("amount", v)} />
          </Field>
          <Field label="Date">
            <Input type="date" value={f.date} max={todayStr()} onChange={(e) => set("date", e.target.value)} />
          </Field>
        </div>
        <Field label="Reason">
          <Textarea value={f.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Why is this adjustment needed?" />
        </Field>
        <Note>{effect} Use this only for corrections that are not a sale, purchase, payment or return.</Note>
      </div>
    </Modal>
  );
}

/* ------------------------------ Stock events ----------------------------- */

const EVENT_HELP: Record<StockEventType, string> = {
  opening: "Stock you already had when you started using this app. Added at the cost you enter.",
  customer_return: "Goods a customer brought back. Their account is credited or they are refunded.",
  supplier_return: "Goods sent back to a supplier. What you owe them is reduced, or they refund you.",
  breakage: "Broken eggs or damaged water. Taken out of stock and charged to Breakages and losses.",
  internal_use: "Goods used by the business or taken home. Taken out of stock at cost.",
  adjustment_in: "A count found more than the books show. Added at the cost you enter.",
  adjustment_out: "A count found less than the books show. Removed at average cost.",
};

export function StockEventForm({ eventType, productId, onClose }: Props<"stockEvent">) {
  const db = useDb();
  const act = useAct();
  const customerBalances = useCustomerBalances();
  const supplierBalances = useSupplierBalances();
  const [f, set, setAll] = useFields(() => ({
    type: eventType ?? ("breakage" as StockEventType),
    date: todayStr(),
    productId: productId ?? "",
    qty: "",
    unitValue: "",
    reason: "",
    customerId: "",
    supplierId: "",
    saleId: "",
    settlement: "credit" as "credit" | "refund",
    accountId: firstAccount(db, "cash"),
    restock: true,
    chargeTo: "expense" as "expense" | "drawings",
  }));

  const product = db.products.find((p) => p.id === f.productId);
  const stock = product ? onHand(db, product.id) : { qty: 0, value: 0 };
  const average = product ? avgCost(db, product.id) : 0;
  const qty = parseNum(f.qty);
  const needsValue = f.type === "opening" || f.type === "adjustment_in" || f.type === "customer_return" || f.type === "supplier_return";
  const isReturn = f.type === "customer_return" || f.type === "supplier_return";

  /** A sensible per-unit figure for the chosen event, so the user rarely has to type one. */
  const suggest = (type: StockEventType, pid: string, saleId = ""): string => {
    const p = db.products.find((x) => x.id === pid);
    if (!p) return "";
    if (type === "customer_return") {
      const sold = db.sales.find((s) => s.id === saleId)?.items.find((i) => i.productId === pid);
      return editable(sold?.unitPrice ?? p.retailPrice);
    }
    if (type === "opening" || type === "adjustment_in" || type === "supplier_return") {
      return editable(r2(avgCost(db, pid) || p.costPrice));
    }
    return "";
  };

  const invoices = useMemo(
    () =>
      f.type === "customer_return" && f.productId
        ? db.sales
            .filter((s) => s.status === "posted" && (s.customerId ?? "") === f.customerId && s.items.some((i) => i.productId === f.productId))
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 30)
        : [],
    [db.sales, f.type, f.customerId, f.productId],
  );

  const submit = () => {
    const id = act(
      (d) =>
        postStockEvent(d, {
          date: f.date,
          type: f.type,
          productId: f.productId,
          qty,
          unitValue: needsValue ? parseNum(f.unitValue) : 0,
          reason: f.reason,
          customerId: f.customerId || null,
          supplierId: f.supplierId || null,
          saleId: f.saleId || null,
          settlement: f.settlement,
          accountId: f.accountId || null,
          restock: f.restock,
          chargeTo: f.chargeTo,
        }),
      `${STOCK_EVENT_LABELS[f.type]} recorded`,
    );
    if (id) onClose();
  };

  const worth = needsValue ? r2(qty * parseNum(f.unitValue)) : r2(qty * average);

  return (
    <Modal onClose={onClose} title="Stock entry" subtitle="Returns, damages, consumption and stock counts." onSubmit={submit} footer={<Footer onClose={onClose} submit="Record entry" />}>
      <div className="space-y-4">
        <Field label="What happened?" hint={EVENT_HELP[f.type]}>
          <Select
            value={f.type}
            onChange={(e) => {
              const type = e.target.value as StockEventType;
              setAll((prev) => ({ ...prev, type, saleId: "", unitValue: suggest(type, prev.productId) }));
            }}
          >
            {(Object.keys(STOCK_EVENT_LABELS) as StockEventType[]).map((t) => (
              <option key={t} value={t}>
                {STOCK_EVENT_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>

        {f.type === "customer_return" && (
          <Field label="Customer">
            <Combobox
              value={f.customerId}
              onChange={(v) => setAll((prev) => ({ ...prev, customerId: v, saleId: "", settlement: v ? prev.settlement : "refund" }))}
              options={customerOptions(db, customerBalances)}
              emptyLabel="Walk-in customer"
            />
          </Field>
        )}
        {f.type === "supplier_return" && (
          <Field label="Supplier">
            <Combobox value={f.supplierId} onChange={(v) => set("supplierId", v)} options={supplierOptions(db, supplierBalances)} placeholder="Choose supplier…" />
          </Field>
        )}

        <Field label="Product" hint={product ? `${units(stock.qty, product.unit)} in stock${average ? ` · average cost ${money(r2(average))}` : ""}` : undefined}>
          <Combobox
            value={f.productId}
            onChange={(v) => setAll((prev) => ({ ...prev, productId: v, saleId: "", unitValue: suggest(prev.type, v) }))}
            options={productOptions(db, true)}
            placeholder="Choose product…"
          />
        </Field>

        {f.type === "customer_return" && invoices.length > 0 && (
          <Field label="From which invoice?" optional hint="Linking the invoice reduces what is unpaid on it.">
            <Select value={f.saleId} onChange={(e) => setAll((prev) => ({ ...prev, saleId: e.target.value, unitValue: suggest(prev.type, prev.productId, e.target.value) }))}>
              <option value="">Not linked to an invoice</option>
              {invoices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.number} · {fmtDate(s.date)} · {money(s.total)}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity">
            <NumberInput value={f.qty} onChange={(v) => set("qty", v)} suffix={product ? `${product.unit}s` : undefined} placeholder="0" />
          </Field>
          {needsValue ? (
            <Field label={f.type === "customer_return" ? "Refund per unit" : f.type === "supplier_return" ? "Credit per unit" : "Cost per unit"}>
              <MoneyInput value={f.unitValue} onChange={(v) => set("unitValue", v)} />
            </Field>
          ) : (
            <Field label="Date">
              <Input type="date" value={f.date} max={todayStr()} onChange={(e) => set("date", e.target.value)} />
            </Field>
          )}
        </div>
        {needsValue && (
          <Field label="Date">
            <Input type="date" value={f.date} max={todayStr()} onChange={(e) => set("date", e.target.value)} />
          </Field>
        )}

        {isReturn && (
          <Field label={f.type === "customer_return" ? "How is the customer settled?" : "How does the supplier settle?"}>
            <Segmented
              full
              value={f.settlement}
              onChange={(v) => set("settlement", v)}
              options={[
                { value: "credit", label: f.type === "customer_return" ? "Credit their account" : "Reduce what I owe" },
                { value: "refund", label: f.type === "customer_return" ? "Refund money" : "They refund money" },
              ]}
            />
          </Field>
        )}
        {isReturn && f.settlement === "refund" && (
          <AccountField label={f.type === "customer_return" ? "Refund paid from" : "Refund received into"} value={f.accountId} onChange={(v) => set("accountId", v)} />
        )}
        {f.type === "customer_return" && (
          <Field label="Condition of the goods">
            <Segmented
              full
              value={f.restock ? "yes" : "no"}
              onChange={(v) => set("restock", v === "yes")}
              options={[
                { value: "yes", label: "Good: back to stock" },
                { value: "no", label: "Damaged: write off" },
              ]}
            />
          </Field>
        )}
        {f.type === "internal_use" && (
          <Field label="Who used it?">
            <Segmented
              full
              value={f.chargeTo}
              onChange={(v) => set("chargeTo", v)}
              options={[
                { value: "expense", label: "The business" },
                { value: "drawings", label: "Owner (personal)" },
              ]}
            />
          </Field>
        )}

        <Field label={isReturn || f.type === "opening" ? "Reason / remarks" : "Reason"} optional={isReturn || f.type === "opening"}>
          <Input value={f.reason} onChange={(e) => set("reason", e.target.value)} placeholder={f.type === "breakage" ? "e.g. Crates fell while offloading" : ""} />
        </Field>

        {product && qty > 0 && (
          <Note>
            {units(qty, product.unit)} of {productLabel(product)}
            {worth > 0 ? `, worth about ${money(worth)}` : ""}.
            {!needsValue && qty > stock.qty ? " This is more than the stock on hand." : ""}
          </Note>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------- Registers ------------------------------- */

export function ProductForm({ id, onClose }: Props<"product">) {
  const db = useDb();
  const act = useAct();
  const existing = db.products.find((p) => p.id === id);
  const [f, set] = useFields(() => ({
    name: existing?.name ?? "",
    category: existing?.category ?? ("eggs" as ProductCategory),
    unit: existing?.unit ?? "crate",
    description: existing?.description ?? "",
    costPrice: editable(existing?.costPrice),
    wholesalePrice: editable(existing?.wholesalePrice),
    retailPrice: editable(existing?.retailPrice),
    lowStockLevel: editable(existing?.lowStockLevel),
    active: existing?.active ?? true,
  }));

  const submit = () => {
    const saved = act(
      (d) =>
        saveProduct(
          d,
          {
            name: f.name,
            category: f.category,
            unit: f.unit,
            description: f.description,
            costPrice: parseNum(f.costPrice),
            wholesalePrice: parseNum(f.wholesalePrice),
            retailPrice: parseNum(f.retailPrice),
            lowStockLevel: parseNum(f.lowStockLevel),
            active: f.active,
          },
          id,
        ),
      existing ? "Product updated" : "Product added",
    );
    if (saved) onClose();
  };

  return (
    <Modal onClose={onClose} title={existing ? `Edit ${productLabel(existing)}` : "New product"} subtitle={existing?.code} onSubmit={submit} footer={<Footer onClose={onClose} submit="Save product" />}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select
              value={f.category}
              onChange={(e) => {
                const category = e.target.value as ProductCategory;
                set("category", category);
                if (!existing) set("unit", category === "eggs" ? "crate" : "pack");
              }}
            >
              <option value="eggs">Eggs</option>
              <option value="water">Water</option>
            </Select>
          </Field>
          <Field label="Unit" hint="Singular, e.g. crate">
            <Input value={f.unit} onChange={(e) => set("unit", e.target.value)} />
          </Field>
        </div>
        <Field label={f.category === "eggs" ? "Size / name" : "Name"}>
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={f.category === "eggs" ? "e.g. Jumbo" : "e.g. Cway water"} autoFocus={!existing} />
        </Field>
        <Field label="Description" optional>
          <Input value={f.description} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Purchase price">
            <MoneyInput value={f.costPrice} onChange={(v) => set("costPrice", v)} />
          </Field>
          <Field label="Wholesale price">
            <MoneyInput value={f.wholesalePrice} onChange={(v) => set("wholesalePrice", v)} />
          </Field>
          <Field label="Retail price">
            <MoneyInput value={f.retailPrice} onChange={(v) => set("retailPrice", v)} />
          </Field>
        </div>
        <Field label="Low-stock alert level" hint="You are warned when stock falls to this quantity or below. Leave empty for no alert.">
          <NumberInput value={f.lowStockLevel} onChange={(v) => set("lowStockLevel", v)} suffix={`${f.unit || "unit"}s`} placeholder="0" />
        </Field>
        {existing && (
          <label className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-3">
            <input type="checkbox" className="size-4 accent-brand-600" checked={f.active} onChange={(e) => set("active", e.target.checked)} />
            <span className="text-sm text-ink">Active: show this product when selling and buying</span>
          </label>
        )}
      </div>
    </Modal>
  );
}

export function CustomerForm({ id, name, onSaved, onClose }: Props<"customer">) {
  const db = useDb();
  const act = useAct();
  const existing = db.customers.find((c) => c.id === id);
  const [f, set] = useFields(() => ({
    name: existing?.name ?? name ?? "",
    phone: existing?.phone ?? "",
    address: existing?.address ?? "",
    category: existing?.category ?? ("retail" as CustomerCategory),
    creditLimit: editable(existing?.creditLimit),
    openingBalance: editable(existing?.openingBalance),
  }));

  const submit = () => {
    const saved = act(
      (d) =>
        saveCustomer(
          d,
          { name: f.name, phone: f.phone, address: f.address, category: f.category, creditLimit: parseNum(f.creditLimit), openingBalance: parseNum(f.openingBalance) },
          id,
        ),
      existing ? "Customer updated" : "Customer added",
    );
    if (saved) {
      onClose();
      onSaved?.(saved);
    }
  };

  return (
    <Modal onClose={onClose} title={existing ? "Edit customer" : "New customer"} subtitle={existing?.code} onSubmit={submit} footer={<Footer onClose={onClose} submit="Save customer" />}>
      <div className="space-y-4">
        <Field label="Customer name">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus={!existing} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" optional>
            <Input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Category">
            <Select value={f.category} onChange={(e) => set("category", e.target.value as CustomerCategory)}>
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
              <option value="distributor">Distributor</option>
            </Select>
          </Field>
        </div>
        <Field label="Address" optional>
          <Input value={f.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Credit limit" hint="Leave empty for no limit.">
            <MoneyInput value={f.creditLimit} onChange={(v) => set("creditLimit", v)} />
          </Field>
          <Field label="Opening balance" hint="What they already owed you before this app.">
            <MoneyInput value={f.openingBalance} onChange={(v) => set("openingBalance", v)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export function SupplierForm({ id, name, onSaved, onClose }: Props<"supplier">) {
  const db = useDb();
  const act = useAct();
  const existing = db.suppliers.find((s) => s.id === id);
  const [f, set] = useFields(() => ({
    name: existing?.name ?? name ?? "",
    phone: existing?.phone ?? "",
    address: existing?.address ?? "",
    openingBalance: editable(existing?.openingBalance),
  }));

  const submit = () => {
    const saved = act(
      (d) => saveSupplier(d, { name: f.name, phone: f.phone, address: f.address, openingBalance: parseNum(f.openingBalance) }, id),
      existing ? "Supplier updated" : "Supplier added",
    );
    if (saved) {
      onClose();
      onSaved?.(saved);
    }
  };

  return (
    <Modal onClose={onClose} title={existing ? "Edit supplier" : "New supplier"} subtitle={existing?.code} onSubmit={submit} footer={<Footer onClose={onClose} submit="Save supplier" />}>
      <div className="space-y-4">
        <Field label="Supplier / owner name">
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus={!existing} />
        </Field>
        <Field label="Phone" optional>
          <Input type="tel" inputMode="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Address" optional>
          <Input value={f.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field label="Opening balance" hint="What you already owed them before this app.">
          <MoneyInput value={f.openingBalance} onChange={(v) => set("openingBalance", v)} />
        </Field>
      </div>
    </Modal>
  );
}

export function AccountForm({ id, accountType, onClose }: Props<"account">) {
  const db = useDb();
  const act = useAct();
  const existing = db.accounts.find((a) => a.id === id);
  const [f, set] = useFields(() => ({
    name: existing?.name ?? "",
    type: existing?.type ?? accountType ?? ("bank" as "cash" | "bank"),
    bankName: existing?.bankName ?? "",
    accountNumber: existing?.accountNumber ?? "",
    openingBalance: editable(existing?.openingBalance),
    active: existing?.active ?? true,
  }));

  const submit = () => {
    const saved = act(
      (d) => saveAccount(d, { name: f.name, type: f.type, bankName: f.bankName, accountNumber: f.accountNumber, openingBalance: parseNum(f.openingBalance), active: f.active }, id),
      existing ? "Account updated" : "Account added",
    );
    if (saved) onClose();
  };

  return (
    <Modal onClose={onClose} title={existing ? "Edit account" : "New account"} onSubmit={submit} footer={<Footer onClose={onClose} submit="Save account" />}>
      <div className="space-y-4">
        {!existing && (
          <Segmented
            full
            value={f.type}
            onChange={(v) => set("type", v)}
            options={[
              { value: "bank", label: "Bank account" },
              { value: "cash", label: "Cash" },
            ]}
          />
        )}
        <Field label="Name" hint={f.type === "bank" ? "How you refer to it, e.g. UBA business account." : "e.g. Shop till, Petty cash."}>
          <Input value={f.name} onChange={(e) => set("name", e.target.value)} autoFocus={!existing} />
        </Field>
        {f.type === "bank" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bank" optional>
              <Input value={f.bankName} onChange={(e) => set("bankName", e.target.value)} />
            </Field>
            <Field label="Account number" optional>
              <Input inputMode="numeric" value={f.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
            </Field>
          </div>
        )}
        <Field label="Opening balance" hint="The balance on the day you started using this app.">
          <MoneyInput value={f.openingBalance} onChange={(v) => set("openingBalance", v)} />
        </Field>
        {existing && (
          <label className="flex items-center gap-3 rounded-xl border border-line px-3.5 py-3">
            <input type="checkbox" className="size-4 accent-brand-600" checked={f.active} onChange={(e) => set("active", e.target.checked)} />
            <span className="text-sm text-ink">Active: offer this account when recording money</span>
          </label>
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------- Reversal ------------------------------- */

export function ReverseDialog({ docType, id, number, label, onClose }: Props<"reverse">) {
  const act = useAct();
  const [reason, setReason] = useState("");

  const submit = () => {
    const done = act((d) => {
      reverseDoc(d, docType, id, reason);
      return true;
    }, `${number} reversed`);
    if (done) onClose();
  };

  return (
    <Modal size="sm" onClose={onClose} title={`Reverse ${number}?`} subtitle={label} onSubmit={submit} footer={<Footer onClose={onClose} submit="Reverse entry" danger />}>
      <div className="space-y-4">
        <Note>
          Nothing is deleted. {number} stays on record marked as reversed, and matching opposite entries correct your stock, balances and reports. If it
          was simply entered wrongly, reverse it and enter it again correctly.
        </Note>
        <Field label="Reason for reversal">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wrong quantity entered" autoFocus />
        </Field>
      </div>
    </Modal>
  );
}
