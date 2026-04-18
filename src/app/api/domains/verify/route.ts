import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import dns from "dns/promises";

// ── DNS Checks ────────────────────────────────────────────────

async function checkTXT(domain: string, expectedToken: string): Promise<boolean> {
  // Check both the bare domain and the _leadfriendly subdomain
  const hosts = [domain, `_leadfriendly.${domain}`];

  for (const host of hosts) {
    try {
      const records = await dns.resolveTxt(host);
      const found = records.some((record) =>
        record.some((txt) => txt.trim() === expectedToken)
      );
      if (found) return true;
    } catch {
      // Record doesn't exist for this host — try next
    }
  }

  return false;
}

async function checkCNAME(domain: string): Promise<boolean> {
  try {
    const records = await dns.resolveCname(domain);
    const pointsToVercel = records.some(
      (r) =>
        r.toLowerCase().includes("vercel-dns.com") ||
        r.toLowerCase().includes("vercel.com") ||
        r.toLowerCase().includes("leadfriendly.com")
    );
    if (pointsToVercel) return true;
  } catch {
    // No CNAME record — fall through to A record check
  }

  // Fallback: check if A record points to Vercel's anycast IP
  try {
    const aRecords = await dns.resolve4(domain);
    return aRecords.some((ip) => ip === "76.76.21.21");
  } catch {
    return false;
  }
}

// ── Vercel Domain Registration ────────────────────────────────

async function addDomainToVercel(
  domain: string
): Promise<{ success: boolean; error?: string }> {
  const token = process.env.VERCEL_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;

  if (!token || !projectId) {
    console.warn("[domains/verify] VERCEL_TOKEN or VERCEL_PROJECT_ID not set — skipping Vercel registration");
    // Don't block verification just because Vercel env vars aren't set
    return { success: true };
  }

  try {
    const res = await fetch(
      `https://api.vercel.com/v10/projects/${projectId}/domains`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: domain }),
      }
    );

    if (res.ok) return { success: true };

    const data = (await res.json()) as { error?: { message?: string } };

    // Domain already on the project is fine
    if (data.error?.message?.toLowerCase().includes("already")) {
      return { success: true };
    }

    console.error("[domains/verify] Vercel domain add failed:", data.error);
    return { success: false, error: data.error?.message || "Failed to add domain to Vercel" };
  } catch (err) {
    console.error("[domains/verify] Network error:", err);
    return { success: false, error: "Network error connecting to Vercel" };
  }
}

// ── Route Handler ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { domain_id } = body;

  if (!domain_id) {
    return NextResponse.json({ error: "domain_id is required" }, { status: 400 });
  }

  // Fetch the domain record (scoped to this user via RLS)
  const { data: domainRecord, error } = await supabase
    .from("custom_domains")
    .select("*")
    .eq("id", domain_id)
    .eq("user_id", user.id)
    .single();

  if (error || !domainRecord) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  // Run DNS checks in parallel
  const [txtOk, cnameOk] = await Promise.all([
    checkTXT(domainRecord.domain, domainRecord.verification_token),
    checkCNAME(domainRecord.domain),
  ]);

  // Determine new status
  const updates: Record<string, unknown> = {
    txt_verified: txtOk,
    cname_verified: cnameOk,
    updated_at: new Date().toISOString(),
  };

  let message: string;

  if (txtOk && cnameOk) {
    const vercelResult = await addDomainToVercel(domainRecord.domain);

    if (vercelResult.success) {
      updates.status = "active";
      updates.verified_at = new Date().toISOString();
      updates.ssl_status = "provisioning";
      message = "Domain verified and connected! SSL will be provisioned automatically within a few minutes.";
    } else {
      updates.status = "verified";
      message = `DNS records confirmed but Vercel registration failed: ${vercelResult.error}. Please contact support.`;
    }
  } else if (txtOk) {
    updates.status = "pending";
    message = "Ownership verified ✓ — now add your CNAME record pointing to cname.vercel-dns.com and verify again.";
  } else {
    updates.status = "pending";
    message = "TXT record not found yet. Add the TXT record to your DNS provider and try again. Changes can take 5–30 minutes.";
  }

  await supabase
    .from("custom_domains")
    .update(updates)
    .eq("id", domain_id);

  return NextResponse.json({
    txt_verified: txtOk,
    cname_verified: cnameOk,
    status: updates.status,
    message,
  });
}
