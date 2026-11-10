export type ID = string;

export type DocStatus = "draft" | "posted" | "reversed";
export type ProductCategory = "eggs" | "water";
export type CustomerCategory = "retail" | "wholesale" | "distributor";
export type PriceType = "retail" | "wholesale";

export interface BusinessSettings {
  businessName: string;
  tagline: string;
  rcNumber: string;
  phone: string;
  address: string;
  /** Shown in the "Pay by transfer" box on invoices. */
  bankName: string;
  accountNumber: string;
  accountName: string;
  invoiceFooter: string;
  /** Data URL of the uploaded logo, or "". */
  logo: string;
}

export interface Product {
  id: ID;
  code: string;
  name: string;
  category: ProductCategory;
  unit: string;
  description: string;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  lowStockLevel: number;
  active: boolean;
  createdAt: string;
}

export interface Customer {
  id: ID;
  code: string;
  name: string;
  phone: string;
  address: string;
  category: CustomerCategory;
  openingBalance: number;
  creditLimit: number;
  createdAt: string;
}

export interface Supplier {
  id: ID;
  code: string;
  name: string;
  phone: string;
  address: string;
  openingBalance: number;
  createdAt: string;
}

export interface MoneyAccount {
  id: ID;
  name: string;
  type: "cash" | "bank";
  bankName: string;
  accountNumber: string;
  openingBalance: number;
  active: boolean;
  /** Last bank statement figures entered on the reconciliation screen. */
  statementBalance?: number;
  statementDate?: string;
  createdAt: string;
}

interface DocBase {
  id: ID;
  /** Human reference such as INV-00012. Drafts have no number until posted. */
  number: string;
  date: string;
  status: DocStatus;
  createdAt: string;
  postedAt?: string;
  reversedAt?: string;
  reversalReason?: string;
}

export interface SaleItem {
  productId: ID;
  qty: number;
  unitPrice: number;
  /** Weighted average cost per unit at the moment of posting. */
  unitCost: number;
  /** Total cost of goods sold for this line. */
  cost: number;
}

export interface Sale extends DocBase {
  customerId: ID | null;
  priceType: PriceType;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  total: number;
  amountPaid: number;
  paymentAccountId: ID | null;
  remarks: string;
}

export interface PurchaseItem {
  productId: ID;
  qty: number;
  unitCost: number;
  /** Unit cost including this line's share of transport. */
  landedUnitCost: number;
  landedValue: number;
}

export interface Purchase extends DocBase {
  supplierId: ID;
  items: PurchaseItem[];
  goodsTotal: number;
  transportCost: number;
  transportAccountId: ID | null;
  /** goodsTotal + transportCost */
  total: number;
  amountPaid: number;
  paymentAccountId: ID | null;
  invoiceRef: string;
  remarks: string;
}

export interface ReceiptAllocation {
  saleId: ID;
  amount: number;
}

export interface Receipt extends DocBase {
  customerId: ID;
  amount: number;
  accountId: ID;
  allocations: ReceiptAllocation[];
  reference: string;
  remarks: string;
}

export interface SupplierPayment extends DocBase {
  supplierId: ID;
  amount: number;
  accountId: ID;
  reference: string;
  remarks: string;
}

export interface Expense extends DocBase {
  category: ExpenseCategory;
  description: string;
  amount: number;
  accountId: ID;
  reference: string;
}

export interface Transfer extends DocBase {
  fromAccountId: ID;
  toAccountId: ID;
  amount: number;
  remarks: string;
}

export type StockEventType =
  | "opening"
  | "customer_return"
  | "supplier_return"
  | "breakage"
  | "internal_use"
  | "adjustment_in"
  | "adjustment_out";

export interface StockEvent extends DocBase {
  type: StockEventType;
  productId: ID;
  qty: number;
  /**
   * Per-unit amount entered by the user: refund/credit price for returns,
   * cost for opening stock and stock found. 0 where cost is automatic.
   */
  unitValue: number;
  /** Money value of the event (qty x unitValue, or cost removed from stock). */
  value: number;
  reason: string;
  customerId?: ID | null;
  supplierId?: ID | null;
  saleId?: ID | null;
  /** Returns: credit the account, or refund in cash/bank. */
  settlement?: "credit" | "refund";
  accountId?: ID | null;
  /** Customer returns: put the goods back on the shelf or write them off. */
  restock?: boolean;
  /** Internal consumption: business expense or owner's drawings. */
  chargeTo?: "expense" | "drawings";
}

export interface CapitalEntry extends DocBase {
  type: "capital" | "drawing";
  amount: number;
  accountId: ID;
  remarks: string;
}

export interface PartyAdjustment extends DocBase {
  partyType: "customer" | "supplier";
  partyId: ID;
  direction: "increase" | "decrease";
  amount: number;
  reason: string;
}

export type SourceType =
  | "sale"
  | "purchase"
  | "receipt"
  | "supplierPayment"
  | "expense"
  | "transfer"
  | "stockEvent"
  | "capital"
  | "adjustment"
  | "opening";

export type AccountCode =
  | "1000"
  | "1100"
  | "1200"
  | "1300"
  | "2000"
  | "3000"
  | "3100"
  | "3200"
  | "4000"
  | "4100"
  | "4200"
  | "4900"
  | "5000"
  | "5100"
  | ExpenseCategory;

export type ExpenseCategory =
  | "6000"
  | "6010"
  | "6020"
  | "6030"
  | "6040"
  | "6050"
  | "6060"
  | "6070"
  | "6080"
  | "6090"
  | "6100"
  | "6110"
  | "6120";

export interface JournalLine {
  account: AccountCode;
  debit: number;
  credit: number;
  moneyAccountId?: ID;
  partyId?: ID;
  productId?: ID;
  category?: ProductCategory;
  note?: string;
}

export interface JournalEntry {
  id: ID;
  seq: number;
  date: string;
  createdAt: string;
  sourceType: SourceType;
  sourceId: ID;
  ref: string;
  memo: string;
  lines: JournalLine[];
  /** True for the entry that cancels another one. */
  reversal?: boolean;
  /** True once this entry has been cancelled by a reversal. */
  reversed?: boolean;
}

export type MovementType =
  | "opening"
  | "purchase"
  | "sale"
  | "customer_return"
  | "supplier_return"
  | "breakage"
  | "internal_use"
  | "adjustment";

export interface StockMovement {
  id: ID;
  seq: number;
  date: string;
  productId: ID;
  type: MovementType;
  /** Positive = into stock, negative = out of stock. */
  qty: number;
  /** Signed cost value moved. */
  value: number;
  sourceType: SourceType;
  sourceId: ID;
  ref: string;
  note: string;
  reversal?: boolean;
  reversed?: boolean;
}

export interface AuditEntry {
  id: ID;
  at: string;
  action: string;
  entity: string;
  ref: string;
  summary: string;
}

export interface Database {
  version: number;
  meta: {
    createdAt: string;
    sample: boolean;
    lastBackupAt: string | null;
    /** Last time the books changed (local or cloud). Used to pick the newer copy when syncing. */
    updatedAt: string;
  };
  settings: BusinessSettings;
  products: Product[];
  customers: Customer[];
  suppliers: Supplier[];
  accounts: MoneyAccount[];
  sales: Sale[];
  purchases: Purchase[];
  receipts: Receipt[];
  supplierPayments: SupplierPayment[];
  expenses: Expense[];
  transfers: Transfer[];
  stockEvents: StockEvent[];
  capitalEntries: CapitalEntry[];
  adjustments: PartyAdjustment[];
  journal: JournalEntry[];
  movements: StockMovement[];
  audit: AuditEntry[];
  counters: Record<string, number>;
  /** Running quantity and cost value on hand per product. */
  stock: Record<ID, { qty: number; value: number }>;
  /** Bank reconciliation ticks, keyed by `${journalEntryId}:${lineIndex}`. */
  reconciled: Record<string, boolean>;
}

export const DB_KEYS = [
  "version",
  "meta",
  "settings",
  "products",
  "customers",
  "suppliers",
  "accounts",
  "sales",
  "purchases",
  "receipts",
  "supplierPayments",
  "expenses",
  "transfers",
  "stockEvents",
  "capitalEntries",
  "adjustments",
  "journal",
  "movements",
  "audit",
  "counters",
  "stock",
  "reconciled",
] as const satisfies readonly (keyof Database)[];
