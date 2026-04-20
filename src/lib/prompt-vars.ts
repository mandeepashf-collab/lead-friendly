/**
 * Substitute {{contact.first_name}}, {{business_name}}, etc. in an agent's
 * system prompt / greeting before it's shipped to the worker.
 *
 * Fallbacks are deliberately conversational so that WebRTC test calls with
 * no contact attached still sound human instead of literally speaking
 * template syntax ("Hi, is this {{contact.first_name}}?").
 */

export interface PromptVarContext {
  contact?: {
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    email?: string | null;
    lender_name?: string | null;
    state?: string | null;
    city?: string | null;
  } | null;
  business?: {
    name?: string | null;
  } | null;
}

export function substituteVariables(text: string, ctx: PromptVarContext): string {
  if (!text) return text;
  const c = ctx.contact ?? {};
  const b = ctx.business ?? {};
  return text
    .replace(/\{\{\s*contact\.first_name\s*\}\}/g, c.first_name || "there")
    .replace(/\{\{\s*contact\.last_name\s*\}\}/g, c.last_name || "")
    .replace(/\{\{\s*contact\.phone\s*\}\}/g, c.phone || "")
    .replace(/\{\{\s*contact\.email\s*\}\}/g, c.email || "")
    .replace(/\{\{\s*contact\.lender_name\s*\}\}/g, c.lender_name || "your lender")
    .replace(/\{\{\s*contact\.state\s*\}\}/g, c.state || "")
    .replace(/\{\{\s*contact\.city\s*\}\}/g, c.city || "")
    .replace(/\{\{\s*business_name\s*\}\}/g, b.name || "our team")
    .replace(/\{\{\s*business\.name\s*\}\}/g, b.name || "our team");
}
