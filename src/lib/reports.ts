/** Read-only views over the books. Everything here is derived from the journal and stock movements. */
import { CHART, ACCOUNT_CODES, normalSide } from "./chart";
import { moneyBalances, partyBalances, r2, r3 } from "./ledger";
import type {
  AccountCode,
  Database,
  ID,
  JournalEntry,
  JournalLine,
  MovementType,
  ProductCategory,
  SourceType,
} from "./types";

const inRange = (date: string, from?: string, to?: string) => (!from || date >= from) && (!to || date <= to);

function sortedJournal(db: Database): JournalEntry[] {
  return [...db.journal].sort((a, b) => (a.date === b.date ? a.seq - b.seq : a.date.localeCompare(b.date)));
}

/* ------------------------------ Ledgers ------------------------------ */

export interface LedgerRow {
  key: string;
  date: string;
  ref: string;
  sourceType: SourceType;
  sourceId: ID;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  cancelled: boolean;
}

export interface Ledger {
  opening: number;
  rows: LedgerRow[];
  closing: number;
  totalDebit: number;
  totalCredit: number;
}

/**
 * Running ledger of all journal lines matching `match`.
 * `sign` is +1 for debit-balance accounts (customers, cash, bank) and -1 for
 * credit-balance accounts (suppliers).
 */
export function ledger(
  db: Database,
  match: (line: JournalLine) => boolean,
  opts: { sign?: 1 | -1; from?: string; to?: string; hideCancelled?: boolean } = {},
): Ledger {
  const sign = opts.sign ?? 1;
  let balance = 0;
  let opening = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  const rows: LedgerRow[] = [];
  for (const e of sortedJournal(db)) {
    if (opts.to && e.date > opts.to) continue;
    const cancelled = Boolean(e.reversal || e.reversed);
    e.lines.forEach((l, i) => {
      if (!match(l)) return;
      balance = r2(balance + sign * (l.debit - l.credit));
      if (opts.from && e.date < opts.from) {
        opening = balance;
        return;
      }
      if (cancelled && opts.hideCancelled) return;
      totalDebit += l.debit;
      totalCredit += l.credit;
      rows.push({
        key: `${e.id}:${i}`,
        date: e.date,
        ref: e.ref,
        sourceType: e.sourceType,
        sourceId: e.sourceId,
        description: (e.reversal ? "Reversal - " : "") + (l.note || e.memo),
        debit: l.debit,
        credit: l.credit,
        balance,
        cancelled,
      });
    });
  }
  if (opts.hideCancelled) {
    // Cancelled pairs net to zero, so recompute the running balance without them.
    let run = opening;
    for (const row of rows) {
      run = r2(run + sign * (row.debit - row.credit));
      row.balance = run;
    }
  }
  return { opening, rows, closing: balance, totalDebit: r2(totalDebit), totalCredit: r2(totalCredit) };
}

/* ------------------------------ Ageing ------------------------------- */

export interface AgeingRow {
  partyId: ID;
  current: number; // 0-30 days
  d31: number; // 31-60
  d61: number; // 61-90
  d90: number; // above 90
  total: number;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}

/**
 * Age what is owed by customers ("1200") or to suppliers ("2000").
 * Payments and credits settle the oldest debts first.
 */
export function ageing(db: Database, account: "1200" | "2000", asOf: string): AgeingRow[] {
  const balances = partyBalances(db, account, asOf);
  const debts: Record<ID, { date: string; amount: number }[]> = {};
  for (const e of sortedJournal(db)) {
    if (e.date > asOf || e.reversal || e.reversed) continue;
    for (const l of e.lines) {
      if (l.account !== account || !l.partyId) continue;
      const increase = account === "1200" ? l.debit : l.credit;
      if (increase > 0) (debts[l.partyId] ??= []).push({ date: e.date, amount: increase });
    }
  }
  const rows: AgeingRow[] = [];
  for (const [partyId, total] of Object.entries(balances)) {
    if (total === 0) continue;
    const row: AgeingRow = { partyId, current: 0, d31: 0, d61: 0, d90: 0, total };
    const list = debts[partyId] ?? [];
    const raised = list.reduce((s, d) => s + d.amount, 0);
    let settled = r2(raised - total);
    for (const d of list) {
      const paid = Math.min(settled, d.amount);
      settled = r2(settled - paid);
      const open = r2(d.amount - paid);
      if (open <= 0) continue;
      const age = daysBetween(d.date, asOf);
      if (age <= 30) row.current = r2(row.current + open);
      else if (age <= 60) row.d31 = r2(row.d31 + open);
      else if (age <= 90) row.d61 = r2(row.d61 + open);
      else row.d90 = r2(row.d90 + open);
    }
    rows.push(row);
  }
  return rows.sort((a, b) => b.total - a.total);
}

/** Unpaid amount on each posted purchase: supplier payments settle the oldest first. */
export function purchaseOutstanding(db: Database): Record<ID, number> {
  const balances = partyBalances(db, "2000");
  const out: Record<ID, number> = {};
  for (const supplier of db.suppliers) {
    const debts: { id: ID | null; date: string; order: string; amount: number }[] = [];
    if (supplier.openingBalance > 0) {
      debts.push({ id: null, date: supplier.createdAt.slice(0, 10), order: "", amount: supplier.openingBalance });
    }
    for (const p of db.purchases) {
      if (p.status === "posted" && p.supplierId === supplier.id) {
        debts.push({ id: p.id, date: p.date, order: p.number, amount: p.goodsTotal });
      }
    }
    for (const a of db.adjustments) {
      if (a.status === "posted" && a.partyType === "supplier" && a.partyId === supplier.id && a.direction === "increase") {
        debts.push({ id: null, date: a.date, order: a.number, amount: a.amount });
      }
    }
    debts.sort((a, b) => (a.date === b.date ? a.order.localeCompare(b.order) : a.date.localeCompare(b.date)));
    const raised = debts.reduce((s, d) => s + d.amount, 0);
    let settled = r2(raised - (balances[supplier.id] ?? 0));
    for (const d of debts) {
      const paid = Math.max(0, Math.min(settled, d.amount));
      settled = r2(settled - paid);
      if (d.id) out[d.id] = r2(d.amount - paid);
    }
  }
  return out;
}

/* --------------------------- Profit and loss -------------------------- */

export interface CategoryResult {
  sales: number;
  discounts: number;
  returns: number;
  netSales: number;
  cogs: number;
  stockAdjustments: number;
  costOfSales: number;
  grossProfit: number;
  /** Breakages and internal consumption traced to this category. */
  stockLosses: number;
}

export interface ProfitAndLoss {
  eggs: CategoryResult;
  water: CategoryResult;
  combined: CategoryResult;
  otherIncome: number;
  expenses: { code: AccountCode; name: string; amount: number }[];
  totalExpenses: number;
  netProfit: number;
}

const emptyResult = (): CategoryResult => ({
  sales: 0,
  discounts: 0,
  returns: 0,
  netSales: 0,
  cogs: 0,
  stockAdjustments: 0,
  costOfSales: 0,
  grossProfit: 0,
  stockLosses: 0,
});

export function profitAndLoss(db: Database, from?: string, to?: string): ProfitAndLoss {
  const eggs = emptyResult();
  const water = emptyResult();
  const combined = emptyResult();
  const expenseTotals: Partial<Record<AccountCode, number>> = {};
  let otherIncome = 0;

  for (const e of db.journal) {
    if (!inRange(e.date, from, to)) continue;
    for (const l of e.lines) {
      const targets: CategoryResult[] = [combined];
      if (l.category === "eggs") targets.push(eggs);
      if (l.category === "water") targets.push(water);
      const dr = l.debit - l.credit;
      switch (l.account) {
        case "4000":
          for (const t of targets) t.sales -= dr;
          break;
        case "4100":
          for (const t of targets) t.discounts += dr;
          break;
        case "4200":
          for (const t of targets) t.returns += dr;
          break;
        case "4900":
          otherIncome -= dr;
          break;
        case "5000":
          for (const t of targets) t.cogs += dr;
          break;
        case "5100":
          for (const t of targets) t.stockAdjustments += dr;
          break;
        default:
          if (CHART[l.account].kind === "expense") {
            expenseTotals[l.account] = (expenseTotals[l.account] ?? 0) + dr;
            if (l.category) for (const t of targets) t.stockLosses += dr;
          }
      }
    }
  }

  for (const t of [eggs, water, combined]) {
    for (const k of Object.keys(t) as (keyof CategoryResult)[]) t[k] = r2(t[k]);
    t.netSales = r2(t.sales - t.discounts - t.returns);
    t.costOfSales = r2(t.cogs + t.stockAdjustments);
    t.grossProfit = r2(t.netSales - t.costOfSales);
  }

  const expenses = ACCOUNT_CODES.filter((c) => CHART[c].kind === "expense")
    .map((code) => ({ code, name: CHART[code].name, amount: r2(expenseTotals[code] ?? 0) }))
    .filter((x) => x.amount !== 0);
  const totalExpenses = r2(expenses.reduce((s, x) => s + x.amount, 0));
  otherIncome = r2(otherIncome);
  return {
    eggs,
    water,
    combined,
    otherIncome,
    expenses,
    totalExpenses,
    netProfit: r2(combined.grossProfit + otherIncome - totalExpenses),
  };
}

/* --------------------- Trial balance & balance sheet ------------------ */

export interface TrialRow {
  code: AccountCode;
  name: string;
  debit: number;
  credit: number;
}

export function trialBalance(db: Database, asOf?: string): { rows: TrialRow[]; debit: number; credit: number } {
  const net: Partial<Record<AccountCode, number>> = {};
  for (const e of db.journal) {
    if (asOf && e.date > asOf) continue;
    for (const l of e.lines) net[l.account] = (net[l.account] ?? 0) + l.debit - l.credit;
  }
  const rows: TrialRow[] = [];
  for (const code of ACCOUNT_CODES) {
    const v = r2(net[code] ?? 0);
    if (v === 0) continue;
    rows.push({ code, name: CHART[code].name, debit: v > 0 ? v : 0, credit: v < 0 ? -v : 0 });
  }
  return {
    rows,
    debit: r2(rows.reduce((s, r) => s + r.debit, 0)),
    credit: r2(rows.reduce((s, r) => s + r.credit, 0)),
  };
}

export interface BalanceSheet {
  cash: number;
  bank: number;
  debtors: number;
  stock: number;
  totalAssets: number;
  creditors: number;
  totalLiabilities: number;
  openingCapital: number;
  capitalIntroduced: number;
  drawings: number;
  retainedProfit: number;
  totalEquity: number;
  /** totalAssets - totalLiabilities - totalEquity; always 0 when the books balance. */
  difference: number;
}

export function balanceSheet(db: Database, asOf?: string): BalanceSheet {
  const bal: Partial<Record<AccountCode, number>> = {};
  let profit = 0;
  for (const e of db.journal) {
    if (asOf && e.date > asOf) continue;
    for (const l of e.lines) {
      const kind = CHART[l.account].kind;
      if (kind === "income" || kind === "cost" || kind === "expense") profit += l.credit - l.debit;
      else bal[l.account] = (bal[l.account] ?? 0) + normalSide(l.account) * (l.debit - l.credit);
    }
  }
  const get = (c: AccountCode) => r2(bal[c] ?? 0);
  const cash = get("1000");
  const bank = get("1100");
  const debtors = get("1200");
  const stock = get("1300");
  const creditors = get("2000");
  const totalAssets = r2(cash + bank + debtors + stock);
  const openingCapital = get("3200");
  const capitalIntroduced = get("3000");
  const drawings = -get("3100");
  const retainedProfit = r2(profit);
  const totalEquity = r2(openingCapital + capitalIntroduced - drawings + retainedProfit);
  return {
    cash,
    bank,
    debtors,
    stock,
    totalAssets,
    creditors,
    totalLiabilities: creditors,
    openingCapital,
    capitalIntroduced,
    drawings,
    retainedProfit,
    totalEquity,
    difference: r2(totalAssets - creditors - totalEquity),
  };
}

/* ---------------------------- Stock register -------------------------- */

export interface StockRow {
  productId: ID;
  opening: number;
  purchases: number;
  returnsIn: number;
  sales: number;
  returnsOut: number;
  losses: number;
  internal: number;
  adjustments: number;
  closing: number;
  closingValue: number;
}

export function stockRegister(db: Database, from?: string, to?: string): StockRow[] {
  const rows = new Map<ID, StockRow>();
  for (const p of db.products) {
    rows.set(p.id, {
      productId: p.id,
      opening: 0,
      purchases: 0,
      returnsIn: 0,
      sales: 0,
      returnsOut: 0,
      losses: 0,
      internal: 0,
      adjustments: 0,
      closing: 0,
      closingValue: 0,
    });
  }
  const column: Record<MovementType, keyof StockRow> = {
    opening: "opening",
    purchase: "purchases",
    customer_return: "returnsIn",
    sale: "sales",
    supplier_return: "returnsOut",
    breakage: "losses",
    internal_use: "internal",
    adjustment: "adjustments",
  };
  /** Columns shown as positive numbers even though stock moved out. */
  const outward = new Set<keyof StockRow>(["sales", "returnsOut", "losses", "internal"]);
  for (const m of db.movements) {
    const row = rows.get(m.productId);
    if (!row || (to && m.date > to)) continue;
    row.closing += m.qty;
    row.closingValue += m.value;
    if (from && m.date < from) {
      row.opening += m.qty;
      continue;
    }
    const col = column[m.type];
    (row[col] as number) += outward.has(col) ? -m.qty : m.qty;
  }
  const list = [...rows.values()];
  for (const row of list) {
    for (const k of Object.keys(row) as (keyof StockRow)[]) {
      if (k === "productId") continue;
      (row[k] as number) = k === "closingValue" ? r2(row[k] as number) : r3(row[k] as number);
    }
    if (row.closing === 0) row.closingValue = 0;
  }
  return list;
}

/* ------------------------------ Dashboard ----------------------------- */

export interface Position {
  cash: number;
  bank: number;
  debtors: number;
  creditors: number;
  stockValue: number;
  balances: Record<ID, number>;
}

export function position(db: Database): Position {
  const balances = moneyBalances(db);
  let cash = 0;
  let bank = 0;
  for (const a of db.accounts) {
    if (a.type === "cash") cash += balances[a.id] ?? 0;
    else bank += balances[a.id] ?? 0;
  }
  const sum = (o: Record<ID, number>) => Object.values(o).reduce((s, v) => s + v, 0);
  return {
    cash: r2(cash),
    bank: r2(bank),
    debtors: r2(sum(partyBalances(db, "1200"))),
    creditors: r2(sum(partyBalances(db, "2000"))),
    stockValue: r2(Object.values(db.stock).reduce((s, v) => s + v.value, 0)),
    balances,
  };
}

export function purchasesTotal(db: Database, from?: string, to?: string): number {
  let total = 0;
  for (const p of db.purchases) if (p.status === "posted" && inRange(p.date, from, to)) total += p.total;
  return r2(total);
}

export interface DayPoint {
  date: string;
  sales: number;
  profit: number;
}

/** Net sales and gross profit for each day in the range (inclusive). */
export function dailySeries(db: Database, from: string, to: string): DayPoint[] {
  const map = new Map<string, DayPoint>();
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    map.set(date, { date, sales: 0, profit: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  for (const e of db.journal) {
    const point = map.get(e.date);
    if (!point) continue;
    for (const l of e.lines) {
      const cr = l.credit - l.debit;
      if (l.account === "4000" || l.account === "4100" || l.account === "4200") {
        point.sales += cr;
        point.profit += cr;
      } else if (l.account === "5000" || l.account === "5100") {
        point.profit += cr;
      }
    }
  }
  return [...map.values()].map((p) => ({ date: p.date, sales: r2(p.sales), profit: r2(p.profit) }));
}

export interface ProductSalesRow {
  productId: ID;
  category: ProductCategory | undefined;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
}

/** Quantity, revenue and gross profit by product for posted invoices in the range. */
export function salesByProduct(db: Database, from?: string, to?: string): ProductSalesRow[] {
  const rows = new Map<ID, ProductSalesRow>();
  for (const s of db.sales) {
    if (s.status !== "posted" || !inRange(s.date, from, to)) continue;
    const factor = s.subtotal > 0 ? s.total / s.subtotal : 1;
    for (const i of s.items) {
      const row =
        rows.get(i.productId) ??
        ({
          productId: i.productId,
          category: db.products.find((p) => p.id === i.productId)?.category,
          qty: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        } satisfies ProductSalesRow);
      row.qty += i.qty;
      row.revenue += i.qty * i.unitPrice * factor;
      row.cost += i.cost;
      rows.set(i.productId, row);
    }
  }
  return [...rows.values()]
    .map((r) => ({ ...r, qty: r3(r.qty), revenue: r2(r.revenue), cost: r2(r.cost), profit: r2(r.revenue - r.cost) }))
    .sort((a, b) => b.revenue - a.revenue);
}
