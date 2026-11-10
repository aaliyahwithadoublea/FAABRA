"use client";

import {
  ArrowLeftRight,
  Banknote,
  BookOpen,
  Boxes,
  ClipboardList,
  CreditCard,
  Droplets,
  Egg,
  FileSpreadsheet,
  HandCoins,
  Home,
  Menu,
  PackagePlus,
  Plus,
  Settings,
  ShoppingBag,
  Truck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useOnline } from "@/lib/hooks";
import { toast, useDb, useStore, useToasts } from "@/lib/store";
import { openModal, useUI } from "@/lib/ui-store";
import {
  AccountForm,
  AdjustmentForm,
  CapitalForm,
  CustomerForm,
  ExpenseForm,
  ProductForm,
  ReceiptForm,
  ReverseDialog,
  StockEventForm,
  SupplierForm,
  SupplierPaymentForm,
  TransferForm,
} from "./forms";
import { LogoMark } from "./logo";
import { Button, ButtonLink, cn } from "./ui";

/* -------------------------------- Navigation ------------------------------ */

const PRIMARY = [
  { href: "/", label: "Home", icon: Home },
  { href: "/sales", label: "Sales", icon: ShoppingBag },
  { href: "/purchases", label: "Buy", icon: PackagePlus },
  { href: "/stock", label: "Stock", icon: Boxes },
  { href: "/more", label: "More", icon: Menu },
] as const;

const SIDEBAR: { heading?: string; items: { href: string; label: string; icon: typeof Home }[] }[] = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: Home },
      { href: "/sales", label: "Sales", icon: ShoppingBag },
      { href: "/purchases", label: "Purchases", icon: PackagePlus },
      { href: "/receipts", label: "Customer payments", icon: HandCoins },
      { href: "/payments", label: "Supplier payments", icon: CreditCard },
    ],
  },
  {
    heading: "Books",
    items: [
      { href: "/stock", label: "Stock", icon: Boxes },
      { href: "/debtors", label: "Debtors", icon: Users },
      { href: "/creditors", label: "Creditors", icon: Truck },
      { href: "/money", label: "Cash & bank", icon: Wallet },
      { href: "/expenses", label: "Expenses", icon: Banknote },
      { href: "/returns", label: "Returns & damages", icon: ClipboardList },
      { href: "/capital", label: "Capital & drawings", icon: ArrowLeftRight },
    ],
  },
  {
    heading: "Reports",
    items: [
      { href: "/reports/profit", label: "Profit & loss", icon: FileSpreadsheet },
      { href: "/reports/balance", label: "Balance sheet", icon: BookOpen },
    ],
  },
  {
    heading: "Setup",
    items: [
      { href: "/products", label: "Products", icon: Egg },
      { href: "/customers", label: "Customers", icon: Users },
      { href: "/suppliers", label: "Suppliers", icon: Truck },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <LogoMark size={36} className="size-9" />
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-[15px] leading-tight font-semibold tracking-tight text-ink">FAABRA</span>
          <span className="block truncate text-[11px] text-muted">Global Trade</span>
        </span>
      )}
    </Link>
  );
}

function NavLink({ href, label, icon: Icon, onClick }: { href: string; label: string; icon: typeof Home; onClick?: () => void }) {
  const pathname = usePathname();
  const active = isActive(pathname, href);
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors",
        active ? "bg-brand-50 text-brand-800" : "text-muted hover:bg-ink/5 hover:text-ink",
      )}
    >
      <Icon className={cn("size-[18px] shrink-0", active ? "text-brand-600" : "text-faint")} />
      {label}
    </Link>
  );
}

/* --------------------------------- Modals --------------------------------- */

function ModalHost() {
  const modal = useUI((s) => s.modal);
  const close = useUI((s) => s.close);
  if (!modal) return null;
  switch (modal.type) {
    case "quick":
      return <QuickAdd onClose={close} />;
    case "receipt":
      return <ReceiptForm {...modal} onClose={close} />;
    case "supplierPayment":
      return <SupplierPaymentForm {...modal} onClose={close} />;
    case "expense":
      return <ExpenseForm {...modal} onClose={close} />;
    case "transfer":
      return <TransferForm {...modal} onClose={close} />;
    case "stockEvent":
      return <StockEventForm {...modal} onClose={close} />;
    case "capital":
      return <CapitalForm {...modal} onClose={close} />;
    case "adjustment":
      return <AdjustmentForm {...modal} onClose={close} />;
    case "product":
      return <ProductForm {...modal} onClose={close} />;
    case "customer":
      return <CustomerForm {...modal} onClose={close} />;
    case "supplier":
      return <SupplierForm {...modal} onClose={close} />;
    case "account":
      return <AccountForm {...modal} onClose={close} />;
    case "reverse":
      return <ReverseDialog {...modal} onClose={close} />;
  }
}

function QuickAdd({ onClose }: { onClose: () => void }) {
  const open = (modal: Parameters<typeof openModal>[0]) => {
    onClose();
    // Let the current sheet close before opening the next one.
    requestAnimationFrame(() => openModal(modal));
  };
  const Item = ({
    icon: Icon,
    title,
    hint,
    href,
    onClick,
    tone = "brand",
  }: {
    icon: typeof Home;
    title: string;
    hint: string;
    href?: string;
    onClick?: () => void;
    tone?: "brand" | "yolk" | "aqua";
  }) => {
    const toneClass = tone === "yolk" ? "bg-yolk-soft text-yolk-ink" : tone === "aqua" ? "bg-aqua-soft text-aqua-ink" : "bg-brand-50 text-brand-700";
    const body = (
      <>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", toneClass)}>
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 text-left">
          <span className="block text-[15px] font-semibold text-ink">{title}</span>
          <span className="block text-[13px] text-muted">{hint}</span>
        </span>
      </>
    );
    return href ? (
      <Link href={href} onClick={onClose} className="flex items-center gap-3 rounded-2xl border border-line px-3.5 py-3 hover:border-brand-300 hover:bg-brand-50/40">
        {body}
      </Link>
    ) : (
      <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl border border-line px-3.5 py-3 text-left hover:border-brand-300 hover:bg-brand-50/40">
        {body}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-brand-950/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full animate-sheet rounded-t-3xl bg-surface p-5 shadow-pop sm:max-w-lg sm:animate-pop sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold text-ink">New entry</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-full text-muted hover:bg-ink/5">
            <X className="size-5" />
          </button>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Item icon={ShoppingBag} title="Sale" hint="Invoice a customer" href="/sales/new" tone="yolk" />
          <Item icon={PackagePlus} title="Purchase" hint="Buy from a supplier" href="/purchases/new" tone="aqua" />
          <Item icon={HandCoins} title="Customer payment" hint="Money received" onClick={() => open({ type: "receipt" })} />
          <Item icon={CreditCard} title="Supplier payment" hint="Money paid out" onClick={() => open({ type: "supplierPayment" })} />
          <Item icon={Banknote} title="Expense" hint="Fuel, rent, salaries…" onClick={() => open({ type: "expense" })} />
          <Item icon={Wallet} title="Move money" hint="Cash ↔ bank" onClick={() => open({ type: "transfer" })} />
          <Item icon={ClipboardList} title="Return / damage" hint="Breakage, returns, counts" onClick={() => open({ type: "stockEvent" })} />
          <Item icon={ArrowLeftRight} title="Owner's money" hint="Capital or drawings" onClick={() => open({ type: "capital" })} />
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- Toasts --------------------------------- */

function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3 print:hidden sm:top-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-sm shadow-pop",
            t.kind === "success" && "bg-brand-800 text-white",
            t.kind === "error" && "bg-danger text-white",
            t.kind === "info" && "border border-line bg-surface text-ink",
          )}
        >
          <p className="min-w-0 flex-1 leading-snug">{t.message}</p>
          <button type="button" onClick={() => dismiss(t.id)} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------- Shell --------------------------------- */

export function Shell({ children }: { children: ReactNode }) {
  const ready = useStore((s) => s.ready);
  const loadError = useStore((s) => s.loadError);
  const saveError = useStore((s) => s.saveError);
  const cloudStatus = useStore((s) => s.cloudStatus);
  const cloudError = useStore((s) => s.cloudError);
  const init = useStore((s) => s.init);
  const db = useDb();
  const online = useOnline();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (saveError) toast.error(`Could not save on this device: ${saveError}`);
  }, [saveError]);

  useEffect(() => {
    if (cloudStatus === "error" && cloudError) toast.error(cloudError);
  }, [cloudStatus, cloudError]);

  if (loadError) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas p-6">
        <div className="max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
          <p className="text-lg font-semibold text-ink">Could not open your books</p>
          <p className="mt-2 text-sm text-muted">{loadError}</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <LogoMark size={56} className="size-14 shadow-pop" />
          <p className="text-sm text-muted">Opening your books…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      {!online && (
        <div className="bg-yolk-ink px-4 py-2 text-center text-[13px] font-medium text-white print:hidden">
          You are offline. Entries are saved on this device
          {cloudStatus !== "off" ? " and will sync to the cloud when you reconnect." : "."}
        </div>
      )}
      {online && cloudStatus === "saving" && (
        <div className="bg-brand-800 px-4 py-1.5 text-center text-[12px] font-medium text-white/90 print:hidden">Saving to cloud…</div>
      )}

      <div className="mx-auto flex min-h-dvh max-w-[1400px]">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 print:hidden lg:flex">
          <div className="px-2 pb-4">
            <Brand />
          </div>
          <nav className="scroll-thin flex-1 space-y-5 overflow-y-auto pb-4">
            {SIDEBAR.map((group, i) => (
              <div key={i}>
                {group.heading && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-faint uppercase">{group.heading}</p>}
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <NavLink key={item.href} {...item} />
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-line px-2 pt-3">
            <Button className="w-full" icon={<Plus className="size-4" />} onClick={() => openModal({ type: "quick" })}>
              New entry
            </Button>
            <p className="mt-3 truncate px-1 text-[11px] text-faint">{db.settings.businessName}</p>
          </div>
        </aside>

        {/* Mobile slide-out menu */}
        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden print:hidden">
            <div className="absolute inset-0 bg-brand-950/40" onClick={() => setMenuOpen(false)} />
            <aside className="absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] animate-fade flex-col bg-surface shadow-pop">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <Brand />
                <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="grid size-9 place-items-center rounded-full text-muted hover:bg-ink/5">
                  <X className="size-5" />
                </button>
              </div>
              <nav className="scroll-thin flex-1 space-y-5 overflow-y-auto px-3 py-4">
                {SIDEBAR.map((group, i) => (
                  <div key={i}>
                    {group.heading && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-faint uppercase">{group.heading}</p>}
                    <div className="space-y-0.5">
                      {group.items.map((item) => (
                        <NavLink key={item.href} {...item} onClick={() => setMenuOpen(false)} />
                      ))}
                    </div>
                  </div>
                ))}
              </nav>
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar (tablet & phone) */}
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur-md print:hidden lg:hidden">
            <button type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu" className="grid size-10 place-items-center rounded-xl text-ink hover:bg-ink/5">
              <Menu className="size-5" />
            </button>
            <Brand compact />
            <div className="ml-auto flex items-center gap-1">
              <ButtonLink href="/sales/new" size="sm" variant="soft" icon={<Plus className="size-4" />} className="hidden sm:inline-flex">
                Sale
              </ButtonLink>
              <button
                type="button"
                onClick={() => openModal({ type: "quick" })}
                aria-label="New entry"
                className="grid size-10 place-items-center rounded-xl bg-brand-600 text-white shadow-sm hover:bg-brand-700"
              >
                <Plus className="size-5" />
              </button>
            </div>
          </header>

          <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7 print:p-0">{children}</main>

          {/* Phone bottom tabs */}
          <nav className="safe-bottom sticky bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur-md print:hidden lg:hidden">
            <ul className="mx-auto grid max-w-lg grid-cols-5">
              {PRIMARY.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-brand-700" : "text-faint")}
                    >
                      <Icon className={cn("size-5", active && "text-brand-600")} strokeWidth={active ? 2.4 : 2} />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </div>

      <ModalHost />
      <Toasts />
    </div>
  );
}

/** Compact product category chips used on the More screen and elsewhere. */
export function CategoryChip({ category }: { category: "eggs" | "water" }) {
  return category === "eggs" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-yolk-soft px-2 py-0.5 text-[11px] font-semibold text-yolk-ink">
      <Egg className="size-3" /> Eggs
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-aqua-soft px-2 py-0.5 text-[11px] font-semibold text-aqua-ink">
      <Droplets className="size-3" /> Water
    </span>
  );
}
