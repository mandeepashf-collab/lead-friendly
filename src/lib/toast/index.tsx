"use client";

/**
 * Toast system - zero dependencies.
 *
 * Usage:
 *   Wrap once: <ToastProvider>{children}</ToastProvider>
 *   Call: const toast = useToast(); toast.success("Saved");
 *
 * Variants: success, error, info, warning
 * Options: { action: { label, onClick }, durationMs }
 * With action: toast does not auto-dismiss.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type ToastVariant = "success" | "error" | "info" | "warning";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOptions = {
  action?: ToastAction;
  durationMs?: number;
};

type ToastRecord = {
  id: number;
  variant: ToastVariant;
  message: string;
  action?: ToastAction;
  durationMs: number;
  createdAt: number;
};

type ToastApi = {
  success: (message: string, options?: ToastOptions) => number;
  error: (message: string, options?: ToastOptions) => number;
  info: (message: string, options?: ToastOptions) => number;
  warning: (message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
};

const DEFAULT_DURATION_MS: Record<ToastVariant, number> = {
  success: 5000,
  info: 5000,
  warning: 6000,
  error: 7000,
};

const MAX_VISIBLE = 5;

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string, options?: ToastOptions): number => {
      const id = nextId.current++;
      const durationMs =
        options?.action !== undefined
          ? 0
          : options?.durationMs ?? DEFAULT_DURATION_MS[variant];
      const record: ToastRecord = {
        id,
        variant,
        message,
        action: options?.action,
        durationMs,
        createdAt: Date.now(),
      };
      setToasts((prev) => {
        const next = [record, ...prev];
        return next.length > MAX_VISIBLE ? next.slice(0, MAX_VISIBLE) : next;
      });
      return id;
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, o) => push("success", m, o),
      error: (m, o) => push("error", m, o),
      info: (m, o) => push("info", m, o),
      warning: (m, o) => push("warning", m, o),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error(
      "useToast must be called inside <ToastProvider>. Add it once in your root layout.",
    );
  }
  return ctx;
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastRecord[];
  onDismiss: (id: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        pointerEvents: "none",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body,
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastRecord;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    if (toast.durationMs <= 0) return;
    const timeout = setTimeout(() => onDismiss(toast.id), toast.durationMs);
    return () => clearTimeout(timeout);
  }, [toast.id, toast.durationMs, onDismiss]);

  const theme = VARIANT_STYLES[toast.variant];

  return (
    <div
      role="status"
      style={{
        pointerEvents: "auto",
        minWidth: 280,
        maxWidth: 420,
        padding: "12px 14px",
        borderRadius: 8,
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        color: theme.fg,
        boxShadow: "0 10px 30px -12px rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        fontSize: 14,
        lineHeight: 1.4,
      }}
    >
      <span aria-hidden="true" style={{ fontSize: 16, lineHeight: 1.2 }}>
        {theme.icon}
      </span>
      <div style={{ flex: 1, wordBreak: "break-word" }}>{toast.message}</div>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action!.onClick();
            onDismiss(toast.id);
          }}
          style={{
            background: "transparent",
            border: `1px solid ${theme.border}`,
            color: theme.fg,
            padding: "4px 10px",
            borderRadius: 6,
            fontSize: 13,
            cursor: "pointer",
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => onDismiss(toast.id)}
        style={{
          background: "transparent",
          border: "none",
          color: theme.fg,
          opacity: 0.6,
          cursor: "pointer",
          fontSize: 18,
          lineHeight: 1,
          padding: 0,
          marginTop: -2,
        }}
      >
        ×
      </button>
    </div>
  );
}

const VARIANT_STYLES: Record<ToastVariant, { bg: string; border: string; fg: string; icon: string }> = {
  success: {
    bg: "rgb(20, 30, 25)",
    border: "rgb(34, 197, 94)",
    fg: "rgb(220, 252, 231)",
    icon: "✓",
  },
  error: {
    bg: "rgb(35, 20, 22)",
    border: "rgb(239, 68, 68)",
    fg: "rgb(254, 226, 226)",
    icon: "✕",
  },
  info: {
    bg: "rgb(20, 25, 35)",
    border: "rgb(59, 130, 246)",
    fg: "rgb(219, 234, 254)",
    icon: "ℹ",
  },
  warning: {
    bg: "rgb(35, 30, 18)",
    border: "rgb(234, 179, 8)",
    fg: "rgb(254, 249, 195)",
    icon: "!",
  },
};
