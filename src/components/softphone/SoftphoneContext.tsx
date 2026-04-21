"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Minimal shared state between the Softphone dock and the rest of the app.
 *
 * The dock is mounted globally in the (dashboard) layout. Anywhere inside
 * that layout, a "Call" button can open the dock pre-populated with a
 * target contact by calling `useSoftphone().openWith(contact)`.
 *
 * The dock reads `pendingContact` to know what contact to pre-fill. Once
 * the user confirms the dial (or cancels), the dock calls `clearPending()`
 * which sets this back to null.
 *
 * We intentionally do NOT put in-call state (mute, elapsed, etc.) here —
 * that lives in the dock component itself. This context is only about the
 * "a button somewhere wants to start a call" handoff.
 */

export interface SoftphoneContact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  phone: string; // E.164
  company?: string | null;
}

interface SoftphoneContextValue {
  /** Set by external callers (Call buttons); read by the dock. */
  pendingContact: SoftphoneContact | null;
  /** Pop the dock open pre-populated with this contact. */
  openWith: (contact: SoftphoneContact) => void;
  /** Dock calls this after it has absorbed pendingContact into its own state. */
  clearPending: () => void;
  /** Whether the dock is currently in an active call. Read-only from outside. */
  isInCall: boolean;
  /** The dock sets this — it's not for external use. */
  setInCall: (inCall: boolean) => void;
}

const SoftphoneContext = createContext<SoftphoneContextValue | null>(null);

export function SoftphoneProvider({ children }: { children: ReactNode }) {
  const [pendingContact, setPendingContact] =
    useState<SoftphoneContact | null>(null);
  const [isInCall, setIsInCall] = useState(false);

  const openWith = useCallback((contact: SoftphoneContact) => {
    setPendingContact(contact);
  }, []);

  const clearPending = useCallback(() => {
    setPendingContact(null);
  }, []);

  const value = useMemo<SoftphoneContextValue>(
    () => ({
      pendingContact,
      openWith,
      clearPending,
      isInCall,
      setInCall: setIsInCall,
    }),
    [pendingContact, openWith, clearPending, isInCall],
  );

  return (
    <SoftphoneContext.Provider value={value}>
      {children}
    </SoftphoneContext.Provider>
  );
}

export function useSoftphone(): SoftphoneContextValue {
  const ctx = useContext(SoftphoneContext);
  if (!ctx) {
    throw new Error("useSoftphone must be used inside <SoftphoneProvider>");
  }
  return ctx;
}
