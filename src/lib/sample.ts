/**
 * Builds a set of example books (about five weeks of trading) by running the
 * real engine, so every figure the user sees is produced the normal way.
 * All names and prices here are invented for demonstration.
 */
import {
  createEmptyDb,
  postCapital,
  postExpense,
  postPurchase,
  postReceipt,
  postSale,
  postStockEvent,
  postSupplierPayment,
  postTransfer,
  reverseDoc,
  saveAccount,
  saveCustomer,
  saveProduct,
  saveSaleDraft,
  saveSupplier,
  todayStr,
} from "./engine";
import { autoAllocate, moneyBalances, onHand, partyBalance } from "./ledger";
import type { Database, ID, PriceType } from "./types";

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSampleDb(today: string = todayStr()): Database {
  const db = createEmptyDb();
  db.meta.sample = true;
  const rand = rng(20261110);
  const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  const day = (ago: number) => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - ago);
    return todayStr(d);
  };
  /** The most that can be paid from an account while keeping a small reserve in it. */
  const afford = (accountId: ID, want: number) =>
    Math.max(0, Math.min(want, Math.floor((moneyBalances(db)[accountId] - 50000) / 1000) * 1000));
  const START = 34;
  const startIso = `${day(START)}T08:00:00.000Z`;
  db.meta.createdAt = startIso;
  db.meta.updatedAt = `${today}T18:00:00.000Z`;

  // Prices
  const prices: Record<string, [number, number, number, number]> = {
    Jumbo: [5600, 5900, 6200, 20],
    "Extra Big": [5400, 5700, 6000, 20],
    "Big 1": [5200, 5500, 5800, 25],
    "Big 2": [5000, 5300, 5600, 20],
    Medium: [4700, 5000, 5300, 20],
    Small: [4300, 4600, 4900, 15],
    "Cway water": [2300, 2500, 2700, 40],
  };
  for (const p of [...db.products]) {
    const [costPrice, wholesalePrice, retailPrice, lowStockLevel] = prices[p.name];
    saveProduct(
      db,
      { ...p, costPrice, wholesalePrice, retailPrice, lowStockLevel },
      p.id,
    );
  }
  const product = (name: string) => db.products.find((p) => p.name === name)!;
  const eggs = db.products.filter((p) => p.category === "eggs");
  const water = product("Cway water");

  // Cash and bank
  const cash = db.accounts[0];
  cash.createdAt = startIso;
  saveAccount(db, { ...cash, openingBalance: 150000 }, cash.id);
  const bank = saveAccount(
    db,
    { name: "Business bank account", type: "bank", bankName: "Sample Bank", accountNumber: "0000000000", openingBalance: 850000, active: true },
    undefined,
    startIso,
  );

  // Suppliers and customers
  const farmA = saveSupplier(db, { name: "Adeyemi Poultry Farm", phone: "0800 000 0001", address: "Sample farm settlement, Ogun State", openingBalance: 120000 }, undefined, startIso);
  const farmB = saveSupplier(db, { name: "Sunrise Farms", phone: "0800 000 0002", address: "Sample road, Ogun State", openingBalance: 0 }, undefined, startIso);
  const depot = saveSupplier(db, { name: "Arepo Water Depot", phone: "0800 000 0003", address: "Sample depot, Arepo", openingBalance: 0 }, undefined, startIso);

  const customers: { id: ID; type: PriceType }[] = [
    { id: saveCustomer(db, { name: "Mama Tolu Stores", phone: "0800 000 0101", address: "Sample market, shop 14", category: "retail", openingBalance: 45000, creditLimit: 150000 }, undefined, startIso), type: "retail" },
    { id: saveCustomer(db, { name: "Blessing Supermarket", phone: "0800 000 0102", address: "Sample street 22", category: "wholesale", openingBalance: 0, creditLimit: 600000 }, undefined, startIso), type: "wholesale" },
    { id: saveCustomer(db, { name: "Chuks Bakery", phone: "0800 000 0103", address: "Sample close 5", category: "wholesale", openingBalance: 0, creditLimit: 400000 }, undefined, startIso), type: "wholesale" },
    { id: saveCustomer(db, { name: "Iya Basira Canteen", phone: "0800 000 0104", address: "Sample junction", category: "retail", openingBalance: 0, creditLimit: 80000 }, undefined, startIso), type: "retail" },
    { id: saveCustomer(db, { name: "Grace Mini Mart", phone: "0800 000 0105", address: "Sample estate gate", category: "distributor", openingBalance: 0, creditLimit: 800000 }, undefined, startIso), type: "wholesale" },
  ];

  // Opening stock
  for (const [name, qty, cost] of [
    ["Jumbo", 40, 5500],
    ["Big 1", 60, 5100],
    ["Medium", 30, 4600],
    ["Cway water", 80, 2250],
  ] as const) {
    postStockEvent(db, { date: day(START), type: "opening", productId: product(name).id, qty, unitValue: cost, reason: "Stock on hand at start" });
  }

  for (let ago = START - 1; ago >= 0; ago--) {
    const date = day(ago);

    if (ago % 5 === 3) {
      const farm = ago % 10 === 3 ? farmA : farmB;
      const sizes = [...eggs].sort(() => rand() - 0.5).slice(0, 4);
      const items = sizes.map((p) => ({ productId: p.id, qty: between(6, 12) * 5, unitCost: p.costPrice + between(-2, 2) * 50 }));
      const goods = items.reduce((s, i) => s + i.qty * i.unitCost, 0);
      const amountPaid = afford(bank, Math.round((goods * 0.6) / 1000) * 1000);
      postPurchase(db, {
        date,
        supplierId: farm,
        items,
        transportCost: between(8, 15) * 1000,
        transportAccountId: cash.id,
        amountPaid,
        paymentAccountId: amountPaid > 0 ? bank : null,
        invoiceRef: `F-${between(1000, 9999)}`,
        remarks: "",
      });
      postExpense(db, { date, category: "6040", description: "Offloading crates", amount: 2000, accountId: cash.id, reference: "" });
    }
    if (ago % 12 === 5) {
      postPurchase(db, {
        date,
        supplierId: depot,
        items: [{ productId: water.id, qty: 60, unitCost: 2300 }],
        transportCost: 5000,
        transportAccountId: cash.id,
        amountPaid: afford(bank, 138000) === 138000 ? 138000 : 0,
        paymentAccountId: afford(bank, 138000) === 138000 ? bank : null,
        invoiceRef: `W-${between(100, 999)}`,
        remarks: "",
      });
    }

    const salesToday = between(3, 5);
    for (let n = 0; n < salesToday; n++) {
      const customer = rand() < 0.35 ? null : pick(customers);
      const priceType: PriceType = customer?.type ?? "retail";
      const choices = [...db.products].sort(() => rand() - 0.5).slice(0, between(1, 3));
      const items = choices
        .map((p) => {
          const max = Math.floor(onHand(db, p.id).qty);
          const want = customer && priceType === "wholesale" ? between(5, 15) : between(1, 5);
          return { productId: p.id, qty: Math.min(want, max), unitPrice: priceType === "wholesale" ? p.wholesalePrice : p.retailPrice };
        })
        .filter((i) => i.qty > 0);
      if (!items.length) continue;
      const total = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
      const discount = customer && total > 80000 && rand() < 0.4 ? 1000 : 0;
      const roll = rand();
      const amountPaid = !customer || roll < 0.5 ? total - discount : roll < 0.8 ? Math.round(((total - discount) * 0.5) / 500) * 500 : 0;
      const id = postSale(
        db,
        {
          date,
          customerId: customer?.id ?? null,
          priceType,
          items,
          discount,
          amountPaid,
          paymentAccountId: amountPaid > 0 ? (customer && rand() < 0.6 ? bank : cash.id) : null,
          remarks: "",
        },
        { allowOverLimit: true },
      );
      if (ago === 4 && n === 0) reverseDoc(db, "sale", id, "Entered twice by mistake");
    }

    if (ago % 3 === 1) {
      const debtor = customers.find((c) => partyBalance(db, "1200", c.id) > 20000 && rand() < 0.8);
      if (debtor) {
        const owed = partyBalance(db, "1200", debtor.id);
        const pay = Math.max(5000, Math.round((owed * (0.4 + rand() * 0.5)) / 1000) * 1000);
        const value = Math.min(pay, owed);
        postReceipt(db, {
          date,
          customerId: debtor.id,
          amount: value,
          accountId: rand() < 0.7 ? bank : cash.id,
          allocations: autoAllocate(db, debtor.id, value),
          reference: rand() < 0.7 ? `TRF${between(100000, 999999)}` : "",
          remarks: "",
        });
      }
    }
    if (ago % 6 === 2) {
      for (const s of [farmA, farmB]) {
        const owed = partyBalance(db, "2000", s);
        const pay = owed > 50000 ? afford(bank, Math.round((owed * 0.5) / 1000) * 1000) : 0;
        if (pay > 0) {
          postSupplierPayment(db, { date, supplierId: s, amount: pay, accountId: bank, reference: `TRF${between(100000, 999999)}`, remarks: "" });
        }
      }
    }

    if (ago % 2 === 0) postExpense(db, { date, category: "6000", description: "Fuel for delivery van", amount: between(6, 12) * 500, accountId: cash.id, reference: "" });
    if (ago === 30) postExpense(db, { date, category: "6060", description: "Shop rent for the month", amount: 40000, accountId: bank, reference: "" });
    if (ago === 28) postCapital(db, { date, type: "capital", amount: 200000, accountId: bank, remarks: "Additional capital from owner" });
    if (ago === 22) postExpense(db, { date, category: "6020", description: "Van servicing", amount: 18500, accountId: cash.id, reference: "" });
    if (ago === 20 || ago === 9) {
      const broken = eggs.find((p) => onHand(db, p.id).qty >= 10);
      if (broken) postStockEvent(db, { date, type: "breakage", productId: broken.id, qty: 2, unitValue: 0, reason: "Crates fell while offloading" });
    }
    if (ago === 15) {
      const taken = eggs.find((p) => onHand(db, p.id).qty >= 5);
      if (taken) postStockEvent(db, { date, type: "internal_use", productId: taken.id, qty: 1, unitValue: 0, reason: "Taken home", chargeTo: "drawings" });
    }
    if (ago === 12) postExpense(db, { date, category: "6030", description: "Airtime and data", amount: 3000, accountId: cash.id, reference: "" });
    if (ago === 10) postCapital(db, { date, type: "drawing", amount: 30000, accountId: cash.id, remarks: "Personal upkeep" });
    if (ago === 5) postExpense(db, { date, category: "6050", description: "Sales assistant salary", amount: 60000, accountId: bank, reference: "" });
    if (ago === 1) postExpense(db, { date, category: "6070", description: "Account maintenance and transfer fees", amount: 525, accountId: bank, reference: "" });

    if (ago % 7 === 0) {
      const inHand = moneyBalances(db)[cash.id];
      if (inHand > 200000) {
        postTransfer(db, { date, fromAccountId: cash.id, toAccountId: bank, amount: Math.floor((inHand - 100000) / 1000) * 1000, remarks: "Cash lodged in bank" });
      }
    }
  }

  if (onHand(db, water.id).qty >= 2) {
    postStockEvent(db, {
      date: day(2),
      type: "customer_return",
      productId: water.id,
      qty: 2,
      unitValue: water.retailPrice,
      reason: "Packs leaking",
      customerId: customers[0].id,
      settlement: "credit",
      restock: false,
    });
  }

  const jumbo = product("Jumbo");
  if (onHand(db, jumbo.id).qty >= 3) {
    saveSaleDraft(db, {
      date: today,
      customerId: customers[1].id,
      priceType: "wholesale",
      items: [{ productId: jumbo.id, qty: 3, unitPrice: jumbo.wholesalePrice }],
      discount: 0,
      amountPaid: 0,
      paymentAccountId: null,
      remarks: "Awaiting confirmation",
    });
  }

  return db;
}
