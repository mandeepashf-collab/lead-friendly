// src/lib/contacts/format-value.ts
//
// Shared formatter for custom field values.
//
// Today, contacts.custom_fields stores everything as strings (CSV import
// is the only writer, and it doesn't coerce types). This formatter does
// best-effort coercion based on either an explicit field_type from the
// custom_fields definitions table, OR (legacy fallback) heuristic-by-key.
//
// Extracted from CustomFieldsBlock.tsx so the contacts table cell and
// the contact detail page render identically.

export type CustomFieldType =
  | "text" | "number" | "date" | "dropdown" | "checkbox"
  | "url" | "email" | "phone" | "textarea" | "currency";

export function formatCustomFieldValue(
  value: unknown,
  opts?: { fieldKey?: string; fieldType?: CustomFieldType },
): string {
  if (value === null || value === undefined || value === "") return "—";

  const explicitType = opts?.fieldType;
  const keyLower = (opts?.fieldKey ?? "").toLowerCase();
  const num = toFiniteNumber(value);

  // Explicit type takes precedence over heuristics.
  if (explicitType === "currency" && num !== null) {
    return `$${num.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (explicitType === "number" && num !== null) {
    return String(Math.round(num));
  }
  if (explicitType === "date" && typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
      });
    }
  }
  if (explicitType === "checkbox") {
    return value === true || value === "true" ? "Yes" : "No";
  }
  if (explicitType === "url" || explicitType === "email" || explicitType === "phone") {
    return String(value);
  }

  // Legacy heuristic fallback (matches CustomFieldsBlock.tsx behavior pre-Phase 2).
  if (num !== null && (keyLower.includes("amount") || keyLower.includes("price") || keyLower.includes("revenue") || keyLower.includes("cost") || keyLower.includes("salary") || keyLower.includes("income"))) {
    return `$${num.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (num !== null && (keyLower === "age" || keyLower.endsWith("_age") || keyLower.includes("count") || keyLower.includes("years") || keyLower.includes("quantity"))) {
    return String(Math.round(num));
  }
  if (num !== null && (keyLower.includes("percent") || keyLower.includes("rate"))) {
    return `${num.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
  }
  if (typeof value === "string" && (keyLower.includes("date") || keyLower.includes("_at"))) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
      });
    }
  }

  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function humanizeFieldKey(key: string): string {
  return key
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function toFiniteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (!trimmed) return null;
    const cleaned = trimmed.replace(/[$,%\s]/g, "");
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
