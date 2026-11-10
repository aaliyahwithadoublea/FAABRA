"use client";

import {
  ArrowLeftRight,
  Banknote,
  BookOpen,
  ClipboardList,
  CreditCard,
  Egg,
  FileSpreadsheet,
  HandCoins,
  Scale,
  Settings,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui";

const GROUPS = [
  {
    title: "Day to day",
    items: [
      { href: "/receipts", label: "Customer payments", hint: "Money received", icon: HandCoins },
      { href: "/payments", label: "Supplier payments", hint: "Money paid out", icon: CreditCard },
      { href: "/expenses", label: "Expenses", hint: "Fuel, rent, salaries", icon: Banknote },
      { href: "/money", label: "Cash & bank", hint: "Balances and transfers", icon: Wallet },
      { href: "/returns", label: "Returns & damages", hint: "Breakages and returns", icon: ClipboardList },
      { href: "/capital", label: "Capital & drawings", hint: "Owner's money", icon: ArrowLeftRight },
    ],
  },
  {
    title: "People & products",
    items: [
      { href: "/customers", label: "Customers", hint: "Debtors register", icon: Users },
      { href: "/suppliers", label: "Suppliers", hint: "Creditors register", icon: Truck },
      { href: "/products", label: "Products", hint: "Eggs and water", icon: Egg },
      { href: "/debtors", label: "Debtors ledger", hint: "Who owes you", icon: Users },
      { href: "/creditors", label: "Creditors ledger", hint: "Who you owe", icon: Truck },
    ],
  },
  {
    title: "Reports & setup",
    items: [
      { href: "/reports/profit", label: "Profit & loss", hint: "Eggs, water, combined", icon: FileSpreadsheet },
      { href: "/reports/balance", label: "Balance sheet", hint: "Assets and capital", icon: Scale },
      { href: "/reports/trial", label: "Trial balance", hint: "Check the books", icon: BookOpen },
      { href: "/settings", label: "Settings & backup", hint: "Business details, data", icon: Settings },
    ],
  },
];

export default function MorePage() {
  return (
    <div>
      <PageHeader title="More" subtitle="Everything else in the books" />
      <div className="space-y-6">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 px-1 text-[12px] font-semibold tracking-wider text-faint uppercase">{g.title}</h2>
            <ul className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card divide-y divide-line">
              {g.items.map(({ href, label, hint, icon: Icon }) => (
                <li key={href}>
                  <Link href={href} className="flex items-center gap-3 px-4 py-3.5 active:bg-sunken">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-ink">{label}</span>
                      <span className="block text-[13px] text-muted">{hint}</span>
                    </span>
                    <span className="text-faint">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
