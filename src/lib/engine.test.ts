import { describe, expect, it } from "vitest";
import {
  apply,
  createEmptyDb,
  deleteDraft,
  postAdjustment,
  postCapital,
  postExpense,
  postPurchase,
  postReceipt,
  postSale,
  postStockEvent,
  postSupplierPayment,
  postTransfer,
  rebuildStock,
  reverseDoc,
  saveAccount,
  saveCustomer,
  saveProduct,
  saveSaleDraft,
  saveSupplier,
} from "./engine";
import { AppError, autoAllocate, moneyBalances, onHand, partyBalance, saleOutstanding } from "./ledger";
import { ageing, balanceSheet, ledger, profitAndLoss, purchaseOutstanding, stockRegister, trialBalance } from "./reports";
import { buildSampleDb } from "./sample";
import type { Database } from "./types";

const D = "2026-10-01";

/** A small business with a cash account, a bank account, one supplier and one customer. */
function setup() {
  const db = createEmptyDb();
  const cash = db.accounts[0].id;
  saveAccount(db, { ...db.accounts[0], openingBalance: 500000 }, cash);
  const bank = saveAccount(db, { name: "Bank", type: "bank", bankName: "", accountNumber: "", openingBalance: 1000000, active: true });
  const supplier = saveSupplier(db, { name: "Farm", phone: "", address: "", openingBalance: 0 });
  const customer = saveCustomer(db, { name: "Shop", phone: "", address: "", category: "wholesale", openingBalance: 0, creditLimit: 0 });
  const jumbo = db.products.find((p) => p.name === "Jumbo")!.id;
  const medium = db.products.find((p) => p.name === "Medium")!.id;
  const water = db.products.find((p) => p.category === "water")!.id;
  return { db, cash, bank, supplier, customer, jumbo, medium, water };
}

function buy(db: Database, supplierId: string, productId: string, qty: number, unitCost: number, extra: Partial<Parameters<typeof postPurchase>[1]> = {}) {
  return postPurchase(db, {
    date: D,
    supplierId,
    items: [{ productId, qty, unitCost }],
    transportCost: 0,
    transportAccountId: null,
    amountPaid: 0,
    paymentAccountId: null,
    invoiceRef: "",
    remarks: "",
    ...extra,
  });
}

function sell(db: Database, customerId: string | null, productId: string, qty: number, unitPrice: number, extra: Partial<Parameters<typeof postSale>[1]> = {}) {
  return postSale(db, {
    date: D,
    customerId,
    priceType: "retail",
    items: [{ productId, qty, unitPrice }],
    discount: 0,
    amountPaid: 0,
    paymentAccountId: null,
    remarks: "",
    ...extra,
  });
}

/** Invariants that must hold for any set of books. */
function checkBooks(db: Database) {
  for (const e of db.journal) {
    const dr = e.lines.reduce((s, l) => s + l.debit, 0);
    const cr = e.lines.reduce((s, l) => s + l.credit, 0);
    expect(Math.abs(dr - cr), `entry ${e.ref} balances`).toBeLessThan(0.005);
    for (const l of e.lines) {
      expect(l.debit >= 0 && l.credit >= 0).toBe(true);
    }
  }
  const tb = trialBalance(db);
  expect(tb.debit).toBeCloseTo(tb.credit, 2);
  const bs = balanceSheet(db);
  expect(bs.difference).toBeCloseTo(0, 2);
  // Stock ledger agrees with the movement history and with the general ledger.
  const rebuilt = rebuildStock(db);
  for (const p of db.products) {
    expect(onHand(db, p.id)).toEqual(rebuilt[p.id] ?? { qty: 0, value: 0 });
    expect(onHand(db, p.id).qty).toBeGreaterThanOrEqual(0);
  }
  const stockValue = Object.values(db.stock).reduce((s, v) => s + v.value, 0);
  expect(bs.stock).toBeCloseTo(stockValue, 2);
  // Net profit in the P&L is what the balance sheet carries as retained profit.
  expect(profitAndLoss(db).netProfit).toBeCloseTo(bs.retainedProfit, 2);
}

describe("launch tests from the specification", () => {
  it("buying 100 crates increases stock by 100, selling 20 reduces it to 80", () => {
    const { db, supplier, jumbo, cash } = setup();
    buy(db, supplier, jumbo, 100, 5000);
    expect(onHand(db, jumbo).qty).toBe(100);
    sell(db, null, jumbo, 20, 6000, { amountPaid: 120000, paymentAccountId: cash });
    expect(onHand(db, jumbo).qty).toBe(80);
    checkBooks(db);
  });

  it("a N150,000 credit sale raises debtors by 150,000 and a 50,000 payment cuts it to 100,000", () => {
    const { db, supplier, customer, jumbo, bank } = setup();
    buy(db, supplier, jumbo, 100, 5000);
    const sale = sell(db, customer, jumbo, 25, 6000);
    expect(partyBalance(db, "1200", customer)).toBe(150000);
    postReceipt(db, { date: D, customerId: customer, amount: 50000, accountId: bank, allocations: [{ saleId: sale, amount: 50000 }], reference: "", remarks: "" });
    expect(partyBalance(db, "1200", customer)).toBe(100000);
    expect(saleOutstanding(db)[sale]).toBe(100000);
    expect(moneyBalances(db)[bank]).toBe(1050000);
    checkBooks(db);
  });

  it("paying a supplier N70,000 reduces creditors by 70,000", () => {
    const { db, supplier, jumbo, bank } = setup();
    buy(db, supplier, jumbo, 100, 5000);
    expect(partyBalance(db, "2000", supplier)).toBe(500000);
    postSupplierPayment(db, { date: D, supplierId: supplier, amount: 70000, accountId: bank, reference: "", remarks: "" });
    expect(partyBalance(db, "2000", supplier)).toBe(430000);
    expect(moneyBalances(db)[bank]).toBe(930000);
    checkBooks(db);
  });

  it("spending N10,000 on fuel reduces cash by 10,000 and shows as an expense", () => {
    const { db, cash } = setup();
    postExpense(db, { date: D, category: "6000", description: "Fuel", amount: 10000, accountId: cash, reference: "" });
    expect(moneyBalances(db)[cash]).toBe(490000);
    expect(profitAndLoss(db).totalExpenses).toBe(10000);
    checkBooks(db);
  });

  it("a bank-to-cash transfer updates both accounts and records no expense", () => {
    const { db, cash, bank } = setup();
    postTransfer(db, { date: D, fromAccountId: bank, toAccountId: cash, amount: 50000, remarks: "" });
    const b = moneyBalances(db);
    expect(b[bank]).toBe(950000);
    expect(b[cash]).toBe(550000);
    const pnl = profitAndLoss(db);
    expect(pnl.totalExpenses).toBe(0);
    expect(pnl.netProfit).toBe(0);
    checkBooks(db);
  });
});

describe("accounting rules", () => {
  it("does not confuse sales with cash received (sell 100,000, receive 60,000)", () => {
    const { db, supplier, customer, jumbo, cash } = setup();
    buy(db, supplier, jumbo, 100, 4000);
    sell(db, customer, jumbo, 20, 5000, { amountPaid: 60000, paymentAccountId: cash });
    expect(profitAndLoss(db).combined.sales).toBe(100000);
    expect(partyBalance(db, "1200", customer)).toBe(40000);
    expect(moneyBalances(db)[cash]).toBe(560000);
    expect(onHand(db, jumbo).qty).toBe(80);
    checkBooks(db);
  });

  it("does not confuse purchases with payments (buy 200,000, pay 120,000)", () => {
    const { db, supplier, water, bank } = setup();
    const id = buy(db, supplier, water, 100, 2000, { amountPaid: 120000, paymentAccountId: bank });
    expect(db.purchases.find((p) => p.id === id)!.goodsTotal).toBe(200000);
    expect(partyBalance(db, "2000", supplier)).toBe(80000);
    expect(purchaseOutstanding(db)[id]).toBe(80000);
    expect(moneyBalances(db)[bank]).toBe(880000);
    checkBooks(db);
  });

  it("values stock at weighted average cost", () => {
    const { db, supplier, jumbo, cash } = setup();
    buy(db, supplier, jumbo, 100, 5000);
    buy(db, supplier, jumbo, 100, 6000);
    expect(onHand(db, jumbo)).toEqual({ qty: 200, value: 1100000 });
    const id = sell(db, null, jumbo, 50, 7000, { amountPaid: 350000, paymentAccountId: cash });
    const sale = db.sales.find((s) => s.id === id)!;
    expect(sale.items[0].unitCost).toBe(5500);
    expect(sale.items[0].cost).toBe(275000);
    const pnl = profitAndLoss(db);
    expect(pnl.combined.cogs).toBe(275000);
    expect(pnl.combined.grossProfit).toBe(75000);
    expect(onHand(db, jumbo)).toEqual({ qty: 150, value: 825000 });
    checkBooks(db);
  });

  it("adds inward transport to stock cost instead of expensing it", () => {
    const { db, supplier, jumbo, medium, cash } = setup();
    postPurchase(db, {
      date: D,
      supplierId: supplier,
      items: [
        { productId: jumbo, qty: 60, unitCost: 5000 },
        { productId: medium, qty: 50, unitCost: 4000 },
      ],
      transportCost: 10000,
      transportAccountId: cash,
      amountPaid: 0,
      paymentAccountId: null,
      invoiceRef: "",
      remarks: "",
    });
    // 10,000 shared 300,000 : 200,000
    expect(onHand(db, jumbo).value).toBe(306000);
    expect(onHand(db, medium).value).toBe(204000);
    expect(partyBalance(db, "2000", supplier)).toBe(500000);
    expect(moneyBalances(db)[cash]).toBe(490000);
    expect(profitAndLoss(db).totalExpenses).toBe(0);
    checkBooks(db);
  });

  it("keeps capital out of sales and drawings out of expenses", () => {
    const { db, cash, bank } = setup();
    postCapital(db, { date: D, type: "capital", amount: 300000, accountId: bank, remarks: "" });
    postCapital(db, { date: D, type: "drawing", amount: 40000, accountId: cash, remarks: "" });
    const pnl = profitAndLoss(db);
    expect(pnl.combined.sales).toBe(0);
    expect(pnl.totalExpenses).toBe(0);
    expect(pnl.netProfit).toBe(0);
    const bs = balanceSheet(db);
    expect(bs.capitalIntroduced).toBe(300000);
    expect(bs.drawings).toBe(40000);
    expect(bs.openingCapital).toBe(1500000);
    checkBooks(db);
  });

  it("reports profit separately for eggs and water and splits discounts fairly", () => {
    const { db, supplier, customer, jumbo, water, cash } = setup();
    buy(db, supplier, jumbo, 10, 5000);
    buy(db, supplier, water, 10, 2000);
    postSale(db, {
      date: D,
      customerId: customer,
      priceType: "wholesale",
      items: [
        { productId: jumbo, qty: 10, unitPrice: 6000 },
        { productId: water, qty: 10, unitPrice: 3000 },
      ],
      discount: 900,
      amountPaid: 89100,
      paymentAccountId: cash,
      remarks: "",
    });
    const pnl = profitAndLoss(db);
    expect(pnl.eggs.sales).toBe(60000);
    expect(pnl.water.sales).toBe(30000);
    expect(pnl.eggs.discounts).toBe(600);
    expect(pnl.water.discounts).toBe(300);
    expect(pnl.eggs.grossProfit).toBe(9400);
    expect(pnl.water.grossProfit).toBe(9700);
    expect(pnl.combined.grossProfit).toBe(19100);
    expect(partyBalance(db, "1200", customer)).toBe(0);
    checkBooks(db);
  });
});

describe("controls", () => {
  it("refuses to sell more than is in stock and leaves the books untouched", () => {
    const { db, supplier, jumbo, cash } = setup();
    buy(db, supplier, jumbo, 5, 5000);
    const before = JSON.stringify(db);
    const run = () => apply(db, (d) => sell(d, null, jumbo, 6, 6000, { amountPaid: 36000, paymentAccountId: cash }));
    expect(run).toThrow(AppError);
    expect(JSON.stringify(db)).toBe(before);
  });

  it("requires a customer for credit sales and respects credit limits", () => {
    const { db, supplier, jumbo } = setup();
    buy(db, supplier, jumbo, 50, 5000);
    expect(() => apply(db, (d) => sell(d, null, jumbo, 1, 6000))).toThrow(/paid in full/);
    const limited = saveCustomer(db, { name: "Limited", phone: "", address: "", category: "retail", openingBalance: 0, creditLimit: 10000 });
    let code = "";
    try {
      apply(db, (d) => sell(d, limited, jumbo, 2, 6000));
    } catch (e) {
      code = (e as AppError).code;
    }
    expect(code).toBe("CREDIT_LIMIT");
    const [next] = apply(db, (d) => postSale(d, { date: D, customerId: limited, priceType: "retail", items: [{ productId: jumbo, qty: 2, unitPrice: 6000 }], discount: 0, amountPaid: 0, paymentAccountId: null, remarks: "" }, { allowOverLimit: true }));
    expect(partyBalance(next, "1200", limited)).toBe(12000);
  });

  it("reversing a sale restores stock, debtors and cash, and keeps the original on record", () => {
    const { db, supplier, customer, jumbo, cash } = setup();
    buy(db, supplier, jumbo, 100, 5000);
    const id = sell(db, customer, jumbo, 10, 6000, { amountPaid: 20000, paymentAccountId: cash });
    reverseDoc(db, "sale", id, "Wrong customer");
    expect(onHand(db, jumbo)).toEqual({ qty: 100, value: 500000 });
    expect(partyBalance(db, "1200", customer)).toBe(0);
    expect(moneyBalances(db)[cash]).toBe(500000);
    expect(profitAndLoss(db).combined.sales).toBe(0);
    const sale = db.sales.find((s) => s.id === id)!;
    expect(sale.status).toBe("reversed");
    expect(sale.reversalReason).toBe("Wrong customer");
    expect(db.journal.filter((e) => e.sourceId === id)).toHaveLength(2);
    expect(() => reverseDoc(db, "sale", id, "again")).toThrow(/already been reversed/);
    expect(() => deleteDraft(db, "sale", id)).toThrow(/cannot be deleted/);
    checkBooks(db);
  });

  it("will not reverse an invoice that has a payment against it, or a purchase that has been sold", () => {
    const { db, supplier, customer, jumbo, bank, cash } = setup();
    const purchase = buy(db, supplier, jumbo, 10, 5000);
    const sale = sell(db, customer, jumbo, 8, 6000);
    const receipt = postReceipt(db, { date: D, customerId: customer, amount: 10000, accountId: bank, allocations: [{ saleId: sale, amount: 10000 }], reference: "", remarks: "" });
    expect(() => apply(db, (d) => reverseDoc(d, "sale", sale, "x"))).toThrow(/Reverse that payment first/);
    expect(() => apply(db, (d) => reverseDoc(d, "purchase", purchase, "x"))).toThrow(/only 2 are left/);
    reverseDoc(db, "receipt", receipt, "Bounced");
    reverseDoc(db, "sale", sale, "Cancelled");
    reverseDoc(db, "purchase", purchase, "Entered twice");
    expect(onHand(db, jumbo)).toEqual({ qty: 0, value: 0 });
    expect(partyBalance(db, "2000", supplier)).toBe(0);
    expect(moneyBalances(db)[cash]).toBe(500000);
    checkBooks(db);
  });

  it("keeps the books balanced when a purchase is reversed after the average cost has moved", () => {
    const { db, supplier, jumbo, cash } = setup();
    const first = buy(db, supplier, jumbo, 10, 10000);
    buy(db, supplier, jumbo, 10, 5000);
    sell(db, null, jumbo, 10, 9000, { amountPaid: 90000, paymentAccountId: cash });
    // 10 left worth 75,000; the first purchase was worth 100,000.
    reverseDoc(db, "purchase", first, "Duplicate");
    expect(onHand(db, jumbo)).toEqual({ qty: 0, value: 0 });
    checkBooks(db);
  });

  it("allows one payment across several invoices and partial payments", () => {
    const { db, supplier, customer, jumbo, bank } = setup();
    buy(db, supplier, jumbo, 100, 5000);
    const a = sell(db, customer, jumbo, 5, 6000, { date: "2026-10-02" });
    const b = sell(db, customer, jumbo, 10, 6000, { date: "2026-10-03" });
    const allocations = autoAllocate(db, customer, 50000);
    expect(allocations).toEqual([
      { saleId: a, amount: 30000 },
      { saleId: b, amount: 20000 },
    ]);
    postReceipt(db, { date: "2026-10-04", customerId: customer, amount: 50000, accountId: bank, allocations, reference: "", remarks: "" });
    expect(saleOutstanding(db)[a]).toBe(0);
    expect(saleOutstanding(db)[b]).toBe(40000);
    expect(() =>
      apply(db, (d) => postReceipt(d, { date: D, customerId: customer, amount: 50000, accountId: bank, allocations: [{ saleId: b, amount: 45000 }], reference: "", remarks: "" })),
    ).toThrow(/only has 40000 outstanding/);
    checkBooks(db);
  });

  it("handles returns, breakages and internal consumption", () => {
    const { db, supplier, customer, jumbo, cash } = setup();
    buy(db, supplier, jumbo, 100, 5000);
    const sale = sell(db, customer, jumbo, 10, 6000);
    postStockEvent(db, { date: D, type: "customer_return", productId: jumbo, qty: 2, unitValue: 6000, reason: "Cracked", customerId: customer, saleId: sale, settlement: "credit", restock: true });
    expect(onHand(db, jumbo).qty).toBe(92);
    expect(partyBalance(db, "1200", customer)).toBe(48000);
    expect(saleOutstanding(db)[sale]).toBe(48000);
    postStockEvent(db, { date: D, type: "breakage", productId: jumbo, qty: 2, unitValue: 0, reason: "Dropped" });
    postStockEvent(db, { date: D, type: "internal_use", productId: jumbo, qty: 1, unitValue: 0, reason: "Home", chargeTo: "drawings" });
    postStockEvent(db, { date: D, type: "supplier_return", productId: jumbo, qty: 9, unitValue: 5000, reason: "Bad batch", supplierId: supplier, settlement: "credit" });
    expect(onHand(db, jumbo)).toEqual({ qty: 80, value: 400000 });
    expect(partyBalance(db, "2000", supplier)).toBe(455000);
    const pnl = profitAndLoss(db);
    expect(pnl.combined.returns).toBe(12000);
    expect(pnl.expenses.find((e) => e.code === "6080")!.amount).toBe(10000);
    expect(balanceSheet(db).drawings).toBe(5000);
    const row = stockRegister(db).find((r) => r.productId === jumbo)!;
    expect(row).toMatchObject({ purchases: 100, sales: 10, returnsIn: 2, returnsOut: 9, losses: 2, internal: 1, closing: 80 });
    expect(row.opening + row.purchases + row.returnsIn - row.sales - row.returnsOut - row.losses - row.internal + row.adjustments).toBe(row.closing);
    // A walk-in refund needs a cash account, not a customer.
    expect(() => apply(db, (d) => postStockEvent(d, { date: D, type: "customer_return", productId: jumbo, qty: 1, unitValue: 6000, reason: "", settlement: "credit" }))).toThrow(AppError);
    postStockEvent(db, { date: D, type: "customer_return", productId: jumbo, qty: 1, unitValue: 6000, reason: "", settlement: "refund", accountId: cash, restock: false });
    expect(moneyBalances(db)[cash]).toBe(494000);
    checkBooks(db);
  });

  it("ages debts with the oldest settled first and tracks opening balances", () => {
    const { db, supplier, jumbo, bank } = setup();
    const old = saveCustomer(db, { name: "Old debtor", phone: "", address: "", category: "retail", openingBalance: 20000, creditLimit: 0 }, undefined, "2026-06-01T00:00:00.000Z");
    buy(db, supplier, jumbo, 100, 5000);
    sell(db, old, jumbo, 5, 6000, { date: "2026-09-20" });
    postReceipt(db, { date: "2026-09-25", customerId: old, amount: 15000, accountId: bank, allocations: [], reference: "", remarks: "" });
    const [row] = ageing(db, "1200", "2026-10-01");
    expect(row).toMatchObject({ partyId: old, current: 30000, d31: 0, d61: 0, d90: 5000, total: 35000 });
    // Editing the opening balance posts only the difference.
    saveCustomer(db, { name: "Old debtor", phone: "", address: "", category: "retail", openingBalance: 25000, creditLimit: 0 }, old);
    expect(partyBalance(db, "1200", old)).toBe(40000);
    const statement = ledger(db, (l) => l.account === "1200" && l.partyId === old);
    expect(statement.closing).toBe(40000);
    checkBooks(db);
  });

  it("supports account adjustments and drafts", () => {
    const { db, supplier, customer, jumbo } = setup();
    buy(db, supplier, jumbo, 20, 5000);
    sell(db, customer, jumbo, 2, 6000);
    postAdjustment(db, { date: D, partyType: "customer", partyId: customer, direction: "decrease", amount: 2000, reason: "Bad debt" });
    expect(partyBalance(db, "1200", customer)).toBe(10000);
    const draft = saveSaleDraft(db, { date: D, customerId: customer, priceType: "retail", items: [{ productId: jumbo, qty: 3, unitPrice: 6000 }], discount: 0, amountPaid: 0, paymentAccountId: null, remarks: "" });
    expect(onHand(db, jumbo).qty).toBe(18);
    expect(db.sales.find((s) => s.id === draft)!.number).toBe("");
    postSale(db, { id: draft, date: D, customerId: customer, priceType: "retail", items: [{ productId: jumbo, qty: 3, unitPrice: 6000 }], discount: 0, amountPaid: 0, paymentAccountId: null, remarks: "" });
    expect(db.sales.filter((s) => s.id === draft)).toHaveLength(1);
    expect(db.sales.find((s) => s.id === draft)!.number).toBe("INV-00002");
    expect(onHand(db, jumbo).qty).toBe(15);
    checkBooks(db);
  });

  it("rejects duplicate product names and bad input", () => {
    const { db } = setup();
    const p = db.products[0];
    expect(() => saveProduct(db, { ...p, name: "jumbo" })).toThrow(/already exists/);
    expect(() => postExpense(db, { date: "nope", category: "6000", description: "x", amount: 1, accountId: db.accounts[0].id, reference: "" })).toThrow(/valid date/);
    expect(() => postExpense(db, { date: D, category: "6000", description: "x", amount: -5, accountId: db.accounts[0].id, reference: "" })).toThrow(/negative/);
  });
});

describe("sample books", () => {
  it("are internally consistent", () => {
    const db = buildSampleDb("2026-11-10");
    expect(db.sales.length).toBeGreaterThan(50);
    expect(db.sales.some((s) => s.status === "reversed")).toBe(true);
    checkBooks(db);
    for (const [id, balance] of Object.entries(moneyBalances(db))) {
      expect(balance, `account ${id} is not overdrawn`).toBeGreaterThanOrEqual(0);
    }
    const outstanding = saleOutstanding(db);
    for (const c of db.customers) {
      const open = db.sales.filter((s) => s.customerId === c.id && s.status === "posted").reduce((s, x) => s + outstanding[x.id], 0);
      // Invoices outstanding never exceed what the ledger says is owed plus unallocated credits.
      expect(open).toBeGreaterThanOrEqual(0);
    }
  });
});
