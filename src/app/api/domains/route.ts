import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/domains — list authenticated user's custom domains
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("custom_domains")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/domains — register a new custom domain
export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { domain } = body;

  if (!domain || typeof domain !== "string") {
    return NextResponse.json({ error: "Domain is required" }, { status: 400 });
  }

  // Normalise: strip protocol, path, and www prefix
  const cleanDomain = domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");

  // Basic format validation
  const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;
  if (!domainRegex.test(cleanDomain)) {
    return NextResponse.json(
      { error: "Enter a valid domain like app.youragency.com" },
      { status: 400 }
    );
  }

  // Block reserved / platform domains
  const blocked = [
    "leadfriendly.com",
    "google.com",
    "facebook.com",
    "vercel.app",
    "supabase.co",
    "github.com",
    "localhost",
    "anthropic.com",
  ];
  if (blocked.some((b) => cleanDomain === b || cleanDomain.endsWith(`.${b}`))) {
    return NextResponse.json(
      { error: "This domain cannot be used" },
      { status: 400 }
    );
  }

  // Check for duplicate
  const { data: existing } = await supabase
    .from("custom_domains")
    .select("id")
    .eq("domain", cleanDomain)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "This domain is already registered" },
      { status: 409 }
    );
  }

  // Use user ID as agency ID (owner)
  const agencyId = user.id;
  const token = "lf-verify-" + crypto.randomUUID().slice(0, 12);

  const { data, error } = await supabase
    .from("custom_domains")
    .insert({
      agency_id: agencyId,
      user_id: user.id,
      domain: cleanDomain,
      verification_token: token,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Derive the subdomain host prefix for the CNAME record
  // e.g. "crm.myagency.com" → host = "crm"
  const parts = cleanDomain.split(".");
  const cnameHost = parts.length > 2 ? parts[0] : "@";

  return NextResponse.json({
    domain: data,
    instructions: {
      txt: {
        type: "TXT",
        host: "_leadfriendly",
        value: token,
        purpose: "Proves you own this domain",
      },
      cname: {
        type: "CNAME",
        host: cnameHost,
        value: "cname.vercel-dns.com",
        purpose: "Routes traffic to Lead Friendly",
      },
    },
  });
}
