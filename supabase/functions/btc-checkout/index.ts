import { btcpay, corsHeaders, getUser, json, PLANS, safeReturnUrl } from "../_shared/btc.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const user = await getUser(req);
  if (!user) return json(req, { error: "Sign in required" }, 401);

  const { plan, returnUrl } = await req.json().catch(() => ({}));
  const def = PLANS[plan as string];
  if (!def) return json(req, { error: "Invalid plan" }, 400);

  const res = await btcpay("/invoices", {
    method: "POST",
    body: JSON.stringify({
      amount: def.price,
      currency: "USD",
      metadata: { userId: user.id, plan, orderId: `${user.id}:${plan}:${Date.now()}` },
      checkout: { redirectURL: safeReturnUrl(returnUrl), expirationMinutes: 60 },
    }),
  });
  if (!res.ok) return json(req, { error: "Could not start checkout" }, 502);

  const invoice = await res.json();
  return json(req, { url: invoice.checkoutLink });
});
