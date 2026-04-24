"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { X, Upload, FileSpreadsheet, Check, AlertCircle, Loader2, Download } from "lucide-react";
import { bulkImportContacts } from "@/hooks/use-contacts";
import { bulkAddContactTags } from "@/hooks/use-contact-tags";
import { columnValueToTagName, previewTagsForColumn } from "@/lib/import/tagNaming";
import { resolveStatusOrNull } from "@/lib/import/statusAliases";
import { createClient } from "@/lib/supabase/client";

interface Props {
  onClose: () => void;
  onImported: () => void;
}

interface ParsedRow {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  cell_phone?: string;
  company_name?: string;
  job_title?: string;
  address_line1?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  source?: string;
  status?: string;
  tags?: string[];
}

/**
 * Parse a CSV string respecting quoted fields, escaped quotes (""), and
 * newlines inside quoted values. Auto-detects delimiter among `,`, `\t`,
 * `;`, `|` by picking the one with the most occurrences on the header line.
 * Strips UTF-8 BOM. Falls back to comma if detection produces a single-
 * column result that contains commas (common Google Sheets export quirk).
 */
function parseCSV(text: string): { headers: string[]; rows: Record<string, string>[] } {
  if (!text.trim()) return { headers: [], rows: [] };

  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const parseWithDelim = (srcText: string, delim: string) => {
    const records: string[][] = [];
    let cur: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < srcText.length; i++) {
      const c = srcText[i];
      if (inQuotes) {
        if (c === '"') {
          if (srcText[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += c;
        }
      } else {
        if (c === '"') { inQuotes = true; }
        else if (c === delim) { cur.push(field); field = ""; }
        else if (c === "\n" || c === "\r") {
          if (field !== "" || cur.length > 0) {
            cur.push(field); records.push(cur); cur = []; field = "";
          }
          if (c === "\r" && srcText[i + 1] === "\n") i++;
        } else {
          field += c;
        }
      }
    }
    if (field !== "" || cur.length > 0) { cur.push(field); records.push(cur); }
    return records;
  };

  // Detect delimiter by count on first line
  const firstLineEnd = text.indexOf("\n") === -1 ? text.length : text.indexOf("\n");
  const firstLine = text.slice(0, firstLineEnd).replace(/\r$/, "");
  const counts: Record<string, number> = {
    ",":  (firstLine.match(/,/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
    ";":  (firstLine.match(/;/g) ?? []).length,
    "|":  (firstLine.match(/\|/g) ?? []).length,
  };
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  let delim = best[1] > 0 ? best[0] : ",";

  let records = parseWithDelim(text, delim);

  // Defensive fallback: one-column result that contains commas ⇒ re-parse with ","
  if (records.length > 0 && records[0].length === 1 && records[0][0].includes(",") && delim !== ",") {
    records = parseWithDelim(text, ",");
  }

  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) =>
    h.trim().toLowerCase().replace(/\s+/g, "_")
  );
  const rows = records.slice(1).map((values) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = (values[i] ?? "").trim(); });
    return row;
  });

  return { headers, rows };
}

// Slugify a user-typed custom field key so it lands cleanly in JSONB.
// "Loan Amount" -> "loan_amount", "Birth Date!" -> "birth_date".
const slugifyKey = (raw: string) =>
  raw.trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

// ─── Inline preview sub-components (Stage 1.6) ──────────────────────────

/**
 * Shows a count of unique values in a Status column and whether each maps
 * cleanly to the contacts status enum or will fall back to "new" + tag.
 */
function StatusColumnPreview({ cellValues }: { cellValues: string[] }) {
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of cellValues) {
      const key = v?.trim() ?? "";
      if (!key) continue;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [cellValues]);

  const displayed = counts.slice(0, 20);
  const more = Math.max(0, counts.length - 20);

  return (
    <div className="ml-48 rounded border border-zinc-800 bg-zinc-950/60 p-3 text-xs">
      <div className="font-medium text-zinc-300 mb-2">
        Status column preview ({counts.length} unique value{counts.length === 1 ? "" : "s"})
      </div>
      <ul className="space-y-1">
        {displayed.map(([raw, n]) => {
          const mapped = resolveStatusOrNull(raw);
          return (
            <li key={raw} className="flex items-center gap-2">
              <span className="font-mono text-zinc-100">&quot;{raw}&quot;</span>
              <span className="text-zinc-600">→</span>
              {mapped === null ? (
                <span className="text-amber-400">⚠ unmapped (will default to &quot;new&quot; + status-tag)</span>
              ) : (
                <span className="text-zinc-400">{mapped}</span>
              )}
              <span className="ml-auto text-zinc-500">({n} row{n === 1 ? "" : "s"})</span>
            </li>
          );
        })}
      </ul>
      {more > 0 && <div className="mt-1 text-zinc-500">+{more} more value{more === 1 ? "" : "s"}</div>}
    </div>
  );
}

/**
 * Shows the first 5 unique tag names that a "Tag each value" column would
 * generate, namespaced by column header.
 */
function TagEachValuePreview({ columnHeader, cellValues }: { columnHeader: string; cellValues: string[] }) {
  const tags = useMemo(
    () => previewTagsForColumn(columnHeader, cellValues),
    [columnHeader, cellValues],
  );
  const shown = tags.slice(0, 5);
  const more = Math.max(0, tags.length - 5);
  return (
    <div className="ml-48 rounded border border-zinc-800 bg-zinc-950/60 p-3 text-xs">
      <div className="font-medium text-zinc-300 mb-2">
        Will create {tags.length} tag{tags.length === 1 ? "" : "s"}
      </div>
      <div className="flex flex-wrap gap-1">
        {shown.map((t) => (
          <span key={t} className="rounded bg-zinc-900 border border-zinc-700 px-2 py-0.5 font-mono text-zinc-300">
            {t}
          </span>
        ))}
        {more > 0 && <span className="text-zinc-500">+{more} more</span>}
      </div>
    </div>
  );
}

/**
 * Input for the Custom Field key name, with autocomplete suggestions pulled
 * from get_org_custom_field_keys RPC (migration 020). Falls back to a plain
 * input if the RPC is unavailable or the org has no existing custom keys.
 */
function CustomFieldKeyInput({
  organizationId, value, onChange,
}: {
  organizationId: string | null;
  value: string;
  onChange: (v: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<Array<{ key: string; usage_count: number }>>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_org_custom_field_keys", {
        p_organization_id: organizationId,
      });
      if (!cancelled && !error && data) {
        setSuggestions(data as Array<{ key: string; usage_count: number }>);
      }
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

  const filtered = useMemo(() => {
    const q = value.toLowerCase().trim();
    if (!q) return suggestions.slice(0, 10);
    return suggestions.filter((s) => s.key.toLowerCase().includes(q)).slice(0, 10);
  }, [value, suggestions]);

  return (
    // Stage 1.6.3 Fix 2: explicit h-8 on the relative container prevents its
    // height from collapsing when the input is flexed, which would otherwise
    // pull `top-full` above the input's visible bottom. max-h-40 (was 48)
    // shrinks the dropdown so it's less likely to be clipped by the modal's
    // own overflow-y-auto boundary.
    <div className="relative flex-1 h-8">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="field_name (e.g. loan_amount)"
        className="h-8 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
      />
      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-40 overflow-y-auto rounded-md border border-zinc-700 bg-zinc-900 shadow-xl"
        >
          {filtered.map((s) => (
            <li key={s.key}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(s.key); setOpen(false); }}
                className="flex w-full justify-between px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-zinc-800"
              >
                <span className="font-mono">{s.key}</span>
                <span className="text-xs text-zinc-500">{s.usage_count} contact{s.usage_count === 1 ? "" : "s"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Truncate a CSV cell value for display next to its column header.
// Stage 1.6.2 Fix B — gives the user a preview of what's in each column
// before they pick a mapping. Hover shows the full via title attr.
function formatSamplePreview(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const str = String(value).trim();
  if (str === "") return "(empty)";
  if (str.length > 24) return str.slice(0, 22) + "…";
  return str;
}

// Stage 1.6.2 Fix C — fuzzy-match rules for the Auto-detect button.
// Order matters: first match wins, so more specific patterns go first
// (cell_phone before phone to avoid "mobile phone" matching plain phone).
// Mapping values match the `value` in contactFields below — NOT target DB
// columns directly, since a few UI values differ from DB fields.
const AUTO_DETECT_RULES: Array<{ pattern: RegExp; mapping: string }> = [
  { pattern: /^(first[_\s-]?name|fname|first|given[_\s-]?name)$/i, mapping: "first_name" },
  { pattern: /^(last[_\s-]?name|lname|last|surname|family[_\s-]?name)$/i, mapping: "last_name" },
  { pattern: /^(email|email[_\s-]?address|e[_\s-]?mail)$/i, mapping: "email" },
  { pattern: /^(cell[_\s-]?phone|cellphone|cell|mobile|mobile[_\s-]?phone|mobile[_\s-]?number)$/i, mapping: "cell_phone" },
  { pattern: /^(phone|phone[_\s-]?number|telephone|tel|landline|home[_\s-]?phone|work[_\s-]?phone)$/i, mapping: "phone" },
  { pattern: /^(company|organization|organisation|business|employer|company[_\s-]?name)$/i, mapping: "company_name" },
  { pattern: /^(job[_\s-]?title|title|position|role)$/i, mapping: "job_title" },
  { pattern: /^(street[_\s-]?1|street|address|address[_\s-]?1|addr|addr1)$/i, mapping: "address_line1" },
  { pattern: /^(city|town)$/i, mapping: "city" },
  { pattern: /^(state|region|province|st)$/i, mapping: "state" },
  { pattern: /^(zip|zip[_\s-]?code|postal[_\s-]?code|postcode)$/i, mapping: "zip_code" },
  { pattern: /^(status|stage|pipeline[_\s-]?stage|lifecycle)$/i, mapping: "status" },
  { pattern: /^(source|lead[_\s-]?source|origin)$/i, mapping: "source" },
];

function autoDetectMapping(columnHeader: string): string | null {
  const normalized = columnHeader.trim();
  for (const rule of AUTO_DETECT_RULES) {
    if (rule.pattern.test(normalized)) return rule.mapping;
  }
  return null;
}

const FIELD_MAP: Record<string, string> = {
  first_name: "first_name", firstname: "first_name", "first name": "first_name",
  last_name: "last_name", lastname: "last_name", "last name": "last_name",
  email: "email", "email address": "email", email_address: "email",
  phone: "phone", "phone number": "phone", phone_number: "phone", mobile: "phone",
  company: "company_name", company_name: "company_name", "company name": "company_name", organization: "company_name",
  title: "job_title", job_title: "job_title", "job title": "job_title",
  address: "address_line1", address_line1: "address_line1", street: "address_line1",
  city: "city",
  state: "state", province: "state",
  zip: "zip_code", zip_code: "zip_code", postal_code: "zip_code", "zip code": "zip_code",
  source: "source", lead_source: "source",
  status: "status",
  tags: "tags",
};

export function ImportDialog({ onClose, onImported }: Props) {
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">("upload");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<{ headers: string[]; rows: Record<string, string>[] }>({ headers: [], rows: [] });
  const [mapping, setMapping] = useState<Record<string, string>>({});
  // When mapping[csvCol] === "__custom__", customKeys[csvCol] holds the
  // user-typed key name that the value will land under in custom_fields.
  const [customKeys, setCustomKeys] = useState<Record<string, string>>({});
  const [importResult, setImportResult] = useState({ count: 0, skipped: 0, error: "" });
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load the user's org once so the Custom Field autocomplete can query the
  // get_org_custom_field_keys RPC (migration 020). If the RPC is unavailable
  // or the user has no org, the autocomplete silently shows zero suggestions.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles").select("organization_id").eq("id", user.id).single();
      if (!cancelled && profile?.organization_id) {
        setOrganizationId(profile.organization_id as string);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const result = parseCSV(text);
      setParsed(result);

      // Auto-map columns
      const autoMap: Record<string, string> = {};
      result.headers.forEach((h) => {
        const key = h.toLowerCase().replace(/\s+/g, "_");
        if (FIELD_MAP[key]) autoMap[h] = FIELD_MAP[key];
      });
      setMapping(autoMap);
      setStep("preview");
    };
    reader.readAsText(file);
  };

  // Stage 1.6.2 Fix C + 1.6.3 Fix 4: re-run regex-based mapping on columns
  // currently set to Skip. Never overrides user's explicit choices. Idempotent.
  // For columns with no rule match but a non-empty first-row value, fall back
  // to Custom Field with the normalized column name as the JSONB key so
  // domain-specific imports (loan_amount, lender, county, etc.) land somewhere
  // instead of silently skipping.
  //
  // Batched setters: compute both nextMapping and nextCustomKeys from a single
  // read of the current state, then dispatch both. React 18 batches into one
  // render, so the user sees both changes at once.
  const handleAutoDetect = () => {
    const nextMapping = { ...mapping };
    const nextCustomKeys = { ...customKeys };
    let byRule = 0;
    let asCustom = 0;

    for (const col of parsed.headers) {
      const current = nextMapping[col] || "";
      if (current && current !== "") continue; // user-picked non-empty: leave alone

      const detected = autoDetectMapping(col);
      if (detected) {
        nextMapping[col] = detected;
        byRule++;
        // Trace: status-column sanity check per Mandeep's earlier question
        if (col.toLowerCase() === "status") {
          console.log(`[auto-detect] status column matched rule → "${detected}"`);
        }
        continue;
      }

      // Fallback: non-empty first-row value → Custom Field
      const firstRowValue = parsed.rows[0]?.[col];
      const hasData = firstRowValue != null && String(firstRowValue).trim() !== "";
      if (hasData) {
        nextMapping[col] = "__custom__";
        // slugifyKey mirrors the user-typed key normalization (Stage 1.6),
        // so "Loan Amount" → "loan_amount" matches whichever entry path is used.
        nextCustomKeys[col] = slugifyKey(col);
        asCustom++;
      }
    }

    setMapping(nextMapping);
    setCustomKeys(nextCustomKeys);
    console.log(`[auto-detect] ${byRule} by rule, ${asCustom} as custom field`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".csv") || file.name.endsWith(".tsv"))) {
      handleFile(file);
    }
  };

  const handleImport = async () => {
    setStep("importing");

    // Build two parallel arrays kept in lockstep with the filter: contacts
    // WITHOUT tags, and tag lists keyed by the same index. Tags are NOT put on
    // the contact row — they're RPC'd after insert so contact_tags stays in sync.
    const tagsByRowIndex: string[][] = [];
    const customFieldsByIndex: Record<string, string>[] = [];
    const contacts: ParsedRow[] = [];

    // Precompute the list of CSV cols that are "Custom Field" so we don't
    // re-check on every row. Keys are user-typed and may include non-slug
    // characters — slugifyKey normalizes them. Empty keys are dropped.
    const customCols: { csvCol: string; key: string }[] = Object.entries(mapping)
      .filter(([, v]) => v === "__custom__")
      .map(([csvCol]) => ({ csvCol, key: slugifyKey(customKeys[csvCol] || "") }))
      .filter((c) => c.key.length > 0);

    for (const row of parsed.rows) {
      const contact: Record<string, unknown> = {};
      const rowTags: string[] = [];
      const rowCustom: Record<string, string> = {};
      Object.entries(mapping).forEach(([csvCol, dbField]) => {
        if (dbField === "tags") {
          // Semicolon-separated tag column
          const parsedTags = row[csvCol]?.split(";").map((t) => t.trim()).filter(Boolean) || [];
          for (const t of parsedTags) rowTags.push(t);
        } else if (dbField === "__tag_each__") {
          // Stage 1.6: each distinct cell value becomes its own tag,
          // namespaced by column header (e.g. LeadLevel="CI-A" → "leadlevel-ci-a").
          const tagName = columnValueToTagName(csvCol, row[csvCol] ?? "");
          if (tagName) rowTags.push(tagName);
        } else if (dbField === "__custom__") {
          // Handled in customCols loop below
        } else if (dbField === "cell_phone") {
          // Stage 1.6: dedicated column, not custom_fields. Uses the same
          // digits-only normalization as `phone` via bulkImportContacts.
          // TODO: proper E.164 normalization is a separate cleanup (tracked for Stage X).
          contact.cell_phone = row[csvCol] || undefined;
        } else {
          contact[dbField] = row[csvCol] || undefined;
        }
      });
      for (const { csvCol, key } of customCols) {
        const v = row[csvCol];
        if (v !== undefined && v !== "") rowCustom[key] = v;
      }
      const c = contact as ParsedRow;
      if (c.first_name || c.email || c.phone) {
        contacts.push(c);
        tagsByRowIndex.push(rowTags);
        customFieldsByIndex.push(rowCustom);
      }
    }

    const result = await bulkImportContacts(contacts, customFieldsByIndex);

    // insertedIds is now aligned 1:1 with input (nulls mark deduped rows).
    // Apply tags only to rows that actually inserted.
    const pairs: { contact_id: string; tag: string; source: "csv_import" }[] = [];
    result.insertedIds.forEach((id, idx) => {
      if (!id) return; // deduped row — skip, no contact to tag
      for (const tag of tagsByRowIndex[idx]) {
        pairs.push({ contact_id: id, tag, source: "csv_import" });
      }
    });

    // Apply status-fallback tags (rows whose original status didn't match
    // the enum or a known alias — we preserved the original as a tag).
    for (const { rowIndex, tag } of result.statusFallbackPairs) {
      const id = result.insertedIds[rowIndex];
      if (!id) continue;
      pairs.push({ contact_id: id, tag, source: "csv_import" });
    }

    if (pairs.length) await bulkAddContactTags(pairs);

    setImportResult({
      count: result.count,
      skipped: result.skipped || 0,
      error: result.error || "",
    });
    setStep("done");
  };

  const contactFields = [
    { value: "", label: "— Skip —" },
    { value: "first_name", label: "First Name" },
    { value: "last_name", label: "Last Name" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone" },
    { value: "company_name", label: "Company" },
    { value: "job_title", label: "Job Title" },
    { value: "address_line1", label: "Address" },
    { value: "city", label: "City" },
    { value: "state", label: "State" },
    { value: "zip_code", label: "ZIP Code" },
    { value: "source", label: "Source" },
    { value: "status", label: "Status" },
    { value: "tags", label: "Tags (semicolon-separated)" },
    { value: "cell_phone", label: "Cell Phone" },
    { value: "__tag_each__", label: "Tag each value" },
    { value: "__custom__", label: "Custom Field" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Import Contacts from CSV</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-6">
          {/* Step 1: Upload */}
          {step === "upload" && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-800/30 p-10 text-center hover:border-indigo-500/50 transition-colors cursor-pointer"
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-10 w-10 text-zinc-500" />
                <p className="mt-3 text-sm font-medium text-zinc-300">Drop your CSV file here or click to browse</p>
                <p className="mt-1 text-xs text-zinc-500">Supports .csv and .tsv files</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,.tsv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

              <div className="rounded-lg bg-zinc-800/50 p-4">
                <p className="text-sm font-medium text-zinc-300">Expected CSV format:</p>
                <code className="mt-2 block text-xs text-zinc-500">
                  first_name,last_name,email,phone,company,status<br />
                  John,Doe,john@example.com,+15551234567,Acme Corp,new
                </code>
              </div>
            </div>
          )}

          {/* Step 2: Preview & Map */}
          {step === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-zinc-800/50 p-3">
                <FileSpreadsheet className="h-5 w-5 text-indigo-400" />
                <div>
                  <p className="text-sm font-medium text-white">{fileName}</p>
                  <p className="text-xs text-zinc-400">{parsed.rows.length} rows found</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-zinc-300">Map CSV columns to contact fields:</h3>
                  <button
                    type="button"
                    onClick={handleAutoDetect}
                    className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                    title="Fill in mappings for columns currently set to Skip. Your existing choices won't change."
                  >
                    Auto-detect mappings
                  </button>
                </div>
                <div className="space-y-2">
                  {parsed.headers.map((header) => {
                    const mapped = mapping[header] || "";
                    const isCustom = mapped === "__custom__";
                    const isStatus = mapped === "status";
                    const isTagEach = mapped === "__tag_each__";
                    const isTagsSemi = mapped === "tags";
                    // Column values — pre-sliced for the preview components.
                    const columnValues = parsed.rows.map((r) => r[header] ?? "");
                    const firstRowValue = parsed.rows[0]?.[header];
                    const sampleText = formatSamplePreview(firstRowValue);
                    // Slug prefix mirrors columnValueToTagName's header normalization;
                    // kept inline so the Tag-each helper text example stays live.
                    const slugPrefix = header
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "")
                      .replace(/(name|type|category)$/, "");
                    return (
                      <div key={header} className="space-y-1">
                        <div className="flex items-center gap-3">
                          <span className="w-36 truncate text-sm text-zinc-300 shrink-0 font-mono">{header}</span>
                          <span
                            className="w-32 truncate text-xs text-zinc-500 font-mono shrink-0"
                            title={String(firstRowValue ?? "")}
                          >
                            {sampleText}
                          </span>
                          <span className="text-zinc-600 shrink-0">→</span>
                          <select value={mapped} onChange={(e) => setMapping({ ...mapping, [header]: e.target.value })}
                            className={`h-8 rounded-lg border border-zinc-700 bg-zinc-800 px-2 text-sm text-white focus:border-indigo-500 focus:outline-none ${isCustom ? "flex-none w-44" : "flex-1"}`}>
                            {contactFields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                          </select>
                          {isCustom && (
                            <CustomFieldKeyInput
                              organizationId={organizationId}
                              value={customKeys[header] || ""}
                              onChange={(v) => setCustomKeys({ ...customKeys, [header]: v })}
                            />
                          )}
                        </div>
                        {/* Stage 1.6.2 Fix A + 1.6.3 Fix 3B — inline helper text per option type */}
                        {isStatus && (
                          <p className="ml-36 pl-3 text-xs text-zinc-500">
                            Updates the contact&apos;s pipeline stage (used by filters and status chips). See Status Column Preview below.
                          </p>
                        )}
                        {isTagsSemi && (
                          <p className="ml-36 pl-3 text-xs text-zinc-500">
                            CSV value like <code className="text-zinc-400">vip;referred</code> creates both tags on each contact.
                          </p>
                        )}
                        {isTagEach && (
                          <p className="ml-36 pl-3 text-xs text-zinc-500">
                            Each unique value becomes its own tag, prefixed with the column name
                            (e.g. <code className="text-zinc-400">CI-A1</code> → <code className="text-zinc-400">{slugPrefix || "col"}-ci-a1</code>).
                          </p>
                        )}
                        {isCustom && (
                          <p className="ml-36 pl-3 text-xs text-zinc-500">
                            Stored as metadata. Visible on the contact detail page but not filterable by campaigns (use a tag for that).
                          </p>
                        )}
                        {isStatus && <StatusColumnPreview cellValues={columnValues} />}
                        {isTagEach && <TagEachValuePreview columnHeader={header} cellValues={columnValues} />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Preview Table */}
              <div className="overflow-x-auto rounded-lg border border-zinc-800">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-800/50">
                      {parsed.headers.filter(h => mapping[h]).map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-zinc-400">{mapping[h]?.replace(/_/g, " ")}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b border-zinc-800/50">
                        {parsed.headers.filter(h => mapping[h]).map((h) => (
                          <td key={h} className="px-3 py-2 text-zinc-300 truncate max-w-[150px]">{row[h]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.rows.length > 5 && <p className="px-3 py-2 text-xs text-zinc-500">... and {parsed.rows.length - 5} more rows</p>}
              </div>

              <div className="flex items-center justify-end gap-3">
                <button onClick={() => setStep("upload")} className="h-9 rounded-lg border border-zinc-700 px-4 text-sm text-zinc-300 hover:bg-zinc-800">Back</button>
                <button onClick={handleImport} disabled={Object.values(mapping).filter(Boolean).length === 0}
                  className="flex h-9 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                  <Upload className="h-4 w-4" />Import {parsed.rows.length} Contacts
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Importing */}
          {step === "importing" && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
              <p className="mt-4 text-sm text-zinc-400">Importing contacts...</p>
            </div>
          )}

          {/* Step 4: Done */}
          {step === "done" && (
            <div className="flex flex-col items-center justify-center py-12">
              {importResult.error ? (
                <>
                  <AlertCircle className="h-10 w-10 text-red-400" />
                  <p className="mt-4 text-sm font-medium text-red-400">Import failed</p>
                  <p className="mt-1 text-xs text-zinc-500">{importResult.error}</p>
                </>
              ) : (
                <>
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10">
                    <Check className="h-7 w-7 text-green-400" />
                  </div>
                  <p className="mt-4 text-lg font-semibold text-white">{importResult.count} contacts imported</p>
                  {importResult.skipped > 0 && (
                    <p className="mt-1 text-xs text-zinc-500">
                      ({importResult.skipped} skipped as duplicates)
                    </p>
                  )}
                  <p className="mt-1 text-sm text-zinc-400">Your contacts are ready to use</p>
                </>
              )}
              <button onClick={importResult.error ? () => setStep("preview") : onImported}
                className="mt-6 h-9 rounded-lg bg-indigo-600 px-6 text-sm font-medium text-white hover:bg-indigo-700">
                {importResult.error ? "Try Again" : "Done"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
