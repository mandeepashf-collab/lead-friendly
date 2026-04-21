"use client";

import { Phone } from "lucide-react";
import { useSoftphone, type SoftphoneContact } from "./SoftphoneContext";

interface Props {
  contact: SoftphoneContact;
  className?: string;
  label?: string;
}

/**
 * Client-side Call button that pops the Softphone dock pre-filled with the
 * given contact. Safe to drop into server components — it's a client-only
 * island.
 */
export function CallButton({ contact, className, label = "Call" }: Props) {
  const { openWith, isInCall } = useSoftphone();
  const disabled = !contact.phone || isInCall;

  return (
    <button
      onClick={() => {
        if (!contact.phone) return;
        openWith(contact);
      }}
      disabled={disabled}
      className={
        className ??
        "flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
      }
    >
      <Phone className="h-4 w-4" />
      {label}
    </button>
  );
}
