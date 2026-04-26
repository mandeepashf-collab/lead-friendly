// HISTORICAL — already executed against prod in planning session.
// Committed for auditability. Do NOT re-run without reason.
//
// Generates UPDATE SQL to backfill contacts.timezone using NANPA inference
// from their phone numbers. Call with tsx: npx tsx scripts/compute_tz_backfill.ts

import { inferTimezone } from "../src/lib/phone/timezone";

// Snapshot of 35 contacts at Apr 24, 2026. Refresh this list by querying:
//   SELECT id, first_name, last_name, phone FROM contacts ORDER BY created_at DESC;
const contacts = [
  { id: "fd86cc04-22f0-4c73-8c54-80c9aceb66eb", name: "Chris Lachance", phone: "9257836367" },
  // ... truncated; see supabase migration 022 for the applied updates
];

const updates: { id: string; tz: string }[] = [];
const unresolved: { name: string; phone: string }[] = [];

for (const c of contacts) {
  const t = inferTimezone(c.phone);
  if (t) updates.push({ id: c.id, tz: t.tz });
  else unresolved.push({ name: c.name, phone: c.phone });
}

console.log(`Resolved: ${updates.length}, Unresolved: ${unresolved.length}`);
console.log("\n-- SQL:");
console.log("UPDATE public.contacts SET timezone = CASE id");
for (const u of updates) console.log(`  WHEN '${u.id}'::uuid THEN '${u.tz}'`);
console.log("  ELSE timezone END");
console.log(`WHERE id IN (${updates.map((u) => `'${u.id}'::uuid`).join(",")});`);
