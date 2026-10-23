const BTCPAY_URL = Deno.env.get("BTCPAY_URL")!; // e.g. https://pay.example.com
const STORE_ID = Deno.env.get("BTCPAY_STORE_ID")!;
const API_KEY = Deno.env.get("BTCPAY_API_KEY")!; // needs only "create invoice" + "view invoice" on this store

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Service-role client: bypasses RLS. Server-side only.
export const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Prices are fixed server-side in USD; the client only sends a plan name.
export const PLANS: Record<string, { price: string }> = {
  basic: { price: "5" },
  gold: { price: "10" },
};
export const PERIOD_DAYS = 30;

const ALLOWED_ORIGINS = ["https://opieferd.dev", "https://www.opieferd.dev"];

export const corsHeaders = (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
};

export const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });

export async function getUser(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

// Only ever redirect back to our own origins.
export const safeReturnUrl = (value: unknown) => {
  try {
    const url = new URL(String(value));
    if (url.protocol === "https:" && ALLOWED_ORIGINS.includes(url.origin)) return url.href;
  } catch { /* fall through */ }
  return "https://opieferd.dev/watch/";
};

export const btcpay = (path: string, init: RequestInit = {}) =>
  fetch(`${BTCPAY_URL}/api/v1/stores/${STORE_ID}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `token ${API_KEY}`, "Content-Type": "application/json" },
  });
