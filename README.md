# FAABRA GLOBAL TRADE

Business management and accounting for **FAABRA GLOBAL TRADE** — purchases, sales, stock, debtors, creditors, cash, bank, expenses and profitability.

One responsive Progressive Web App for computer and Android phone. Books sync to a **free Supabase** cloud database, and also stay on the device so the app works offline.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Double-entry accounting engine with weighted-average stock costing
- Zustand + Immer + idb-keyval (offline cache)
- Supabase free tier (cloud sync)
- Installable PWA (manifest + icons)

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

On first launch the product register is pre-filled with egg sizes and Cway water. Use **Settings → Load sample data** to explore a full month of invented trading, or start entering your own.

```bash
npm test          # accounting engine tests
npm run build     # production build
npm start         # serve the production build
```

## Free cloud sync (Supabase)

This is free for a small business. No paid plan required.

1. Create a free project at [supabase.com](https://supabase.com) (Free plan).
2. Open **SQL Editor** → New query → paste everything from `supabase/schema.sql` → **Run**.
3. Open **Project Settings → API Keys** and copy:
   - Project URL (under **Data API** / Connect)
   - **Publishable** key (`sb_publishable_...`), or the legacy **anon** key under **View legacy API keys**
4. Copy `.env.example` to `.env.local` and fill those two values in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Never put the **secret** key in the app.

5. Restart `npm run dev`.

After that, sales entered on the phone appear on the computer (and the other way round). If the free project pauses after a week of no use, open the Supabase dashboard once and restore it — still free.

Without `.env.local`, the app still works on-device only.

## What is included

| Area | Features |
| --- | --- |
| Registers | Products (eggs & water), customers, suppliers, cash/bank accounts |
| Purchases | Multi-line bills, transport added to stock cost, supplier balances |
| Sales | Multi-line invoices (eggs + water), retail/wholesale prices, drafts, shareable invoice image |
| Money | Customer receipts (partial / multi-invoice), supplier payments, expenses, transfers |
| Stock | Weighted average cost, returns, breakages, internal use, adjustments, low-stock alerts |
| Ledgers | Debtors & creditors with ageing, cash/bank books, capital & drawings |
| Reports | Profit & loss (eggs / water / combined), balance sheet, trial balance, Excel export |
| Controls | Posted entries are never deleted — only reversed, with a full audit trail |
| Data | Cloud sync + on-device cache, JSON backup / restore, daily local snapshots |

## Notes

- Personal withdrawals are owner's drawings, not expenses. Capital introduced is not sales.
- Install on Android: open in Chrome → menu → **Add to Home screen**.
