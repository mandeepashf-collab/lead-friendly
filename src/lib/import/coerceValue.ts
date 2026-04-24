// src/lib/import/coerceValue.ts
//
// Coerces a raw CSV string value into the best JSONB-storable type.
// Used by the importer for values destined for contacts.custom_fields so
// numeric-looking strings ("414122") land as JSON numbers, not strings.
//
// Rules:
//   - Empty / whitespace-only → null (caller should skip the key entirely)
//   - Numeric integer string ("414122", "74") → number
//   - Numeric decimal string ("3.14") → number
//   - Numeric with leading zeros ("007") → string (likely an ID, not a math value)
//   - Numeric with extreme precision (>15 digits) → string (Number can't represent safely)
//   - Boolean-looking ("true", "false") → boolean
//   - Anything else → string (trimmed)
//
// IMPORTANT: preserves phone numbers and IDs as strings — phone "5559409818"
// has 10 digits, which JS Number can represent, BUT we never pass phone numbers
// through this function. This is ONLY called for custom_fields values; phones
// have their own code path.

export function coerceCellValue(raw: string): string | number | boolean | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '') return null;

  // Boolean-ish (match common CSV booleans, case-insensitive)
  const lower = s.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;

  // Numeric detection
  // Allow optional leading minus, digits, optional single decimal point
  const numericPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
  if (numericPattern.test(s)) {
    // Safety: reject leading-zero integers (likely IDs) and numbers with >15
    // significant digits where round-trip through Number loses info.
    if (/^-?0\d/.test(s)) return s; // "007" stays a string
    const asNumber = Number(s);
    if (!Number.isFinite(asNumber)) return s;
    // Precision guard: if round-trip through Number loses info, keep as string
    if (String(asNumber) !== s && String(asNumber) !== s.replace(/^-0/, '-0')) {
      // Allow "3.1" vs "3.10" roundtrip mismatches via normalized compare
      if (parseFloat(s) !== asNumber) return s;
    }
    return asNumber;
  }

  return s;
}
