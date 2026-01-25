import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };

function stripeErr(text: string): string | undefined {
  try {
    const j = JSON.parse(text) as { error?: { message?: string } };
    return typeof j?.error?.message === "string" ? j.error.message : undefined;
  } catch { return undefined; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: { updateOnly?: boolean } = {};
  try {
    const b = await req.json().catch(() => ({}));
    body = b && typeof b === "object" ? b : {};
  } catch { /* ignore */ }
  const updateOnly = body?.updateOnly === true;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing or invalid Authorization" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice(7);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");

  if (!supabaseUrl || !supabaseAnon || !supabaseService || !stripeKey) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnon);
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token);
  if (authErr || !user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseService);
  let { data: row, error: rowErr } = await supabase
    .from("users")
    .select("id, email, free_generation_redeemed, stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  // If no public.users row exists, create one (Supabase Auth user exists but public.users wasn't synced)
  if (rowErr || !row) {
    const preferredEmail = (user.email && String(user.email).trim()) || `${user.id}@auth.local`;
    const fallbackEmail = `${user.id}@auth.local`; // unique per user, avoids email UNIQUE conflict

    let { error: insErr } = await supabase.from("users").insert({
      id: user.id,
      email: preferredEmail,
      password_hash: "",
    });

    if (insErr) {
      console.error("claim-free-credits-setup: insert public.users failed", insErr);
      if (preferredEmail !== fallbackEmail) {
        const retry = await supabase.from("users").insert({
          id: user.id,
          email: fallbackEmail,
          password_hash: "",
        });
        if (retry.error) console.error("claim-free-credits-setup: retry insert failed", retry.error);
      }
    }

    const res = await supabase.from("users").select("id, email, free_generation_redeemed, stripe_customer_id").eq("id", user.id).maybeSingle();
    if (res.error || !res.data) {
      return new Response(JSON.stringify({ error: "User record not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    row = res.data;
  }

  if (updateOnly) {
    if (!row.stripe_customer_id) {
      return new Response(JSON.stringify({ error: "No payment method to update" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const origin = req.headers.get("Origin") || req.headers.get("Referer") || Deno.env.get("APP_URL") || "";
    let base = "https://vannilli.xaino.io";
    try { if (origin) base = new URL(origin).origin; } catch { /* use default */ }
    const csBody = new URLSearchParams();
    csBody.set("mode", "setup");
    csBody.set("customer", String(row.stripe_customer_id));
    csBody.set("currency", Deno.env.get("STRIPE_CURRENCY") || "usd");
    csBody.set("success_url", `${base}/profile?setup=success`);
    csBody.set("cancel_url", `${base}/profile?setup=cancel`);
    csBody.set("metadata[user_id]", user.id);
    csBody.set("metadata[update_payment_method]", "true");
    const csRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: csBody.toString(),
    });
    if (!csRes.ok) {
      const t = await csRes.text();
      console.error("Stripe create Checkout Session (update PM) failed", csRes.status, t);
      const msg = stripeErr(t);
      return new Response(JSON.stringify({ error: "Could not start checkout", details: msg }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const cs = (await csRes.json()) as { url?: string };
    return new Response(JSON.stringify({ url: cs.url }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (row.free_generation_redeemed) {
    return new Response(JSON.stringify({ error: "Free credits already claimed" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const authEmail = (user.email && String(user.email).trim()) || "";

  let customerId = row.stripe_customer_id as string | null;
  if (!customerId) {
    const form = new URLSearchParams();
    form.set("email", authEmail);
    const cr = await fetch("https://api.stripe.com/v1/customers", {
      method: "POST",
      headers: { "Authorization": `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!cr.ok) {
      const t = await cr.text();
      console.error("Stripe create customer failed", cr.status, t);
      return new Response(JSON.stringify({ error: "Could not create payment profile" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const cust = (await cr.json()) as { id?: string };
    customerId = cust.id ?? null;
    if (customerId) {
      await supabase.from("users").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }
  } else if (authEmail) {
    const up = new URLSearchParams();
    up.set("email", authEmail);
    await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: up.toString(),
    });
  }

  if (!customerId) {
    return new Response(JSON.stringify({ error: "Could not create payment profile" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const origin = req.headers.get("Origin") || req.headers.get("Referer") || Deno.env.get("APP_URL") || "";
  let base = "https://vannilli.xaino.io";
  try {
    if (origin) base = new URL(origin).origin;
  } catch { /* use default */ }

  const csBody = new URLSearchParams();
  csBody.set("mode", "setup");
  csBody.set("customer", customerId);
  csBody.set("currency", Deno.env.get("STRIPE_CURRENCY") || "usd");
  csBody.set("success_url", `${base}/profile?setup=success`);
  csBody.set("cancel_url", `${base}/profile?setup=cancel`);
  csBody.set("metadata[user_id]", user.id);
  csBody.set("metadata[free_credits]", "3");

  const csRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: csBody.toString(),
  });

  if (!csRes.ok) {
    const t = await csRes.text();
    console.error("Stripe create Checkout Session failed", csRes.status, t);
    const msg = stripeErr(t);
    return new Response(JSON.stringify({ error: "Could not start checkout", details: msg }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const cs = (await csRes.json()) as { url?: string };
  return new Response(JSON.stringify({ url: cs.url }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
