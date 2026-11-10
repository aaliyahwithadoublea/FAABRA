import type { AccountCode, ExpenseCategory, StockEventType, MovementType, SourceType } from "./types";

export type AccountKind = "asset" | "liability" | "equity" | "income" | "cost" | "expense";

export const CHART: Record<AccountCode, { name: string; kind: AccountKind }> = {
  "1000": { name: "Cash in hand", kind: "asset" },
  "1100": { name: "Bank", kind: "asset" },
  "1200": { name: "Debtors (customers)", kind: "asset" },
  "1300": { name: "Stock", kind: "asset" },
  "2000": { name: "Creditors (suppliers)", kind: "liability" },
  "3000": { name: "Capital introduced", kind: "equity" },
  "3100": { name: "Owner's drawings", kind: "equity" },
  "3200": { name: "Opening capital", kind: "equity" },
  "4000": { name: "Sales", kind: "income" },
  "4100": { name: "Sales discounts", kind: "income" },
  "4200": { name: "Sales returns", kind: "income" },
  "4900": { name: "Other income", kind: "income" },
  "5000": { name: "Cost of goods sold", kind: "cost" },
  "5100": { name: "Stock adjustments", kind: "cost" },
  "6000": { name: "Fuel", kind: "expense" },
  "6010": { name: "Transportation", kind: "expense" },
  "6020": { name: "Vehicle maintenance", kind: "expense" },
  "6030": { name: "Telephone", kind: "expense" },
  "6040": { name: "Loading and offloading", kind: "expense" },
  "6050": { name: "Staff salaries", kind: "expense" },
  "6060": { name: "Rent", kind: "expense" },
  "6070": { name: "Bank charges", kind: "expense" },
  "6080": { name: "Breakages and losses", kind: "expense" },
  "6090": { name: "General administration", kind: "expense" },
  "6100": { name: "Other expenses", kind: "expense" },
  "6110": { name: "Internal consumption", kind: "expense" },
  "6120": { name: "Bad debts written off", kind: "expense" },
};

export const ACCOUNT_CODES = Object.keys(CHART).sort() as AccountCode[];

/** Categories the user can pick when recording an expense. */
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "6000",
  "6010",
  "6020",
  "6030",
  "6040",
  "6050",
  "6060",
  "6070",
  "6080",
  "6090",
  "6100",
];

/** +1 when the account normally carries a debit balance, -1 for credit. */
export function normalSide(code: AccountCode): 1 | -1 {
  const kind = CHART[code].kind;
  return kind === "asset" || kind === "cost" || kind === "expense" ? 1 : -1;
}

export const STOCK_EVENT_LABELS: Record<StockEventType, string> = {
  opening: "Opening stock",
  customer_return: "Customer return",
  supplier_return: "Return to supplier",
  breakage: "Breakage / damage",
  internal_use: "Internal consumption",
  adjustment_in: "Stock found (count up)",
  adjustment_out: "Stock missing (count down)",
};

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  opening: "Opening stock",
  purchase: "Purchase",
  sale: "Sale",
  customer_return: "Customer return",
  supplier_return: "Return to supplier",
  breakage: "Breakage / damage",
  internal_use: "Internal consumption",
  adjustment: "Stock adjustment",
};

export const SOURCE_LABELS: Record<SourceType, string> = {
  sale: "Sale",
  purchase: "Purchase",
  receipt: "Customer payment",
  supplierPayment: "Supplier payment",
  expense: "Expense",
  transfer: "Transfer",
  stockEvent: "Stock event",
  capital: "Capital & drawings",
  adjustment: "Account adjustment",
  opening: "Opening balance",
};

/** Where a document can be opened in the app, if it has its own page. */
export function sourceHref(type: SourceType, id: string): string | null {
  switch (type) {
    case "sale":
      return `/sales/view?id=${id}`;
    case "purchase":
      return `/purchases/view?id=${id}`;
    case "receipt":
      return "/receipts";
    case "supplierPayment":
      return "/payments";
    case "expense":
      return "/expenses";
    case "transfer":
      return "/money";
    case "stockEvent":
      return "/returns";
    case "capital":
      return "/capital";
    default:
      return null;
  }
}
