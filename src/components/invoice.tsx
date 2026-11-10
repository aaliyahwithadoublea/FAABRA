"use client";

import { Download, Printer, Share2 } from "lucide-react";
import { useRef, useState } from "react";
import { productLabel } from "@/lib/engine";
import { shareNodeAsImage } from "@/lib/files";
import { fmtDate, fmtDay, money, num } from "@/lib/format";
import { toast, useDb } from "@/lib/store";
import type { Sale } from "@/lib/types";
import { Button, StatusBadge, cn } from "./ui";

export function InvoiceView({ sale }: { sale: Sale }) {
  const db = useDb();
  const sheet = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const customer = sale.customerId ? db.customers.find((c) => c.id === sale.customerId) : null;
  const balance = Math.max(0, Math.round((sale.total - sale.amountPaid) * 100) / 100);
  const s = db.settings;
  const payState = sale.status !== "posted" ? undefined : balance === 0 ? "paid" : sale.amountPaid > 0 ? "part" : "unpaid";

  const share = async () => {
    if (!sheet.current) return;
    setBusy(true);
    try {
      const result = await shareNodeAsImage(sheet.current, `${sale.number || "invoice"}.png`, `${s.businessName} ${sale.number}`);
      toast.success(result === "shared" ? "Invoice shared" : "Invoice image saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the invoice image");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        <Button variant="secondary" size="sm" icon={<Printer className="size-4" />} onClick={() => window.print()}>
          Print
        </Button>
        <Button variant="secondary" size="sm" icon={busy ? undefined : <Share2 className="size-4" />} disabled={busy} onClick={() => void share()}>
          {busy ? "Preparing…" : "Share image"}
        </Button>
        <Button variant="ghost" size="sm" icon={<Download className="size-4" />} disabled={busy} onClick={() => void share()}>
          Save PNG
        </Button>
      </div>

      <div
        ref={sheet}
        className={cn(
          "mx-auto w-full max-w-md rounded-2xl border border-line bg-white p-6 text-ink shadow-card sm:p-7",
          sale.status === "reversed" && "opacity-80",
        )}
      >
        <header className="flex items-start gap-3 border-b border-dashed border-line pb-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={s.logo || "/logo.png"}
            alt=""
            className="size-12 shrink-0 rounded-xl object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-tight font-bold tracking-wide uppercase">{s.businessName || "FAABRA GLOBAL TRADE"}</p>
            {s.rcNumber && <p className="mt-0.5 text-xs text-muted">RC {s.rcNumber}</p>}
            {s.phone && <p className="text-xs text-muted">{s.phone}</p>}
            {s.address && <p className="text-xs text-muted">{s.address}</p>}
          </div>
        </header>

        <div className="mt-4 flex items-start justify-between gap-4 text-[13px]">
          <div className="min-w-0">
            <p className="text-xs text-faint">Invoice</p>
            <p className="font-semibold">{sale.number || "Draft"}</p>
            <p className="mt-2 text-xs text-faint">Customer</p>
            <p className="font-medium break-words">{customer ? customer.name : "Walk-in customer"}</p>
            {customer?.phone && <p className="text-muted">{customer.phone}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-faint">Date</p>
            <p className="font-medium">{fmtDay(sale.date)}</p>
            <div className="mt-2 flex justify-end">
              <StatusBadge status={sale.status} pay={payState} />
            </div>
          </div>
        </div>

        <ul className="mt-5 divide-y divide-dashed divide-line border-y border-dashed border-line">
          {sale.items.map((item, i) => {
            const p = db.products.find((x) => x.id === item.productId);
            return (
              <li key={i} className="flex items-start justify-between gap-3 py-3 text-[13px]">
                <div className="min-w-0">
                  <p className="font-medium">
                    {num(item.qty)} × {p ? productLabel(p) : "Product"}
                  </p>
                  <p className="text-muted">
                    {sale.priceType === "wholesale" ? "Wholesale" : "Retail"} @ {money(item.unitPrice)}
                    {p ? ` / ${p.unit}` : ""}
                  </p>
                </div>
                <p className="num shrink-0 font-semibold">{money(item.qty * item.unitPrice)}</p>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 space-y-1 text-[13px]">
          <div className="flex justify-between text-muted">
            <span>Subtotal</span>
            <span className="num">{money(sale.subtotal)}</span>
          </div>
          {sale.discount > 0 && (
            <div className="flex justify-between text-muted">
              <span>Discount</span>
              <span className="num">−{money(sale.discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-[15px] font-bold">
            <span>Total</span>
            <span className="num">{money(sale.total)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Paid</span>
            <span className="num">{money(sale.amountPaid)}</span>
          </div>
          <div className="flex justify-between text-[15px] font-bold">
            <span>Balance</span>
            <span className="num">{money(balance)}</span>
          </div>
        </div>

        {s.bankName && s.accountNumber && (
          <div className="mt-5 rounded-xl bg-sunken px-4 py-3 text-[13px]">
            <p className="text-[11px] font-semibold tracking-wider text-faint uppercase">Pay by transfer</p>
            <p className="mt-1 font-medium uppercase">{s.bankName}</p>
            <p className="num text-lg font-bold tracking-wide">{s.accountNumber}</p>
            {s.accountName && <p className="text-muted">{s.accountName}</p>}
          </div>
        )}

        {(s.invoiceFooter || sale.remarks) && (
          <footer className="mt-5 border-t border-dashed border-line pt-4 text-center text-[12px] text-muted">
            {sale.remarks && <p className="mb-1">{sale.remarks}</p>}
            {s.invoiceFooter && <p>{s.invoiceFooter}</p>}
            {sale.postedAt && <p className="mt-2 text-[11px] text-faint">Posted {fmtDate(sale.date)}</p>}
          </footer>
        )}
      </div>
    </div>
  );
}
