"use client";

import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import {
  type ButtonHTMLAttributes,
  type ComponentProps,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { todayStr } from "@/lib/engine";
import { type DateRange, RANGE_LABELS, type RangePreset, money, presetRange } from "@/lib/format";
import type { DocStatus } from "@/lib/types";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* --------------------------------- Buttons -------------------------------- */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800",
  secondary: "border border-line bg-surface text-ink hover:bg-sunken active:bg-line/40",
  ghost: "text-muted hover:bg-ink/5 hover:text-ink",
  danger: "bg-danger text-white shadow-sm hover:bg-danger-ink",
  soft: "bg-brand-50 text-brand-700 hover:bg-brand-100",
};

const SIZE: Record<Size, string> = {
  sm: "h-9 gap-1.5 rounded-lg px-3 text-[13px]",
  md: "h-11 gap-2 rounded-xl px-4 text-[15px]",
  lg: "h-12 gap-2 rounded-xl px-5 text-base",
};

function buttonClass(variant: Variant, size: Size, className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors select-none disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function Button({ variant = "primary", size = "md", icon, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </button>
  );
}

interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
}

export function ButtonLink({ variant = "primary", size = "md", icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

/* ---------------------------------- Layout -------------------------------- */

export function Card({ className, children, ...rest }: ComponentProps<"div">) {
  return (
    <div className={cn("rounded-2xl border border-line bg-surface shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="text-[15px] font-semibold tracking-tight text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3 print:mb-3">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-1 inline-flex items-center text-[13px] font-medium text-muted hover:text-brand-700 print:hidden">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 print:hidden">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600">{icon}</div>}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------------------------------- Badges -------------------------------- */

type Tone = "neutral" | "brand" | "yolk" | "aqua" | "danger";

const TONE: Record<Tone, string> = {
  neutral: "bg-ink/6 text-muted",
  brand: "bg-brand-50 text-brand-700",
  yolk: "bg-yolk-soft text-yolk-ink",
  aqua: "bg-aqua-soft text-aqua-ink",
  danger: "bg-danger-soft text-danger-ink",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] leading-4 font-semibold whitespace-nowrap", TONE[tone], className)}>
      {children}
    </span>
  );
}

export type PayState = "paid" | "part" | "unpaid";

export function StatusBadge({ status, pay }: { status: DocStatus; pay?: PayState }) {
  if (status === "draft") return <Badge tone="yolk">Draft</Badge>;
  if (status === "reversed") return <Badge tone="danger">Reversed</Badge>;
  if (pay === "paid") return <Badge tone="brand">Paid</Badge>;
  if (pay === "part") return <Badge tone="aqua">Part paid</Badge>;
  if (pay === "unpaid") return <Badge tone="yolk">Unpaid</Badge>;
  return <Badge tone="brand">Posted</Badge>;
}

export function CategoryDot({ category }: { category: "eggs" | "water" | undefined }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", category === "water" ? "bg-aqua" : "bg-yolk")} aria-hidden />;
}

export function Money({ value, className, signed }: { value: number; className?: string; signed?: boolean }) {
  return <span className={cn("num", signed && value < 0 && "text-danger", className)}>{money(value)}</span>;
}

/* ---------------------------------- Forms --------------------------------- */

const CONTROL =
  "w-full rounded-xl border border-line bg-surface text-base text-ink placeholder:text-faint outline-none transition-[border-color,box-shadow] focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 disabled:bg-sunken disabled:text-muted sm:text-[15px]";

export function Field({
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-medium text-ink">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-faint">Optional</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs font-medium text-danger">{error}</span> : hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, "h-11 px-3.5", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} className={cn(CONTROL, "min-h-11 px-3.5 py-2.5", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block">
      <select className={cn(CONTROL, "h-11 appearance-none pr-9 pl-3.5", className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-faint" />
    </span>
  );
}

interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "prefix"> {
  value: string;
  onChange: (value: string) => void;
  prefix?: ReactNode;
  suffix?: ReactNode;
  align?: "left" | "right";
}

/** Text input that only accepts a positive decimal number. The value stays a string while typing. */
export function NumberInput({ value, onChange, prefix, suffix, align = "left", className, ...rest }: NumberInputProps) {
  return (
    <span className="relative block">
      {prefix && <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[15px] text-faint">{prefix}</span>}
      <input
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[^\d.]/g, "");
          const [head, ...tail] = cleaned.split(".");
          onChange(tail.length ? `${head}.${tail.join("")}` : head);
        }}
        onFocus={(e) => e.target.select()}
        className={cn(CONTROL, "num h-11", prefix ? "pl-8" : "pl-3.5", suffix ? "pr-14" : "pr-3.5", align === "right" && "text-right", className)}
        {...rest}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-xs text-faint">{suffix}</span>}
    </span>
  );
}

export function MoneyInput(props: Omit<NumberInputProps, "prefix">) {
  return <NumberInput prefix="₦" placeholder="0" {...props} />;
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  full,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  full?: boolean;
}) {
  return (
    <div className={cn("no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-ink/6 p-1", full && "flex w-full", className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 shrink-0 rounded-lg px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
            full && "flex-1",
            o.value === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search", className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <span className={cn("relative block", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-faint" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(CONTROL, "h-11 pr-3.5 pl-10 [&::-webkit-search-cancel-button]:hidden")}
      />
    </span>
  );
}

export interface Option {
  value: string;
  label: string;
  sub?: string;
  right?: string;
}

/** Searchable picker. `value` of "" means nothing chosen (shown as `emptyLabel` when given). */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Choose…",
  emptyLabel,
  onCreate,
  createLabel = "Add new",
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  emptyLabel?: string;
  onCreate?: (typed: string) => void;
  createLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);

  const all = useMemo(() => (emptyLabel ? [{ value: "", label: emptyLabel }, ...options] : options), [emptyLabel, options]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((o) => o.label.toLowerCase().includes(q) || o.sub?.toLowerCase().includes(q));
  }, [all, query]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className={cn(CONTROL, "flex h-11 items-center justify-between gap-2 pr-3 pl-3.5 text-left", open && "border-brand-500 ring-4 ring-brand-500/10")}
      >
        <span className={cn("truncate", !selected && !(emptyLabel && value === "") && "text-faint")}>
          {selected ? selected.label : emptyLabel && value === "" ? emptyLabel : placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-faint" />
      </button>
      {open && (
        <div className="absolute top-full right-0 left-0 z-40 mt-1.5 animate-pop overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <div className="relative border-b border-line">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-faint" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (shown[0]) choose(shown[0].value);
                }
              }}
              placeholder="Type to search"
              className="h-11 w-full bg-transparent pr-3 pl-10 text-base outline-none placeholder:text-faint sm:text-[15px]"
            />
          </div>
          <ul id={listId} role="listbox" className="scroll-thin max-h-60 overflow-y-auto py-1">
            {shown.map((o) => (
              <li key={o.value || "__empty"} role="option" aria-selected={o.value === value}>
                <button
                  type="button"
                  onClick={() => choose(o.value)}
                  className={cn("flex w-full items-center gap-3 px-3.5 py-2 text-left hover:bg-sunken", o.value === value && "bg-brand-50/60")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink">{o.label}</span>
                    {o.sub && <span className="block truncate text-xs text-muted">{o.sub}</span>}
                  </span>
                  {o.right && <span className="num shrink-0 text-xs text-muted">{o.right}</span>}
                  {o.value === value && <Check className="size-4 shrink-0 text-brand-600" />}
                </button>
              </li>
            ))}
            {!shown.length && <li className="px-3.5 py-3 text-sm text-muted">No match found.</li>}
          </ul>
          {onCreate && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onCreate(query.trim());
                setQuery("");
              }}
              className="flex w-full items-center gap-2 border-t border-line px-3.5 py-2.5 text-left text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              <Plus className="size-4" />
              {query.trim() ? `${createLabel} "${query.trim()}"` : createLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Date range ------------------------------ */

export function useRange(initial: RangePreset = "month") {
  return useState<DateRange>(() => presetRange(initial, todayStr()));
}

const PRESETS: RangePreset[] = ["today", "week", "month", "year", "all", "custom"];

export function RangeBar({ value, onChange, className }: { value: DateRange; onChange: (r: DateRange) => void; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 print:hidden", className)}>
      <Segmented
        value={value.preset}
        onChange={(preset) => onChange(presetRange(preset, todayStr()))}
        options={PRESETS.map((p) => ({ value: p, label: RANGE_LABELS[p] }))}
      />
      {value.preset === "custom" && (
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="From date" className="w-40" value={value.from ?? ""} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value || undefined })} />
          <span className="text-sm text-muted">to</span>
          <Input type="date" aria-label="To date" className="w-40" value={value.to ?? ""} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value || undefined })} />
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Modal --------------------------------- */

export function Modal({
  onClose,
  title,
  subtitle,
  children,
  footer,
  onSubmit,
  size = "md",
}: {
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onSubmit?: () => void;
  size?: "sm" | "md" | "lg";
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const body = (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold tracking-tight text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="-mt-1 -mr-2 grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-ink/5 hover:text-ink">
          <X className="size-5" />
        </button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="safe-bottom border-t border-line bg-sunken/60"><div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3">{footer}</div></div>}
    </>
  );

  const panel = cn(
    "relative flex max-h-[92dvh] w-full animate-sheet flex-col overflow-hidden rounded-t-3xl bg-surface shadow-pop sm:animate-pop sm:rounded-2xl",
    size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-2xl" : "sm:max-w-lg",
  );

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6 print:hidden" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade bg-brand-950/45 backdrop-blur-[2px]" onClick={onClose} />
      {onSubmit ? (
        <form
          className={panel}
          noValidate
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {body}
        </form>
      ) : (
        <div className={panel}>{body}</div>
      )}
    </div>,
    document.body,
  );
}

/* ------------------------------- Data table ------------------------------- */

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  className?: string;
  cell: (row: T) => ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  href,
  onRowClick,
  card,
  empty,
  footer,
  pageSize = 50,
  dim,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  href?: (row: T) => string | null;
  onRowClick?: (row: T) => void;
  /** How a row looks on a phone. */
  card: (row: T) => ReactNode;
  empty?: ReactNode;
  /** Totals row for the desktop table: one cell per column. */
  footer?: ReactNode[];
  pageSize?: number;
  /** Rows to show faded (e.g. reversed entries). */
  dim?: (row: T) => boolean;
}) {
  const [limit, setLimit] = useState(pageSize);
  const visible = rows.length > limit ? rows.slice(0, limit) : rows;
  if (!rows.length) return <Card>{empty ?? <EmptyState title="Nothing to show yet" />}</Card>;

  return (
    <Card className="overflow-hidden">
      {/* Phones: stacked cards */}
      <ul className="divide-y divide-line md:hidden print:hidden">
        {visible.map((row) => {
          const link = href?.(row);
          const inner = <div className={cn("px-4 py-3", dim?.(row) && "opacity-55")}>{card(row)}</div>;
          return (
            <li key={rowKey(row)}>
              {link ? (
                <Link href={link} className="block active:bg-sunken">
                  {inner}
                </Link>
              ) : onRowClick ? (
                <button type="button" onClick={() => onRowClick(row)} className="block w-full text-left active:bg-sunken">
                  {inner}
                </button>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>

      {/* Tablets and up: a real table */}
      <div className="scroll-thin hidden overflow-x-auto md:block print:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-sunken/70 text-left">
              {columns.map((c) => (
                <th key={c.key} className={cn("px-4 py-2.5 text-[11px] font-semibold tracking-wider whitespace-nowrap text-muted uppercase", c.align === "right" && "text-right", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {visible.map((row) => {
              const link = href?.(row);
              const clickable = Boolean(link || onRowClick);
              return (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn("group relative", clickable && "cursor-pointer hover:bg-sunken/70", dim?.(row) && "text-muted [&_td]:opacity-60")}
                >
                  {columns.map((c, i) => (
                    <td key={c.key} className={cn("px-4 py-3 align-middle", c.align === "right" && "num text-right", c.className)}>
                      {link && i === 0 ? (
                        <Link href={link} className="after:absolute after:inset-0">
                          {c.cell(row)}
                        </Link>
                      ) : (
                        c.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          {footer && (
            <tfoot>
              <tr className="border-t-2 border-line bg-sunken/70 font-semibold">
                {footer.map((cell, i) => (
                  <td key={columns[i]?.key ?? i} className={cn("px-4 py-3", columns[i]?.align === "right" && "num text-right")}>
                    {cell}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {rows.length > limit && (
        <div className="border-t border-line p-3 text-center print:hidden">
          <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + pageSize)}>
            Show more ({rows.length - limit} remaining)
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Two-line phone row: title + amount on top, details underneath. */
export function RowCard({ title, amount, meta, badge, sub }: { title: ReactNode; amount?: ReactNode; meta?: ReactNode; badge?: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-[15px] font-medium text-ink">{title}</p>
        {amount !== undefined && <p className="num shrink-0 text-[15px] font-semibold text-ink">{amount}</p>}
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[13px] text-muted">{meta}</p>
        {badge && <span className="shrink-0">{badge}</span>}
      </div>
      {sub && <p className="mt-1 text-[13px] text-muted">{sub}</p>}
    </div>
  );
}

/* ---------------------------------- Stats --------------------------------- */

export function Stat({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  href?: string;
}) {
  const inner = (
    <Card className={cn("h-full p-4 transition-shadow", href && "hover:border-brand-300")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {icon && <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", TONE[tone])}>{icon}</span>}
      </div>
      <p className="num mt-2 text-[22px] leading-none font-semibold tracking-tight text-ink sm:text-2xl">{value}</p>
      {sub && <p className="mt-2 text-xs text-muted">{sub}</p>}
    </Card>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl">
      {inner}
    </Link>
  ) : (
    inner
  );
}

/** A label/value line used in summaries and statements. */
export function Line({ label, value, strong, muted, className }: { label: ReactNode; value: ReactNode; strong?: boolean; muted?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5", strong ? "text-[15px] font-semibold text-ink" : "text-sm", muted && "text-muted", className)}>
      <span className="min-w-0">{label}</span>
      <span className="num shrink-0">{value}</span>
    </div>
  );
}
