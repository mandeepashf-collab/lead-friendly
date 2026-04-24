// src/lib/import/tagNaming.ts
//
// Pure utilities for the CSV importer's "Tag each value" column option.
// Each cell value becomes a tag named `<column-slug>-<value-slug>`.
//
// Examples:
//   columnValueToTagName("LeadLevel Name", "CI-A")     → "leadlevel-ci-a"
//   columnValueToTagName("LeadLevel Name", "CI-A1")    → "leadlevel-ci-a1"
//   columnValueToTagName("Lender", "Quicken Loans")    → "lender-quicken-loans"
//   columnValueToTagName("Campaign", "Q1 2026")        → "campaign-q1-2026"
//   columnValueToTagName("Status", "New Lead")         → "status-new-lead"
//   columnValueToTagName("Any",    "")                 → null  (skip)
//   columnValueToTagName("Any",    "   ")              → null  (skip)

export function columnValueToTagName(columnHeader: string, cellValue: string): string | null {
  const trimmedValue = cellValue?.trim();
  if (!trimmedValue) return null;

  const normalizedHeader = columnHeader
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/(name|type|category)$/, '');

  const normalizedValue = trimmedValue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalizedValue) return null;
  if (!normalizedHeader) return normalizedValue.slice(0, 64);

  return `${normalizedHeader}-${normalizedValue}`.slice(0, 64);
}

/**
 * Given a column and an array of all cell values, returns the unique tag
 * names that would be created. Used for the import preview.
 */
export function previewTagsForColumn(columnHeader: string, cellValues: string[]): string[] {
  const unique = new Set<string>();
  for (const v of cellValues) {
    const tag = columnValueToTagName(columnHeader, v);
    if (tag) unique.add(tag);
  }
  return Array.from(unique).sort();
}
