"use client";

import { create } from "zustand";
import type { ID, SourceType, StockEventType } from "./types";

export type DocType = Exclude<SourceType, "opening">;

/** Every pop-up form in the app. Only one is open at a time. */
export type ModalState =
  | { type: "quick" }
  | { type: "receipt"; customerId?: ID; saleId?: ID }
  | { type: "supplierPayment"; supplierId?: ID }
  | { type: "expense" }
  | { type: "transfer" }
  | { type: "stockEvent"; eventType?: StockEventType; productId?: ID }
  | { type: "capital"; entryType?: "capital" | "drawing" }
  | { type: "adjustment"; partyType: "customer" | "supplier"; partyId: ID }
  | { type: "product"; id?: ID }
  | { type: "customer"; id?: ID; name?: string; onSaved?: (id: ID) => void }
  | { type: "supplier"; id?: ID; name?: string; onSaved?: (id: ID) => void }
  | { type: "account"; id?: ID; accountType?: "cash" | "bank" }
  | { type: "reverse"; docType: DocType; id: ID; number: string; label: string };

interface UIState {
  modal: ModalState | null;
  open: (modal: ModalState) => void;
  close: () => void;
}

export const useUI = create<UIState>((set) => ({
  modal: null,
  open: (modal) => set({ modal }),
  close: () => set({ modal: null }),
}));

export const openModal = (modal: ModalState) => useUI.getState().open(modal);
