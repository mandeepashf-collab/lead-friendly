"use client";

import { useState, useRef } from "react";
import { X, Upload, FileSpreadsheet, Check, AlertCircle, Loader2, Download } from "lucide-react";
import { bulkImportContacts } from "@/hooks/use-contacts";
import { bulkAddContactTags } from "@/hooks/use-contact-tags";

interface Props {
  onClose: () => void;
  onImported: () => void;
}

interface ParsedRow {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
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
  const fileRef = useRef<HTMLInputElement>(null);

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
      let rowTags: string[] = [];
      const rowCustom: Record<string, string> = {};
      Object.entries(mapping).forEach(([csvCol, dbField]) => {
        if (dbField === "tags") {
          rowTags = row[csvCol]?.split(";").map((t) => t.trim()).filter(Boolean) || [];
        } else if (dbField === "__custom__") {
          // Handled in customCols loop below
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
                <h3 className="mb-2 text-sm font-medium text-zinc-300">Map CSV columns to contact fields:</h3>
                <div className="space-y-2">
                  {parsed.headers.map((header) => {
                    const mapped = mapping[header] || "";
                    const isCustom = mapped === "__custom__";
                    return (
                      <div key={header} className="flex items-center gap-3">
                        <span className="w-40 truncate text-sm text-zinc-400">{header}</span>
                        <span className="text-zinc-600">→</span>
                        <select value={mapped} onChange={(e) => setMapping({ ...mapping, [header]: e.target.value })}
                          className={`h-8 rounded-lg border border-zinc-700 bg-zinc-800 px-2 text-sm text-white focus:border-indigo-500 focus:outline-none ${isCustom ? "flex-none w-44" : "flex-1"}`}>
                          {contactFields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                        {isCustom && (
                          <input
                            value={customKeys[header] || ""}
                            onChange={(e) => setCustomKeys({ ...customKeys, [header]: e.target.value })}
                            placeholder="field_name (e.g. loan_amount)"
                            className="h-8 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-sm text-zinc-300 placeholder:text-zinc-600 focus:border-indigo-500 focus:outline-none"
                          />
                        )}
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
