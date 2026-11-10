/**
 * The accounting engine. Every function here mutates a Database draft and
 * either completes fully or throws an AppError. Callers run them through
 * `apply()` (immer), so a throw leaves the stored books untouched.
 *
 * Rules enforced here:
 *  - every posting is a balanced double entry;
 *  - stock is valued at weighted average cost;
 *  - posted documents are never edited or deleted, only reversed.
 */
import { produce } from "immer";
import { CHART } from "./chart";
import { AppError, avgCost, onHand, partyBalance, r2, r3, saleOutstanding } from "./ledger";
import type {
  AccountCode,
  BusinessSettings,
  CapitalEntry,
  Customer,
  CustomerCategory,
  Database,
  Expense,
  ExpenseCategory,
  ID,
  JournalLine,
  MoneyAccount,
  MovementType,
  PartyAdjustment,
  PriceType,
  Product,
  ProductCategory,
  Purchase,
  Receipt,
  ReceiptAllocation,
  Sale,
  SourceType,
  StockEvent,
  StockEventType,
  Supplier,
  SupplierPayment,
  Transfer,
} from "./types";

export const DB_VERSION = 1;

/* ------------------------------------------------------------------ */
/* Basics                                                              */
/* ------------------------------------------------------------------ */

export function uid(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayStr(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Run an engine function against a copy of the books. Throws leave `db` unchanged. */
export function apply<T>(db: Database, fn: (draft: Database) => T): [Database, T] {
  let result!: T;
  const next = produce(db, (draft) => {
    result = fn(draft as Database);
  });
  return [next, result];
}

function nextNumber(db: Database, prefix: string, width = 5): string {
  const n = (db.counters[prefix] ?? 0) + 1;
  db.counters[prefix] = n;
  return `${prefix}-${String(n).padStart(width, "0")}`;
}

function audit(db: Database, action: string, entity: string, ref: string, summary: string) {
  db.audit.push({ id: uid(), at: nowIso(), action, entity, ref, summary });
}

function checkDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw new AppError("Enter a valid date.");
  }
  return date;
}

function amount(n: number, label: string, { positive = false } = {}): number {
  if (typeof n !== "number" || !Number.isFinite(n)) throw new AppError(`${label} must be a number.`);
  const v = r2(n);
  if (v < 0) throw new AppError(`${label} cannot be negative.`);
  if (positive && v === 0) throw new AppError(`${label} must be more than zero.`);
  return v;
}

function quantity(n: number, label = "Quantity"): number {
  if (typeof n !== "number" || !Number.isFinite(n)) throw new AppError(`${label} must be a number.`);
  const v = r3(n);
  if (v <= 0) throw new AppError(`${label} must be more than zero.`);
  return v;
}

function getProduct(db: Database, id: ID): Product {
  const p = db.products.find((x) => x.id === id);
  if (!p) throw new AppError("Product not found.");
  return p;
}

function getCustomer(db: Database, id: ID): Customer {
  const c = db.customers.find((x) => x.id === id);
  if (!c) throw new AppError("Customer not found.");
  return c;
}

function getSupplier(db: Database, id: ID): Supplier {
  const s = db.suppliers.find((x) => x.id === id);
  if (!s) throw new AppError("Supplier not found.");
  return s;
}

function getAccount(db: Database, id: ID | null | undefined): MoneyAccount {
  const a = id ? db.accounts.find((x) => x.id === id) : undefined;
  if (!a) throw new AppError("Choose the cash or bank account.");
  return a;
}

function moneyCode(a: MoneyAccount): AccountCode {
  return a.type === "cash" ? "1000" : "1100";
}

function moneyLine(db: Database, accountId: ID | null | undefined, debit: number, credit: number, note?: string): JournalLine {
  const a = getAccount(db, accountId);
  return { account: moneyCode(a), debit, credit, moneyAccountId: a.id, note };
}

export function productLabel(p: Pick<Product, "name" | "category">): string {
  return p.category === "eggs" && !/egg/i.test(p.name) ? `${p.name} eggs` : p.name;
}

/* ------------------------------------------------------------------ */
/* Journal                                                             */
/* ------------------------------------------------------------------ */

interface EntryInput {
  date: string;
  sourceType: SourceType;
  sourceId: ID;
  ref: string;
  memo: string;
  lines: JournalLine[];
  reversal?: boolean;
}

function postEntry(db: Database, e: EntryInput) {
  const lines: JournalLine[] = [];
  let dr = 0;
  let cr = 0;
  for (const raw of e.lines) {
    // A negative debit is a credit and vice versa.
    const net = r2(raw.debit - raw.credit);
    if (net === 0) continue;
    const line: JournalLine = { ...raw, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
    if (!CHART[line.account]) throw new AppError(`Unknown ledger account ${line.account}.`);
    dr += line.debit;
    cr += line.credit;
    lines.push(line);
  }
  if (Math.abs(dr - cr) > 0.004) {
    throw new AppError(`${e.ref}: entry does not balance (debits ${r2(dr)}, credits ${r2(cr)}).`, "UNBALANCED");
  }
  if (!lines.length) return;
  const seq = (db.counters.JNL ?? 0) + 1;
  db.counters.JNL = seq;
  db.journal.push({
    id: uid(),
    seq,
    date: e.date,
    createdAt: nowIso(),
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    ref: e.ref,
    memo: e.memo,
    lines,
    ...(e.reversal ? { reversal: true } : {}),
  });
}

function reverseEntries(db: Database, sourceType: SourceType, sourceId: ID, reason: string) {
  const originals = db.journal.filter(
    (e) => e.sourceType === sourceType && e.sourceId === sourceId && !e.reversal && !e.reversed,
  );
  for (const e of originals) {
    e.reversed = true;
    postEntry(db, {
      date: e.date,
      sourceType,
      sourceId,
      ref: e.ref,
      memo: `Reversal of ${e.ref} - ${reason}`,
      lines: e.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
      reversal: true,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Stock                                                               */
/* ------------------------------------------------------------------ */

interface MoveInput {
  date: string;
  productId: ID;
  type: MovementType;
  sourceType: SourceType;
  sourceId: ID;
  ref: string;
  note: string;
  reversal?: boolean;
}

function pushMovement(db: Database, m: MoveInput, qty: number, value: number) {
  const seq = (db.counters.MOV ?? 0) + 1;
  db.counters.MOV = seq;
  db.movements.push({
    id: uid(),
    seq,
    date: m.date,
    productId: m.productId,
    type: m.type,
    qty,
    value,
    sourceType: m.sourceType,
    sourceId: m.sourceId,
    ref: m.ref,
    note: m.note,
    ...(m.reversal ? { reversal: true } : {}),
  });
  const s = onHand(db, m.productId);
  const newQty = r3(s.qty + qty);
  db.stock[m.productId] = { qty: newQty, value: newQty === 0 ? 0 : r2(s.value + value) };
}

function stockIn(db: Database, m: MoveInput, qty: number, value: number) {
  pushMovement(db, m, qty, r2(value));
}

/** Remove stock at weighted average cost. Returns the cost value removed. */
function stockOut(db: Database, m: MoveInput, qty: number): number {
  const p = getProduct(db, m.productId);
  const s = onHand(db, m.productId);
  if (qty > s.qty + 1e-9) {
    throw new AppError(
      `Not enough ${productLabel(p)} in stock: ${s.qty} ${p.unit}${s.qty === 1 ? "" : "s"} available, ${qty} needed.`,
      "INSUFFICIENT_STOCK",
    );
  }
  const value = r3(s.qty - qty) === 0 ? s.value : r2((s.value / s.qty) * qty);
  pushMovement(db, m, -qty, -value);
  return value;
}

/**
 * Undo the stock effect of a document. Returns cost differences that could not
 * be undone at the original value (because the average cost has since moved).
 */
function reverseMovements(db: Database, sourceType: SourceType, sourceId: ID, ref: string) {
  const variances: { productId: ID; amount: number }[] = [];
  const originals = db.movements.filter(
    (m) => m.sourceType === sourceType && m.sourceId === sourceId && !m.reversal && !m.reversed,
  );
  for (const m of originals) {
    m.reversed = true;
    const base: MoveInput = {
      date: m.date,
      productId: m.productId,
      type: m.type,
      sourceType,
      sourceId,
      ref,
      note: `Reversal of ${ref}`,
      reversal: true,
    };
    if (m.qty < 0) {
      pushMovement(db, base, -m.qty, -m.value);
      continue;
    }
    const p = getProduct(db, m.productId);
    const s = onHand(db, m.productId);
    if (m.qty > s.qty + 1e-9) {
      throw new AppError(
        `Cannot reverse ${ref}: it brought in ${m.qty} ${p.unit}s of ${productLabel(p)} but only ${s.qty} are left in stock. Reverse the later sales first, or record a stock adjustment instead.`,
        "INSUFFICIENT_STOCK",
      );
    }
    let value = m.value;
    if (r3(s.qty - m.qty) === 0) value = s.value;
    else if (value > s.value) value = r2((s.value / s.qty) * m.qty);
    pushMovement(db, base, -m.qty, -value);
    if (value !== m.value) variances.push({ productId: m.productId, amount: r2(m.value - value) });
  }
  return variances;
}

/** Recompute stock on hand from the movement history (used to verify integrity). */
export function rebuildStock(db: Database): Record<ID, { qty: number; value: number }> {
  const out: Record<ID, { qty: number; value: number }> = {};
  for (const m of db.movements) {
    const s = out[m.productId] ?? { qty: 0, value: 0 };
    const qty = r3(s.qty + m.qty);
    out[m.productId] = { qty, value: qty === 0 ? 0 : r2(s.value + m.value) };
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* New books                                                           */
/* ------------------------------------------------------------------ */

const DEFAULT_PRODUCTS: { name: string; category: ProductCategory; unit: string; description: string }[] = [
  { name: "Jumbo", category: "eggs", unit: "crate", description: "Jumbo size eggs" },
  { name: "Extra Big", category: "eggs", unit: "crate", description: "Extra big size eggs" },
  { name: "Big 1", category: "eggs", unit: "crate", description: "Big size eggs, grade 1" },
  { name: "Big 2", category: "eggs", unit: "crate", description: "Big size eggs, grade 2" },
  { name: "Medium", category: "eggs", unit: "crate", description: "Medium size eggs" },
  { name: "Small", category: "eggs", unit: "crate", description: "Small size eggs" },
  { name: "Cway water", category: "water", unit: "pack", description: "Cway water" },
];

export function createEmptyDb(): Database {
  const now = nowIso();
  const db: Database = {
    version: DB_VERSION,
    meta: { createdAt: now, sample: false, lastBackupAt: null, updatedAt: now },
    settings: {
      businessName: "FAABRA GLOBAL TRADE",
      tagline: "",
      rcNumber: "",
      phone: "",
      address: "",
      bankName: "",
      accountNumber: "",
      accountName: "",
      invoiceFooter: "Thank you for your patronage.",
      logo: "",
    },
    products: [],
    customers: [],
    suppliers: [],
    accounts: [],
    sales: [],
    purchases: [],
    receipts: [],
    supplierPayments: [],
    expenses: [],
    transfers: [],
    stockEvents: [],
    capitalEntries: [],
    adjustments: [],
    journal: [],
    movements: [],
    audit: [],
    counters: {},
    stock: {},
    reconciled: {},
  };
  for (const p of DEFAULT_PRODUCTS) {
    db.products.push({
      id: uid(),
      code: nextNumber(db, "PRD", 3),
      ...p,
      costPrice: 0,
      retailPrice: 0,
      wholesalePrice: 0,
      lowStockLevel: 0,
      active: true,
      createdAt: now,
    });
  }
  db.accounts.push({
    id: uid(),
    name: "Cash in hand",
    type: "cash",
    bankName: "",
    accountNumber: "",
    openingBalance: 0,
    active: true,
    createdAt: now,
  });
  return db;
}

/* ------------------------------------------------------------------ */
/* Registers: products, customers, suppliers, accounts, settings       */
/* ------------------------------------------------------------------ */

function describeChanges(before: object, after: object, labels: Record<string, string>): string {
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  const parts: string[] = [];
  for (const [key, label] of Object.entries(labels)) {
    if (b[key] !== a[key]) parts.push(`${label}: ${String(b[key] ?? "") || "-"} to ${String(a[key] ?? "") || "-"}`);
  }
  return parts.join("; ");
}

export interface ProductInput {
  name: string;
  category: ProductCategory;
  unit: string;
  description: string;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  lowStockLevel: number;
  active: boolean;
}

export function saveProduct(db: Database, input: ProductInput, id?: ID): ID {
  const name = input.name.trim();
  if (!name) throw new AppError("Enter the product name.");
  const unit = input.unit.trim().toLowerCase();
  if (!unit) throw new AppError("Enter the unit of measurement (e.g. crate, pack).");
  const clash = db.products.find(
    (p) => p.id !== id && p.category === input.category && p.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (clash) throw new AppError(`A product called "${clash.name}" already exists.`);
  const data = {
    name,
    category: input.category,
    unit,
    description: input.description.trim(),
    costPrice: amount(input.costPrice, "Purchase price"),
    retailPrice: amount(input.retailPrice, "Retail price"),
    wholesalePrice: amount(input.wholesalePrice, "Wholesale price"),
    lowStockLevel: amount(input.lowStockLevel, "Low-stock level"),
    active: input.active,
  };
  if (id) {
    const p = getProduct(db, id);
    if (p.category !== data.category && db.movements.some((m) => m.productId === id)) {
      throw new AppError("The category cannot be changed once the product has stock history.");
    }
    const changes = describeChanges(p, data, {
      name: "Name",
      unit: "Unit",
      description: "Description",
      costPrice: "Purchase price",
      retailPrice: "Retail price",
      wholesalePrice: "Wholesale price",
      lowStockLevel: "Low-stock level",
      active: "Active",
    });
    Object.assign(p, data);
    if (changes) audit(db, "update", "Product", p.code, `${productLabel(p)} - ${changes}`);
    return id;
  }
  const p: Product = { id: uid(), code: nextNumber(db, "PRD", 3), ...data, createdAt: nowIso() };
  db.products.push(p);
  audit(db, "create", "Product", p.code, `Added ${productLabel(p)}`);
  return p.id;
}

/** Post (or adjust) the opening balance entry for a customer, supplier or money account. */
function syncOpening(
  db: Database,
  kind: "customer" | "supplier" | "account",
  id: ID,
  name: string,
  target: number,
  date: string,
) {
  let current = 0;
  for (const e of db.journal) {
    if (e.sourceType !== "opening" || e.sourceId !== id) continue;
    for (const l of e.lines) {
      if (l.account === "3200") continue;
      current += kind === "supplier" ? l.credit - l.debit : l.debit - l.credit;
    }
  }
  const delta = r2(target - current);
  if (delta === 0) return;
  let line: JournalLine;
  if (kind === "customer") line = { account: "1200", debit: delta, credit: 0, partyId: id, note: "Opening balance" };
  else if (kind === "supplier") line = { account: "2000", debit: 0, credit: delta, partyId: id, note: "Opening balance" };
  else line = moneyLine(db, id, delta, 0, "Opening balance");
  postEntry(db, {
    date,
    sourceType: "opening",
    sourceId: id,
    ref: "OPENING",
    memo: `Opening balance - ${name}`,
    lines: [line, { account: "3200", debit: line.credit, credit: line.debit, note: name }],
  });
}

export interface CustomerInput {
  name: string;
  phone: string;
  address: string;
  category: CustomerCategory;
  openingBalance: number;
  creditLimit: number;
}

export function saveCustomer(db: Database, input: CustomerInput, id?: ID, createdAt: string = nowIso()): ID {
  const name = input.name.trim();
  if (!name) throw new AppError("Enter the customer's name.");
  const data = {
    name,
    phone: input.phone.trim(),
    address: input.address.trim(),
    category: input.category,
    openingBalance: amount(input.openingBalance, "Opening balance"),
    creditLimit: amount(input.creditLimit, "Credit limit"),
  };
  let c: Customer;
  if (id) {
    c = getCustomer(db, id);
    const changes = describeChanges(c, data, {
      name: "Name",
      phone: "Phone",
      address: "Address",
      category: "Category",
      openingBalance: "Opening balance",
      creditLimit: "Credit limit",
    });
    Object.assign(c, data);
    if (changes) audit(db, "update", "Customer", c.code, `${c.name} - ${changes}`);
  } else {
    c = { id: uid(), code: nextNumber(db, "CUS", 4), ...data, createdAt };
    db.customers.push(c);
    audit(db, "create", "Customer", c.code, `Added ${c.name}`);
  }
  syncOpening(db, "customer", c.id, c.name, c.openingBalance, c.createdAt.slice(0, 10));
  return c.id;
}

export interface SupplierInput {
  name: string;
  phone: string;
  address: string;
  openingBalance: number;
}

export function saveSupplier(db: Database, input: SupplierInput, id?: ID, createdAt: string = nowIso()): ID {
  const name = input.name.trim();
  if (!name) throw new AppError("Enter the supplier's name.");
  const data = {
    name,
    phone: input.phone.trim(),
    address: input.address.trim(),
    openingBalance: amount(input.openingBalance, "Opening balance"),
  };
  let s: Supplier;
  if (id) {
    s = getSupplier(db, id);
    const changes = describeChanges(s, data, {
      name: "Name",
      phone: "Phone",
      address: "Address",
      openingBalance: "Opening balance",
    });
    Object.assign(s, data);
    if (changes) audit(db, "update", "Supplier", s.code, `${s.name} - ${changes}`);
  } else {
    s = { id: uid(), code: nextNumber(db, "SUP", 4), ...data, createdAt };
    db.suppliers.push(s);
    audit(db, "create", "Supplier", s.code, `Added ${s.name}`);
  }
  syncOpening(db, "supplier", s.id, s.name, s.openingBalance, s.createdAt.slice(0, 10));
  return s.id;
}

export interface AccountInput {
  name: string;
  type: "cash" | "bank";
  bankName: string;
  accountNumber: string;
  openingBalance: number;
  active: boolean;
}

export function saveAccount(db: Database, input: AccountInput, id?: ID, createdAt: string = nowIso()): ID {
  const name = input.name.trim();
  if (!name) throw new AppError("Enter a name for the account.");
  if (db.accounts.some((a) => a.id !== id && a.name.trim().toLowerCase() === name.toLowerCase())) {
    throw new AppError(`An account called "${name}" already exists.`);
  }
  const data = {
    name,
    bankName: input.bankName.trim(),
    accountNumber: input.accountNumber.trim(),
    openingBalance: amount(input.openingBalance, "Opening balance"),
    active: input.active,
  };
  let a: MoneyAccount;
  if (id) {
    a = getAccount(db, id);
    if (a.type !== input.type) throw new AppError("An account cannot be switched between cash and bank.");
    const changes = describeChanges(a, data, {
      name: "Name",
      bankName: "Bank",
      accountNumber: "Account number",
      openingBalance: "Opening balance",
      active: "Active",
    });
    Object.assign(a, data);
    if (changes) audit(db, "update", "Account", a.name, changes);
  } else {
    a = { id: uid(), type: input.type, ...data, createdAt };
    db.accounts.push(a);
    audit(db, "create", "Account", a.name, `Added ${a.type} account ${a.name}`);
  }
  syncOpening(db, "account", a.id, a.name, a.openingBalance, a.createdAt.slice(0, 10));
  return a.id;
}

export function updateSettings(db: Database, patch: Partial<BusinessSettings>) {
  const before = { ...db.settings };
  Object.assign(db.settings, patch);
  const changes = describeChanges(before, db.settings, {
    businessName: "Business name",
    tagline: "Tagline",
    rcNumber: "RC number",
    phone: "Phone",
    address: "Address",
    bankName: "Bank",
    accountNumber: "Account number",
    accountName: "Account name",
    invoiceFooter: "Invoice footer",
  });
  const logoChanged = before.logo !== db.settings.logo ? "Logo changed" : "";
  const summary = [changes, logoChanged].filter(Boolean).join("; ");
  if (summary) audit(db, "update", "Settings", "Business", summary);
}

/* ------------------------------------------------------------------ */
/* Sales                                                               */
/* ------------------------------------------------------------------ */

export interface SaleInput {
  /** Id of an existing draft being saved or posted. */
  id?: ID;
  date: string;
  customerId: ID | null;
  priceType: PriceType;
  items: { productId: ID; qty: number; unitPrice: number }[];
  discount: number;
  amountPaid: number;
  paymentAccountId: ID | null;
  remarks: string;
}

function buildSale(db: Database, input: SaleInput) {
  const date = checkDate(input.date);
  if (input.customerId) getCustomer(db, input.customerId);
  const items = input.items.map((i) => {
    getProduct(db, i.productId);
    return {
      productId: i.productId,
      qty: quantity(i.qty),
      unitPrice: amount(i.unitPrice, "Selling price"),
      unitCost: 0,
      cost: 0,
    };
  });
  if (!items.length) throw new AppError("Add at least one product to the invoice.");
  const subtotal = r2(items.reduce((s, i) => s + r2(i.qty * i.unitPrice), 0));
  const discount = amount(input.discount, "Discount");
  if (discount > subtotal) throw new AppError("The discount cannot be more than the invoice amount.");
  return {
    date,
    customerId: input.customerId,
    priceType: input.priceType,
    items,
    subtotal,
    discount,
    total: r2(subtotal - discount),
    amountPaid: amount(input.amountPaid, "Amount paid"),
    paymentAccountId: input.paymentAccountId,
    remarks: input.remarks.trim(),
  };
}

function upsertDraft<T extends { id: ID; status: string; createdAt: string }>(
  list: T[],
  id: ID | undefined,
  make: (id: ID, createdAt: string) => T,
): T {
  if (id) {
    const index = list.findIndex((d) => d.id === id);
    if (index < 0) throw new AppError("Draft not found.");
    if (list[index].status !== "draft") throw new AppError("This entry has already been posted.");
    list[index] = make(id, list[index].createdAt);
    return list[index];
  }
  const doc = make(uid(), nowIso());
  list.push(doc);
  return doc;
}

export function saveSaleDraft(db: Database, input: SaleInput): ID {
  const data = buildSale(db, input);
  const isNew = !input.id;
  const sale = upsertDraft<Sale>(db.sales, input.id, (id, createdAt) => ({
    id,
    number: "",
    status: "draft",
    createdAt,
    ...data,
  }));
  if (isNew) audit(db, "draft", "Sale", "Draft", `Draft invoice saved, total ${sale.total}`);
  return sale.id;
}

export function postSale(db: Database, input: SaleInput, opts: { allowOverLimit?: boolean } = {}): ID {
  const data = buildSale(db, input);
  if (data.subtotal <= 0) throw new AppError("The invoice amount must be more than zero.");
  if (data.amountPaid > data.total) {
    throw new AppError("Amount paid is more than the invoice total. Record any extra as a separate customer payment.");
  }
  if (data.amountPaid > 0) getAccount(db, data.paymentAccountId);
  const customer = data.customerId ? getCustomer(db, data.customerId) : null;
  const credit = r2(data.total - data.amountPaid);
  if (!customer && credit > 0) {
    throw new AppError("A walk-in sale must be paid in full. Choose a customer to sell on credit.", "NEEDS_CUSTOMER");
  }
  if (customer && credit > 0 && customer.creditLimit > 0 && !opts.allowOverLimit) {
    const owed = partyBalance(db, "1200", customer.id);
    if (owed + credit > customer.creditLimit) {
      throw new AppError(
        `This sale takes ${customer.name} above their credit limit (owes ${owed}, limit ${customer.creditLimit}).`,
        "CREDIT_LIMIT",
      );
    }
  }

  const sale = upsertDraft<Sale>(db.sales, input.id, (id, createdAt) => ({
    id,
    number: "",
    status: "posted",
    createdAt,
    postedAt: nowIso(),
    ...data,
  }));
  sale.number = nextNumber(db, "INV");
  if (sale.amountPaid === 0) sale.paymentAccountId = null;

  const lines: JournalLine[] = [];
  const byCategory: Record<ProductCategory, number> = { eggs: 0, water: 0 };
  const cogsByCategory: Record<ProductCategory, number> = { eggs: 0, water: 0 };
  const stockLines: JournalLine[] = [];

  for (const item of sale.items) {
    const p = getProduct(db, item.productId);
    const cost = stockOut(
      db,
      {
        date: sale.date,
        productId: p.id,
        type: "sale",
        sourceType: "sale",
        sourceId: sale.id,
        ref: sale.number,
        note: customer ? customer.name : "Walk-in customer",
      },
      item.qty,
    );
    item.cost = cost;
    item.unitCost = r2(cost / item.qty);
    byCategory[p.category] += r2(item.qty * item.unitPrice);
    cogsByCategory[p.category] += cost;
    stockLines.push({ account: "1300", debit: 0, credit: cost, productId: p.id, category: p.category });
  }

  // Spread the invoice discount across categories in proportion to their value.
  const categories = (Object.keys(byCategory) as ProductCategory[]).filter((c) => byCategory[c] > 0);
  let discountLeft = sale.discount;
  categories.forEach((c, i) => {
    const gross = r2(byCategory[c]);
    lines.push({ account: "4000", debit: 0, credit: gross, category: c });
    const share = i === categories.length - 1 ? discountLeft : r2((sale.discount * gross) / sale.subtotal);
    discountLeft = r2(discountLeft - share);
    lines.push({ account: "4100", debit: share, credit: 0, category: c });
    lines.push({ account: "5000", debit: r2(cogsByCategory[c]), credit: 0, category: c });
  });
  lines.push(...stockLines);

  if (customer) {
    lines.push({ account: "1200", debit: sale.total, credit: 0, partyId: customer.id, note: `Invoice ${sale.number}` });
    if (sale.amountPaid > 0) {
      lines.push(moneyLine(db, sale.paymentAccountId, sale.amountPaid, 0, `${sale.number} - ${customer.name}`));
      lines.push({
        account: "1200",
        debit: 0,
        credit: sale.amountPaid,
        partyId: customer.id,
        note: `Paid with invoice ${sale.number}`,
      });
    }
  } else {
    lines.push(moneyLine(db, sale.paymentAccountId, sale.total, 0, `${sale.number} - Walk-in sale`));
  }

  postEntry(db, {
    date: sale.date,
    sourceType: "sale",
    sourceId: sale.id,
    ref: sale.number,
    memo: `Sale to ${customer ? customer.name : "walk-in customer"}`,
    lines,
  });
  audit(
    db,
    "post",
    "Sale",
    sale.number,
    `Invoice to ${customer ? customer.name : "walk-in customer"}: total ${sale.total}, paid ${sale.amountPaid}`,
  );
  return sale.id;
}

/* ------------------------------------------------------------------ */
/* Purchases                                                           */
/* ------------------------------------------------------------------ */

export interface PurchaseInput {
  id?: ID;
  date: string;
  supplierId: ID;
  items: { productId: ID; qty: number; unitCost: number }[];
  transportCost: number;
  transportAccountId: ID | null;
  amountPaid: number;
  paymentAccountId: ID | null;
  invoiceRef: string;
  remarks: string;
}

function buildPurchase(db: Database, input: PurchaseInput) {
  const date = checkDate(input.date);
  if (!input.supplierId) throw new AppError("Choose the supplier.");
  getSupplier(db, input.supplierId);
  const raw = input.items.map((i) => {
    getProduct(db, i.productId);
    return { productId: i.productId, qty: quantity(i.qty), unitCost: amount(i.unitCost, "Unit cost") };
  });
  if (!raw.length) throw new AppError("Add at least one product to the purchase.");
  const goodsTotal = r2(raw.reduce((s, i) => s + r2(i.qty * i.unitCost), 0));
  const transportCost = amount(input.transportCost, "Transport cost");

  // Transport that brings goods in is part of their cost: share it by value.
  let transportLeft = transportCost;
  const items = raw.map((i, index) => {
    const value = r2(i.qty * i.unitCost);
    const share =
      index === raw.length - 1
        ? transportLeft
        : goodsTotal > 0
          ? r2((transportCost * value) / goodsTotal)
          : r2(transportCost / raw.length);
    transportLeft = r2(transportLeft - share);
    const landedValue = r2(value + share);
    return { ...i, landedValue, landedUnitCost: Math.round((landedValue / i.qty) * 10000) / 10000 };
  });

  return {
    date,
    supplierId: input.supplierId,
    items,
    goodsTotal,
    transportCost,
    transportAccountId: transportCost > 0 ? input.transportAccountId : null,
    total: r2(goodsTotal + transportCost),
    amountPaid: amount(input.amountPaid, "Amount paid"),
    paymentAccountId: input.paymentAccountId,
    invoiceRef: input.invoiceRef.trim(),
    remarks: input.remarks.trim(),
  };
}

export function savePurchaseDraft(db: Database, input: PurchaseInput): ID {
  const data = buildPurchase(db, input);
  const isNew = !input.id;
  const purchase = upsertDraft<Purchase>(db.purchases, input.id, (id, createdAt) => ({
    id,
    number: "",
    status: "draft",
    createdAt,
    ...data,
  }));
  if (isNew) audit(db, "draft", "Purchase", "Draft", `Draft purchase saved, total ${purchase.total}`);
  return purchase.id;
}

export function postPurchase(db: Database, input: PurchaseInput): ID {
  const data = buildPurchase(db, input);
  if (data.goodsTotal <= 0) throw new AppError("The purchase amount must be more than zero.");
  if (data.amountPaid > data.goodsTotal) {
    throw new AppError("Amount paid is more than the cost of the goods. Record any extra as a separate supplier payment.");
  }
  if (data.amountPaid > 0) getAccount(db, data.paymentAccountId);
  if (data.transportCost > 0) getAccount(db, data.transportAccountId);
  const supplier = getSupplier(db, data.supplierId);

  const purchase = upsertDraft<Purchase>(db.purchases, input.id, (id, createdAt) => ({
    id,
    number: "",
    status: "posted",
    createdAt,
    postedAt: nowIso(),
    ...data,
  }));
  purchase.number = nextNumber(db, "PUR");
  if (purchase.amountPaid === 0) purchase.paymentAccountId = null;

  const lines: JournalLine[] = [];
  for (const item of purchase.items) {
    const p = getProduct(db, item.productId);
    stockIn(
      db,
      {
        date: purchase.date,
        productId: p.id,
        type: "purchase",
        sourceType: "purchase",
        sourceId: purchase.id,
        ref: purchase.number,
        note: supplier.name,
      },
      item.qty,
      item.landedValue,
    );
    lines.push({ account: "1300", debit: item.landedValue, credit: 0, productId: p.id, category: p.category });
  }
  lines.push({
    account: "2000",
    debit: 0,
    credit: purchase.goodsTotal,
    partyId: supplier.id,
    note: `Purchase ${purchase.number}${purchase.invoiceRef ? ` (inv. ${purchase.invoiceRef})` : ""}`,
  });
  if (purchase.transportCost > 0) {
    lines.push(moneyLine(db, purchase.transportAccountId, 0, purchase.transportCost, `Transport on ${purchase.number}`));
  }
  if (purchase.amountPaid > 0) {
    lines.push({
      account: "2000",
      debit: purchase.amountPaid,
      credit: 0,
      partyId: supplier.id,
      note: `Paid with purchase ${purchase.number}`,
    });
    lines.push(moneyLine(db, purchase.paymentAccountId, 0, purchase.amountPaid, `${purchase.number} - ${supplier.name}`));
  }
  postEntry(db, {
    date: purchase.date,
    sourceType: "purchase",
    sourceId: purchase.id,
    ref: purchase.number,
    memo: `Purchase from ${supplier.name}`,
    lines,
  });
  audit(
    db,
    "post",
    "Purchase",
    purchase.number,
    `Purchase from ${supplier.name}: goods ${purchase.goodsTotal}, transport ${purchase.transportCost}, paid ${purchase.amountPaid}`,
  );
  return purchase.id;
}

export function deleteDraft(db: Database, type: "sale" | "purchase", id: ID) {
  const list: { id: ID; status: string }[] = type === "sale" ? db.sales : db.purchases;
  const index = list.findIndex((d) => d.id === id);
  if (index < 0) throw new AppError("Draft not found.");
  if (list[index].status !== "draft") {
    throw new AppError("Posted entries cannot be deleted. Reverse the entry instead.");
  }
  list.splice(index, 1);
  audit(db, "delete", type === "sale" ? "Sale" : "Purchase", "Draft", "Draft discarded (it was never posted)");
}

/* ------------------------------------------------------------------ */
/* Money: receipts, supplier payments, expenses, transfers, capital    */
/* ------------------------------------------------------------------ */

export interface ReceiptInput {
  date: string;
  customerId: ID;
  amount: number;
  accountId: ID;
  allocations: ReceiptAllocation[];
  reference: string;
  remarks: string;
}

export function postReceipt(db: Database, input: ReceiptInput): ID {
  const date = checkDate(input.date);
  if (!input.customerId) throw new AppError("Choose the customer.");
  const customer = getCustomer(db, input.customerId);
  const value = amount(input.amount, "Amount received", { positive: true });
  getAccount(db, input.accountId);

  const outstanding = saleOutstanding(db);
  const allocations: ReceiptAllocation[] = [];
  let allocated = 0;
  for (const a of input.allocations) {
    const part = amount(a.amount, "Allocated amount");
    if (part === 0) continue;
    const sale = db.sales.find((s) => s.id === a.saleId);
    if (!sale || sale.status !== "posted" || sale.customerId !== customer.id) {
      throw new AppError("A selected invoice does not belong to this customer.");
    }
    if (part > (outstanding[sale.id] ?? 0)) {
      throw new AppError(`Invoice ${sale.number} only has ${outstanding[sale.id] ?? 0} outstanding.`);
    }
    outstanding[sale.id] = r2(outstanding[sale.id] - part);
    allocated = r2(allocated + part);
    allocations.push({ saleId: sale.id, amount: part });
  }
  if (allocated > value) throw new AppError("The invoices selected add up to more than the amount received.");

  const receipt: Receipt = {
    id: uid(),
    number: nextNumber(db, "RCT"),
    date,
    status: "posted",
    createdAt: nowIso(),
    postedAt: nowIso(),
    customerId: customer.id,
    amount: value,
    accountId: input.accountId,
    allocations,
    reference: input.reference.trim(),
    remarks: input.remarks.trim(),
  };
  db.receipts.push(receipt);
  postEntry(db, {
    date,
    sourceType: "receipt",
    sourceId: receipt.id,
    ref: receipt.number,
    memo: `Payment received from ${customer.name}`,
    lines: [
      moneyLine(db, receipt.accountId, value, 0, `${receipt.number} - ${customer.name}`),
      { account: "1200", debit: 0, credit: value, partyId: customer.id, note: `Payment ${receipt.number}` },
    ],
  });
  audit(db, "post", "Customer payment", receipt.number, `Received ${value} from ${customer.name}`);
  return receipt.id;
}

export interface SupplierPaymentInput {
  date: string;
  supplierId: ID;
  amount: number;
  accountId: ID;
  reference: string;
  remarks: string;
}

export function postSupplierPayment(db: Database, input: SupplierPaymentInput): ID {
  const date = checkDate(input.date);
  if (!input.supplierId) throw new AppError("Choose the supplier.");
  const supplier = getSupplier(db, input.supplierId);
  const value = amount(input.amount, "Amount paid", { positive: true });
  getAccount(db, input.accountId);
  const payment: SupplierPayment = {
    id: uid(),
    number: nextNumber(db, "PAY"),
    date,
    status: "posted",
    createdAt: nowIso(),
    postedAt: nowIso(),
    supplierId: supplier.id,
    amount: value,
    accountId: input.accountId,
    reference: input.reference.trim(),
    remarks: input.remarks.trim(),
  };
  db.supplierPayments.push(payment);
  postEntry(db, {
    date,
    sourceType: "supplierPayment",
    sourceId: payment.id,
    ref: payment.number,
    memo: `Payment to ${supplier.name}`,
    lines: [
      { account: "2000", debit: value, credit: 0, partyId: supplier.id, note: `Payment ${payment.number}` },
      moneyLine(db, payment.accountId, 0, value, `${payment.number} - ${supplier.name}`),
    ],
  });
  audit(db, "post", "Supplier payment", payment.number, `Paid ${value} to ${supplier.name}`);
  return payment.id;
}

export interface ExpenseInput {
  date: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  accountId: ID;
  reference: string;
}

export function postExpense(db: Database, input: ExpenseInput): ID {
  const date = checkDate(input.date);
  if (CHART[input.category]?.kind !== "expense") throw new AppError("Choose an expense category.");
  const description = input.description.trim();
  if (!description) throw new AppError("Describe what the money was spent on.");
  const value = amount(input.amount, "Amount", { positive: true });
  getAccount(db, input.accountId);
  const expense: Expense = {
    id: uid(),
    number: nextNumber(db, "EXP"),
    date,
    status: "posted",
    createdAt: nowIso(),
    postedAt: nowIso(),
    category: input.category,
    description,
    amount: value,
    accountId: input.accountId,
    reference: input.reference.trim(),
  };
  db.expenses.push(expense);
  postEntry(db, {
    date,
    sourceType: "expense",
    sourceId: expense.id,
    ref: expense.number,
    memo: `${CHART[expense.category].name}: ${description}`,
    lines: [
      { account: expense.category, debit: value, credit: 0, note: description },
      moneyLine(db, expense.accountId, 0, value, `${CHART[expense.category].name} - ${description}`),
    ],
  });
  audit(db, "post", "Expense", expense.number, `${CHART[expense.category].name}: ${description}, ${value}`);
  return expense.id;
}

export interface TransferInput {
  date: string;
  fromAccountId: ID;
  toAccountId: ID;
  amount: number;
  remarks: string;
}

export function postTransfer(db: Database, input: TransferInput): ID {
  const date = checkDate(input.date);
  const from = getAccount(db, input.fromAccountId);
  const to = getAccount(db, input.toAccountId);
  if (from.id === to.id) throw new AppError("Choose two different accounts.");
  const value = amount(input.amount, "Amount", { positive: true });
  const transfer: Transfer = {
    id: uid(),
    number: nextNumber(db, "TRF"),
    date,
    status: "posted",
    createdAt: nowIso(),
    postedAt: nowIso(),
    fromAccountId: from.id,
    toAccountId: to.id,
    amount: value,
    remarks: input.remarks.trim(),
  };
  db.transfers.push(transfer);
  postEntry(db, {
    date,
    sourceType: "transfer",
    sourceId: transfer.id,
    ref: transfer.number,
    memo: `Transfer from ${from.name} to ${to.name}`,
    lines: [
      moneyLine(db, to.id, value, 0, `Transfer from ${from.name}`),
      moneyLine(db, from.id, 0, value, `Transfer to ${to.name}`),
    ],
  });
  audit(db, "post", "Transfer", transfer.number, `Moved ${value} from ${from.name} to ${to.name}`);
  return transfer.id;
}

export interface CapitalInput {
  date: string;
  type: "capital" | "drawing";
  amount: number;
  accountId: ID;
  remarks: string;
}

export function postCapital(db: Database, input: CapitalInput): ID {
  const date = checkDate(input.date);
  const value = amount(input.amount, "Amount", { positive: true });
  const account = getAccount(db, input.accountId);
  const entry: CapitalEntry = {
    id: uid(),
    number: nextNumber(db, "CAP"),
    date,
    status: "posted",
    createdAt: nowIso(),
    postedAt: nowIso(),
    type: input.type,
    amount: value,
    accountId: account.id,
    remarks: input.remarks.trim(),
  };
  db.capitalEntries.push(entry);
  const isCapital = entry.type === "capital";
  postEntry(db, {
    date,
    sourceType: "capital",
    sourceId: entry.id,
    ref: entry.number,
    memo: isCapital ? "Capital introduced by owner" : "Owner's personal withdrawal",
    lines: isCapital
      ? [
          moneyLine(db, account.id, value, 0, "Capital introduced"),
          { account: "3000", debit: 0, credit: value, note: entry.remarks },
        ]
      : [
          { account: "3100", debit: value, credit: 0, note: entry.remarks },
          moneyLine(db, account.id, 0, value, "Owner's drawings"),
        ],
  });
  audit(
    db,
    "post",
    "Capital & drawings",
    entry.number,
    isCapital ? `Owner introduced ${value} into ${account.name}` : `Owner withdrew ${value} from ${account.name}`,
  );
  return entry.id;
}

export interface AdjustmentInput {
  date: string;
  partyType: "customer" | "supplier";
  partyId: ID;
  direction: "increase" | "decrease";
  amount: number;
  reason: string;
}

export function postAdjustment(db: Database, input: AdjustmentInput): ID {
  const date = checkDate(input.date);
  const value = amount(input.amount, "Amount", { positive: true });
  const reason = input.reason.trim();
  if (!reason) throw new AppError("Give a reason for the adjustment.");
  const isCustomer = input.partyType === "customer";
  const party = isCustomer ? getCustomer(db, input.partyId) : getSupplier(db, input.partyId);
  const adjustment: PartyAdjustment = {
    id: uid(),
    number: nextNumber(db, "ADJ"),
    date,
    status: "posted",
    createdAt: nowIso(),
    postedAt: nowIso(),
    partyType: input.partyType,
    partyId: party.id,
    direction: input.direction,
    amount: value,
    reason,
  };
  db.adjustments.push(adjustment);
  const up = input.direction === "increase";
  const note = `Adjustment ${adjustment.number}: ${reason}`;
  const lines: JournalLine[] = isCustomer
    ? up
      ? [
          { account: "1200", debit: value, credit: 0, partyId: party.id, note },
          { account: "4900", debit: 0, credit: value, note },
        ]
      : [
          { account: "6120", debit: value, credit: 0, note },
          { account: "1200", debit: 0, credit: value, partyId: party.id, note },
        ]
    : up
      ? [
          { account: "6100", debit: value, credit: 0, note },
          { account: "2000", debit: 0, credit: value, partyId: party.id, note },
        ]
      : [
          { account: "2000", debit: value, credit: 0, partyId: party.id, note },
          { account: "4900", debit: 0, credit: value, note },
        ];
  postEntry(db, {
    date,
    sourceType: "adjustment",
    sourceId: adjustment.id,
    ref: adjustment.number,
    memo: `${isCustomer ? "Customer" : "Supplier"} account adjustment - ${party.name}`,
    lines,
  });
  audit(
    db,
    "post",
    "Account adjustment",
    adjustment.number,
    `${party.name}: balance ${up ? "increased" : "reduced"} by ${value} (${reason})`,
  );
  return adjustment.id;
}

/* ------------------------------------------------------------------ */
/* Stock events: opening stock, returns, breakages, consumption        */
/* ------------------------------------------------------------------ */

export interface StockEventInput {
  date: string;
  type: StockEventType;
  productId: ID;
  qty: number;
  unitValue: number;
  reason: string;
  customerId?: ID | null;
  supplierId?: ID | null;
  saleId?: ID | null;
  settlement?: "credit" | "refund";
  accountId?: ID | null;
  restock?: boolean;
  chargeTo?: "expense" | "drawings";
}

export function postStockEvent(db: Database, input: StockEventInput): ID {
  const date = checkDate(input.date);
  if (!input.productId) throw new AppError("Choose the product.");
  const p = getProduct(db, input.productId);
  const qty = quantity(input.qty);
  const unitValue = amount(input.unitValue ?? 0, "Unit value");
  const reason = input.reason.trim();
  const needsReason: StockEventType[] = ["breakage", "internal_use", "adjustment_in", "adjustment_out"];
  if (needsReason.includes(input.type) && !reason) throw new AppError("Give a short reason.");

  const event: StockEvent = {
    id: uid(),
    number: nextNumber(db, "STK"),
    date,
    status: "posted",
    createdAt: nowIso(),
    postedAt: nowIso(),
    type: input.type,
    productId: p.id,
    qty,
    unitValue,
    value: 0,
    reason,
  };
  const move = (type: MovementType, note: string) => ({
    date,
    productId: p.id,
    type,
    sourceType: "stockEvent" as const,
    sourceId: event.id,
    ref: event.number,
    note,
  });
  const stockLine = (debit: number, credit: number): JournalLine => ({
    account: "1300",
    debit,
    credit,
    productId: p.id,
    category: p.category,
  });
  const name = productLabel(p);
  let lines: JournalLine[] = [];
  let memo = "";

  switch (input.type) {
    case "opening": {
      const value = r2(qty * unitValue);
      stockIn(db, move("opening", "Opening stock"), qty, value);
      event.value = value;
      lines = [stockLine(value, 0), { account: "3200", debit: 0, credit: value, note: `Opening stock - ${name}` }];
      memo = `Opening stock - ${name}`;
      break;
    }
    case "adjustment_in": {
      const value = r2(qty * unitValue);
      stockIn(db, move("adjustment", reason), qty, value);
      event.value = value;
      lines = [stockLine(value, 0), { account: "5100", debit: 0, credit: value, category: p.category, note: reason }];
      memo = `Stock count up - ${name}`;
      break;
    }
    case "adjustment_out": {
      const cost = stockOut(db, move("adjustment", reason), qty);
      event.value = cost;
      lines = [{ account: "5100", debit: cost, credit: 0, category: p.category, note: reason }, stockLine(0, cost)];
      memo = `Stock count down - ${name}`;
      break;
    }
    case "breakage": {
      const cost = stockOut(db, move("breakage", reason), qty);
      event.value = cost;
      lines = [{ account: "6080", debit: cost, credit: 0, category: p.category, note: reason }, stockLine(0, cost)];
      memo = `Breakage / damage - ${name}`;
      break;
    }
    case "internal_use": {
      event.chargeTo = input.chargeTo === "drawings" ? "drawings" : "expense";
      const cost = stockOut(db, move("internal_use", reason), qty);
      event.value = cost;
      lines = [
        event.chargeTo === "drawings"
          ? { account: "3100", debit: cost, credit: 0, note: `${name} taken by owner: ${reason}` }
          : { account: "6110", debit: cost, credit: 0, category: p.category, note: reason },
        stockLine(0, cost),
      ];
      memo = `Internal consumption - ${name}`;
      break;
    }
    case "customer_return": {
      const customer = input.customerId ? getCustomer(db, input.customerId) : null;
      event.customerId = customer?.id ?? null;
      event.settlement = input.settlement === "refund" ? "refund" : "credit";
      event.restock = input.restock !== false;
      if (event.settlement === "credit" && !customer) {
        throw new AppError("Choose the customer whose account should be credited, or refund in cash instead.");
      }
      const sale = input.saleId ? db.sales.find((s) => s.id === input.saleId) : undefined;
      if (input.saleId) {
        if (!sale || sale.status !== "posted" || (sale.customerId ?? null) !== (customer?.id ?? null)) {
          throw new AppError("The selected invoice does not belong to this customer.");
        }
        event.saleId = sale.id;
      }
      const value = r2(qty * unitValue);
      event.value = value;
      const who = customer ? customer.name : "walk-in customer";
      lines = [{ account: "4200", debit: value, credit: 0, category: p.category, note: `Return by ${who}` }];
      if (event.settlement === "credit" && customer) {
        lines.push({ account: "1200", debit: 0, credit: value, partyId: customer.id, note: `Credit note ${event.number}` });
      } else {
        event.accountId = getAccount(db, input.accountId).id;
        lines.push(moneyLine(db, event.accountId, 0, value, `Refund ${event.number} - ${who}`));
      }
      if (event.restock) {
        const soldItem = sale?.items.find((i) => i.productId === p.id);
        const unitCost = soldItem ? soldItem.unitCost : onHand(db, p.id).qty > 0 ? avgCost(db, p.id) : p.costPrice;
        const cost = r2(unitCost * qty);
        stockIn(db, move("customer_return", `Returned by ${who}`), qty, cost);
        lines.push(stockLine(cost, 0), { account: "5000", debit: 0, credit: cost, category: p.category });
      }
      memo = `Customer return - ${name} (${who})`;
      break;
    }
    case "supplier_return": {
      if (!input.supplierId) throw new AppError("Choose the supplier.");
      const supplier = getSupplier(db, input.supplierId);
      event.supplierId = supplier.id;
      event.settlement = input.settlement === "refund" ? "refund" : "credit";
      const value = r2(qty * unitValue);
      event.value = value;
      const cost = stockOut(db, move("supplier_return", `Returned to ${supplier.name}`), qty);
      if (event.settlement === "credit") {
        lines.push({ account: "2000", debit: value, credit: 0, partyId: supplier.id, note: `Supplier credit ${event.number}` });
      } else {
        event.accountId = getAccount(db, input.accountId).id;
        lines.push(moneyLine(db, event.accountId, value, 0, `Refund ${event.number} - ${supplier.name}`));
      }
      lines.push(stockLine(0, cost));
      // Any gap between what the supplier credits and our average cost.
      lines.push({ account: "5100", debit: 0, credit: r2(value - cost), category: p.category, note: "Cost difference on return" });
      memo = `Return to supplier - ${name} (${supplier.name})`;
      break;
    }
    default:
      throw new AppError("Unknown stock event.");
  }

  db.stockEvents.push(event);
  postEntry(db, { date, sourceType: "stockEvent", sourceId: event.id, ref: event.number, memo, lines });
  audit(db, "post", "Stock event", event.number, `${memo}: ${qty} ${p.unit}${qty === 1 ? "" : "s"}${reason ? ` - ${reason}` : ""}`);
  return event.id;
}

/* ------------------------------------------------------------------ */
/* Reversals                                                           */
/* ------------------------------------------------------------------ */

type DocType = Exclude<SourceType, "opening">;

const COLLECTIONS: Record<DocType, { key: keyof Database; label: string }> = {
  sale: { key: "sales", label: "Sale" },
  purchase: { key: "purchases", label: "Purchase" },
  receipt: { key: "receipts", label: "Customer payment" },
  supplierPayment: { key: "supplierPayments", label: "Supplier payment" },
  expense: { key: "expenses", label: "Expense" },
  transfer: { key: "transfers", label: "Transfer" },
  stockEvent: { key: "stockEvents", label: "Stock event" },
  capital: { key: "capitalEntries", label: "Capital & drawings" },
  adjustment: { key: "adjustments", label: "Account adjustment" },
};

/**
 * Cancel a posted document. The original stays on record, marked as reversed,
 * and equal-and-opposite journal and stock entries are added.
 */
export function reverseDoc(db: Database, type: DocType, id: ID, reason: string) {
  const { key, label } = COLLECTIONS[type];
  const list = db[key] as unknown as {
    id: ID;
    number: string;
    status: string;
    reversedAt?: string;
    reversalReason?: string;
  }[];
  const doc = list.find((d) => d.id === id);
  if (!doc) throw new AppError("Entry not found.");
  if (doc.status === "reversed") throw new AppError(`${doc.number} has already been reversed.`);
  if (doc.status !== "posted") throw new AppError("Only posted entries can be reversed.");
  const why = reason.trim();
  if (!why) throw new AppError("Give a reason for the reversal.");

  if (type === "sale") {
    const receipt = db.receipts.find((r) => r.status === "posted" && r.allocations.some((a) => a.saleId === id));
    if (receipt) {
      throw new AppError(`Payment ${receipt.number} is recorded against ${doc.number}. Reverse that payment first.`);
    }
    const note = db.stockEvents.find((e) => e.status === "posted" && e.saleId === id);
    if (note) throw new AppError(`Return ${note.number} is linked to ${doc.number}. Reverse that return first.`);
  }

  const variances = reverseMovements(db, type, id, doc.number);
  reverseEntries(db, type, id, why);
  const lines: JournalLine[] = [];
  for (const v of variances) {
    const p = getProduct(db, v.productId);
    lines.push(
      { account: "1300", debit: v.amount, credit: 0, productId: p.id, category: p.category },
      { account: "5100", debit: 0, credit: v.amount, category: p.category, note: `Cost difference reversing ${doc.number}` },
    );
  }
  if (lines.length) {
    const original = db.journal.find((e) => e.sourceType === type && e.sourceId === id);
    postEntry(db, {
      date: original?.date ?? todayStr(),
      sourceType: type,
      sourceId: id,
      ref: doc.number,
      memo: `Cost difference on reversal of ${doc.number}`,
      lines,
      reversal: true,
    });
  }
  doc.status = "reversed";
  doc.reversedAt = nowIso();
  doc.reversalReason = why;
  audit(db, "reverse", label, doc.number, `Reversed: ${why}`);
}

/* ------------------------------------------------------------------ */
/* Bank reconciliation                                                 */
/* ------------------------------------------------------------------ */

export function setReconciled(db: Database, key: string, cleared: boolean) {
  if (cleared) db.reconciled[key] = true;
  else delete db.reconciled[key];
}

export function setStatement(db: Database, accountId: ID, balance: number | undefined, date: string | undefined) {
  const a = getAccount(db, accountId);
  a.statementBalance = balance;
  a.statementDate = date;
}
