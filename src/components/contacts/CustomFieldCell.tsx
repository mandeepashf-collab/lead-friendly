// src/components/contacts/CustomFieldCell.tsx
//
// Renders one cell value in the contacts table given a definition + raw
// JSONB value from contacts.custom_fields. Uses the shared formatter so
// the table cell and contact detail page render identically.

"use client";

import {
  formatCustomFieldValue,
  type CustomFieldType,
} from "@/lib/contacts/format-value";

type Props = {
  fieldKey: string;
  fieldType: CustomFieldType;
  rawValue: unknown;
};

export function CustomFieldCell({ fieldKey, fieldType, rawValue }: Props) {
  const formatted = formatCustomFieldValue(rawValue, { fieldKey, fieldType });
  if (formatted === "—") return <span className="text-sm text-zinc-600">—</span>;
  return (
    <span className="text-sm text-zinc-400 truncate max-w-[180px] inline-block align-middle">
      {formatted}
    </span>
  );
}
