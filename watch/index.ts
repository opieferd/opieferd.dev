// Supabase Edge Function: receives Ko-fi webhooks and syncs supporter tiers.
// Secrets needed: KOFI_VERIFICATION_TOKEN  (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically)
// Deploy with JWT verification OFF (Ko-fi can't send a Supabase JWT):
//   supabase functions deploy kofi-webhook --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const TOKEN = Deno.env.get("KOFI_VERIFICATION_TOKEN") ?? "";

// constant-time string compare
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Ko-fi posts a form field named "data" that holds the JSON; accept raw JSON too.
  let payload: Record<string, unknown>;
  try {
    const type = req.headers.get("content-type") ?? "";
    const raw = type.includes("application/x-www-form-urlencoded")
      ? String((await req.formData()).get("data") ?? "")
      : await req.text();
    payload = JSON.parse(raw);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  if (!TOKEN || !same(String(payload.verification_token ?? ""), TOKEN)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data, error } = await supabase.rpc("kofi_apply", {
    p_message_id: String(payload.message_id ?? ""),
    p_type: String(payload.type ?? ""),
    p_email: String(payload.email ?? ""),
    p_name: String(payload.from_name ?? ""),
    p_message: String(payload.message ?? ""),
    p_amount: Number(payload.amount) || 0,
    p_currency: String(payload.currency ?? ""),
    p_is_sub: payload.is_subscription_payment === true,
    p_tier_name: payload.tier_name == null ? "" : String(payload.tier_name),
  });

  if (error) {
    console.error("kofi_apply failed", error);
    return new Response("Server error", { status: 500 });
  }
  console.log("kofi_apply:", data);
  return new Response("ok", { status: 200 });
});
