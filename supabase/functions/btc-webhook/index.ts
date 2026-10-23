import { admin, btcpay, PERIOD_DAYS, PLANS } from "../_shared/btc.ts";

const SECRET = Deno.env.get("BTCPAY_WEBHOOK_SECRET")!;
const enc = new TextEncoder();

async function validSignature(raw: string, header: string | null) {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(raw)));
  const given = header.slice(7);
  if (!/^[0-9a-f]{64}$/i.test(given)) return false;
  const got = Uint8Array.from(given.match(/../g)!.map((h) => parseInt(h, 16)));
  let diff = 0; // constant-time compare
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ got[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  const raw = await req.text();
  if (!(await validSignature(raw, req.headers.get("btcpay-sig")))) return new Response("Invalid signature", { status: 400 });

  const event = JSON.parse(raw);
  if (event.type !== "InvoiceSettled" || !event.invoiceId) return new Response("ok");

  // Re-fetch from BTCPay instead of trusting the payload.
  const res = await btcpay(`/invoices/${encodeURIComponent(event.invoiceId)}`);
  if (!res.ok) return new Response("Retry", { status: 502 });
  const invoice = await res.json();

  const { userId, plan } = invoice.metadata ?? {};
  const def = PLANS[plan];
  if (invoice.status !== "Settled" || !userId || !def || Number(invoice.amount) < Number(def.price) || invoice.currency !== "USD") {
    return new Response("ok");
  }

  // Idempotency: each invoice grants time once.
  const { error: dupe } = await admin.from("btc_invoices").insert({ id: invoice.id, user_id: userId, plan });
  if (dupe) return new Response("ok");

  const { data: sub } = await admin.from("btc_subscriptions").select("plan, expires_at").eq("user_id", userId).maybeSingle();
  const now = Date.now();
  const stillActive = sub && new Date(sub.expires_at).getTime() > now && sub.plan === plan;
  const start = stillActive ? new Date(sub.expires_at).getTime() : now; // renewals stack
  const expires_at = new Date(start + PERIOD_DAYS * 86400_000).toISOString();

  await admin.from("btc_subscriptions").upsert({ user_id: userId, plan, expires_at });
  await admin.from("profiles").update({ tier: plan }).eq("id", userId);
  return new Response("ok");
});
