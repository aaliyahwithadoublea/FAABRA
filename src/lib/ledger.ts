import type { Database, ID, ReceiptAllocation } from "./types";

export class AppError extends Error {
  code: string;
  constructor(message: string, code = "INVALID") {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

/** Round to 2 decimal places (kobo), symmetric for negatives. */
export function r2(n: number): number {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(n) + 1e-9) * 100)) / 100 + 0;
}

/** Round quantities to 3 decimal places. */
export function r3(n: number): number {
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(n) + 1e-9) * 1000)) / 1000 + 0;
}

export function onHand(db: Database, productId: ID): { qty: number; value: number } {
  return db.stock[productId] ?? { qty: 0, value: 0 };
}

/** Weighted average cost per unit currently on hand (0 when out of stock). */
export function avgCost(db: Database, productId: ID): number {
  const s = onHand(db, productId);
  return s.qty > 0 ? s.value / s.qty : 0;
}

/** Balance of every cash/bank account, optionally as of a date (inclusive). */
export function moneyBalances(db: Database, asOf?: string): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const a of db.accounts) out[a.id] = 0;
  for (const e of db.journal) {
    if (asOf && e.date > asOf) continue;
    for (const l of e.lines) {
      if (l.moneyAccountId) out[l.moneyAccountId] = (out[l.moneyAccountId] ?? 0) + l.debit - l.credit;
    }
  }
  for (const k of Object.keys(out)) out[k] = r2(out[k]);
  return out;
}

/**
 * What each customer owes ("1200") or what is owed to each supplier ("2000").
 * Positive = they owe us / we owe them.
 */
export function partyBalances(db: Database, account: "1200" | "2000", asOf?: string): Record<ID, number> {
  const out: Record<ID, number> = {};
  const sign = account === "1200" ? 1 : -1;
  for (const e of db.journal) {
    if (asOf && e.date > asOf) continue;
    for (const l of e.lines) {
      if (l.account === account && l.partyId) {
        out[l.partyId] = (out[l.partyId] ?? 0) + sign * (l.debit - l.credit);
      }
    }
  }
  for (const k of Object.keys(out)) out[k] = r2(out[k]);
  return out;
}

export function partyBalance(db: Database, account: "1200" | "2000", partyId: ID): number {
  return partyBalances(db, account)[partyId] ?? 0;
}

/** Unpaid amount on each posted invoice. */
export function saleOutstanding(db: Database): Record<ID, number> {
  const out: Record<ID, number> = {};
  for (const s of db.sales) {
    if (s.status === "posted") out[s.id] = r2(s.total - s.amountPaid);
  }
  for (const r of db.receipts) {
    if (r.status !== "posted") continue;
    for (const a of r.allocations) {
      if (a.saleId in out) out[a.saleId] = r2(out[a.saleId] - a.amount);
    }
  }
  for (const e of db.stockEvents) {
    if (
      e.status === "posted" &&
      e.type === "customer_return" &&
      e.settlement === "credit" &&
      e.saleId &&
      e.saleId in out
    ) {
      out[e.saleId] = Math.max(0, r2(out[e.saleId] - e.value));
    }
  }
  return out;
}

/** Spread a payment over a customer's unpaid invoices, oldest first. */
export function autoAllocate(db: Database, customerId: ID, amount: number): ReceiptAllocation[] {
  const outstanding = saleOutstanding(db);
  const open = db.sales
    .filter((s) => s.status === "posted" && s.customerId === customerId && (outstanding[s.id] ?? 0) > 0)
    .sort((a, b) => (a.date === b.date ? a.number.localeCompare(b.number) : a.date.localeCompare(b.date)));
  const result: ReceiptAllocation[] = [];
  let left = r2(amount);
  for (const s of open) {
    if (left <= 0) break;
    const take = Math.min(left, outstanding[s.id]);
    result.push({ saleId: s.id, amount: r2(take) });
    left = r2(left - take);
  }
  return result;
}
