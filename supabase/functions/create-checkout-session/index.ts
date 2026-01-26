import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };

type Product = "open_mic" | "artist" | "label" | "industry" | "demo";

const PRODUCTS: Record<
  Product,
  { priceIdEnv: string; mode: "payment" | "subscription"; credits?: number }
> = {
  open_mic: { priceIdEnv: "STRIPE_PRICE_OPEN_MIC", mode: "payment", credits: 40 },
  artist: { priceIdEnv: "STRIPE_PRICE_ARTIST", mode: "subscription", credits: 80 },
  label: { priceIdEnv: "STRIPE_PRICE_LABEL", mode: "subscription", credits: 330 },
  industry: { priceIdEnv: "STRIPE_PRICE_INDUSTRY", mode: "subscription", credits: 1000 },
  demo: { priceIdEnv: "STRIPE_PRICE_DEMO", mode: "subscription", credits: 20 },
};

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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Sign in to continue" }), {
      status: 401,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice(7);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseService = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const siteUrl = Deno.env.get("SITE_URL") || "https://vannilli.xaino.io";

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

  let body: { product?: Product };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const product = body.product as Product | undefined;
  if (!product || !PRODUCTS[product]) {
    return new Response(JSON.stringify({ error: "Invalid product" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const conf = PRODUCTS[product];
  const priceId = Deno.env.get(conf.priceIdEnv);
  if (!priceId) {
    return new Response(JSON.stringify({ error: "Product not configured" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseService);
  const { data: row } = await supabase
    .from("users")
    .select("stripe_customer_id, email")
    .eq("id", user.id)
    .single();

  const customerId = (row as { stripe_customer_id?: string } | null)?.stripe_customer_id ?? null;
  const email = (row as { email?: string } | null)?.email ?? user.email ?? "";

  const successUrl = `${siteUrl}/studio?checkout=success`;
  const cancelUrl = `${siteUrl}/pricing?checkout=cancel`;

  const form = new URLSearchParams();
  form.set("mode", conf.mode);
  form.set("success_url", successUrl);
  form.set("cancel_url", cancelUrl);
  form.set("client_reference_id", user.id);
  form.set("line_items[0][price]", priceId);
  form.set("line_items[0][quantity]", "1");

  if (customerId) {
    form.set("customer", customerId);
  } else if (email) {
    form.set("customer_email", email);
  }

  if (conf.mode === "payment" && conf.credits != null) {
    form.set("payment_intent_data[metadata][user_id]", user.id);
    form.set("payment_intent_data[metadata][credits]", String(conf.credits));
  }

  if (conf.mode === "subscription") {
    form.set("subscription_data[metadata][user_id]", user.id);
    form.set("subscription_data[metadata][tier]", product);
  }

  const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const text = await r.text();
  if (!r.ok) {
    console.error("Stripe checkout/sessions error", r.status, text);
    return new Response(JSON.stringify({ error: "Could not create checkout session" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const ses = JSON.parse(text) as { url?: string };
  return new Response(JSON.stringify({ url: ses.url }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
