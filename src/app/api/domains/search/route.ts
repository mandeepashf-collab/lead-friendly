import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/domains/search?query=myagency
// Returns available domains across common TLDs with our marked-up pricing
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const query = request.nextUrl.searchParams.get("query");
  if (!query || query.length < 2) {
    return NextResponse.json(
      { error: "Search query must be at least 2 characters" },
      { status: 400 }
    );
  }

  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Server config missing" }, { status: 500 });
  }

  // Sanitise: letters, digits, hyphens only
  const cleanQuery = query
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, ""); // strip leading/trailing hyphens

  if (!cleanQuery) {
    return NextResponse.json({ error: "Invalid search query" }, { status: 400 });
  }

  // TLDs to check — ordered by how desirable they are
  const tlds = ["com", "io", "co", "app", "ai", "agency", "dev", "net", "org"];
  const domainNames = tlds.map((tld) => `${cleanQuery}.${tld}`);

  // Our markup per year (what we charge above Vercel's wholesale price)
  const MARKUP = 8;

  // Run all checks in parallel
  const results = await Promise.all(
    domainNames.map(async (domain) => {
      try {
        // v1 Registrar API (v4/domains/* was sunsetted Nov 2025)
        const [statusRes, priceRes] = await Promise.all([
          fetch(`https://api.vercel.com/v1/registrar/domains/${domain}/availability`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`https://api.vercel.com/v1/registrar/domains/${domain}/price`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const statusData = (await statusRes.json()) as { available?: boolean };
        const priceData = (await priceRes.json()) as {
          price?: number;
          period?: number;
        };

        const costPerYear = priceData.price ?? 0;
        const ourPrice = Math.ceil(costPerYear) + MARKUP;

        return {
          domain,
          tld: domain.split(".").slice(1).join("."),
          available: statusData.available ?? false,
          wholesalePrice: costPerYear, // never sent to frontend
          price: ourPrice,
          period: priceData.period ?? 1,
          currency: "USD",
        };
      } catch {
        return {
          domain,
          tld: domain.split(".").slice(1).join("."),
          available: false,
          wholesalePrice: 0,
          price: 0,
          period: 1,
          currency: "USD",
        };
      }
    })
  );

  // Strip wholesale price before returning — never expose our cost
  const sanitised = results.map(({ wholesalePrice: _w, ...rest }) => rest);

  return NextResponse.json({ results: sanitised, query: cleanQuery });
}
