import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch domain (RLS ensures ownership)
  const { data: domainRecord } = await supabase
    .from("custom_domains")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!domainRecord) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  // Remove from Vercel if it was active
  if (domainRecord.status === "active") {
    const token = process.env.VERCEL_TOKEN;
    const projectId = process.env.VERCEL_PROJECT_ID;

    if (token && projectId) {
      try {
        await fetch(
          `https://api.vercel.com/v9/projects/${projectId}/domains/${domainRecord.domain}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      } catch (err) {
        // Non-fatal — log but continue with DB delete
        console.error("[domains/delete] Vercel domain removal failed:", err);
      }
    }
  }

  // Delete from database
  const { error } = await supabase
    .from("custom_domains")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
