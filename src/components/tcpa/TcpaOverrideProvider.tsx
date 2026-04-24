"use client";

/**
 * Global TCPA override modal provider.
 *
 * Mount once in src/app/(protected)/layout.tsx:
 *   <TcpaOverrideProvider>{children}</TcpaOverrideProvider>
 *
 * Any component can then:
 *   const tcpa = useTcpaOverride();
 *   const res = await tcpa.request({ warnings, token, contactName, phone });
 *   if (res.confirmed) { retry the call with token + res.note }
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { OverrideModal } from "./OverrideModal";

export type TcpaWarning = {
  code: string;
  reason: string;
  severity: "soft" | "hard";
};

export type OverrideRequest = {
  warnings: TcpaWarning[];
  token: string;
  contactName: string;
  phone: string;
  tokenExpired?: boolean;
};

export type OverrideResult =
  | { confirmed: true; note: string | null }
  | { confirmed: false };

type Ctx = {
  request: (req: OverrideRequest) => Promise<OverrideResult>;
};

const TcpaOverrideContext = createContext<Ctx | null>(null);

export function TcpaOverrideProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<OverrideRequest | null>(null);
  const resolverRef = useRef<((r: OverrideResult) => void) | null>(null);

  const request = useCallback((req: OverrideRequest) => {
    setCurrent(req);
    setOpen(true);
    return new Promise<OverrideResult>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback((note: string | null) => {
    setOpen(false);
    resolverRef.current?.({ confirmed: true, note });
    resolverRef.current = null;
    setCurrent(null);
  }, []);

  const handleCancel = useCallback(() => {
    setOpen(false);
    resolverRef.current?.({ confirmed: false });
    resolverRef.current = null;
    setCurrent(null);
  }, []);

  const value = useMemo(() => ({ request }), [request]);

  return (
    <TcpaOverrideContext.Provider value={value}>
      {children}
      {current && (
        <OverrideModal
          open={open}
          warnings={current.warnings}
          contactName={current.contactName}
          phone={current.phone}
          tokenExpired={current.tokenExpired ?? false}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </TcpaOverrideContext.Provider>
  );
}

export function useTcpaOverride() {
  const ctx = useContext(TcpaOverrideContext);
  if (!ctx) {
    throw new Error("useTcpaOverride must be used inside <TcpaOverrideProvider>");
  }
  return ctx;
}
