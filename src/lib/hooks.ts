"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { productLabel } from "./engine";
import { money, units } from "./format";
import { moneyBalances, onHand, partyBalances, saleOutstanding } from "./ledger";
import { useDb } from "./store";
import type { Database, ID, MoneyAccount, Product } from "./types";
import type { Option } from "@/components/ui";

export function useMoneyBalances(): Record<ID, number> {
  const db = useDb();
  return useMemo(() => moneyBalances(db), [db]);
}

export function useCustomerBalances(): Record<ID, number> {
  const db = useDb();
  return useMemo(() => partyBalances(db, "1200"), [db]);
}

export function useSupplierBalances(): Record<ID, number> {
  const db = useDb();
  return useMemo(() => partyBalances(db, "2000"), [db]);
}

export function useSaleOutstanding(): Record<ID, number> {
  const db = useDb();
  return useMemo(() => saleOutstanding(db), [db]);
}

/** Lookups by id, rebuilt only when the underlying list changes. */
export function useLookups() {
  const db = useDb();
  const products = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products]);
  const customers = useMemo(() => new Map(db.customers.map((c) => [c.id, c])), [db.customers]);
  const suppliers = useMemo(() => new Map(db.suppliers.map((s) => [s.id, s])), [db.suppliers]);
  const accounts = useMemo(() => new Map(db.accounts.map((a) => [a.id, a])), [db.accounts]);
  return { products, customers, suppliers, accounts };
}

export function customerOptions(db: Database, balances: Record<ID, number>): Option[] {
  return [...db.customers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      value: c.id,
      label: c.name,
      sub: [c.code, c.phone].filter(Boolean).join(" · "),
      right: balances[c.id] ? `Owes ${money(balances[c.id])}` : undefined,
    }));
}

export function supplierOptions(db: Database, balances: Record<ID, number>): Option[] {
  return [...db.suppliers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({
      value: s.id,
      label: s.name,
      sub: [s.code, s.phone].filter(Boolean).join(" · "),
      right: balances[s.id] ? `Owed ${money(balances[s.id])}` : undefined,
    }));
}

export function productOptions(db: Database, includeInactive = false): Option[] {
  return db.products
    .filter((p) => includeInactive || p.active)
    .map((p) => ({ value: p.id, label: productLabel(p), right: units(onHand(db, p.id).qty, p.unit) }));
}

export function activeAccounts(db: Database): MoneyAccount[] {
  return db.accounts.filter((a) => a.active);
}

/** Active products, eggs first, in register order. */
export function activeProducts(db: Database): Product[] {
  return db.products.filter((p) => p.active);
}

const subscribeOnline = (notify: () => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};

/** True while the browser reports a network connection. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Object-shaped form state with a typed field setter. */
export function useFields<T extends object>(initial: T | (() => T)) {
  const [values, setValues] = useState<T>(initial);
  const set = <K extends keyof T>(key: K, value: T[K]) => setValues((prev) => ({ ...prev, [key]: value }));
  return [values, set, setValues] as const;
}
