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
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  const customerId = (row as { stripe_customer_id?: string } | null)?.stripe_customer_id ?? null;
  if (!customerId) {
    return new Response(JSON.stringify({ error: "no_payment_method", fallback: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Resolve saved payment method: default_payment_method or first in list
  const cuRes = await fetch(`https://api.stripe.com/v1/customers/${customerId}?expand[]=invoice_settings.default_payment_method`, {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  if (!cuRes.ok) {
    const errText = await cuRes.text();
    console.error("Stripe customers retrieve error", cuRes.status, errText);
    return new Response(JSON.stringify({ error: "no_payment_method", fallback: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const customer = (await cuRes.json()) as {
    invoice_settings?: { default_payment_method?: string | { id: string } };
  };
  let pmId: string | null = null;
  const dpm = customer.invoice_settings?.default_payment_method;
  if (typeof dpm === "string") pmId = dpm;
  else if (dpm && typeof dpm === "object" && dpm.id) pmId = dpm.id;

  if (!pmId) {
    const pmListRes = await fetch(`https://api.stripe.com/v1/payment_methods?customer=${customerId}&type=card`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    if (pmListRes.ok) {
      const pmList = (await pmListRes.json()) as { data?: Array<{ id: string }> };
      pmId = pmList.data?.[0]?.id ?? null;
    }
  }

  if (!pmId) {
    return new Response(JSON.stringify({ error: "no_payment_method", fallback: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const stripe = (payload: Record<string, string>) =>
    new URLSearchParams(Object.entries(payload).filter(([, v]) => v != null) as [string, string][]).toString();

  if (conf.mode === "payment") {
    // One-time: fetch Price for unit_amount, create PaymentIntent, confirm
    const priceRes = await fetch(`https://api.stripe.com/v1/prices/${priceId}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    if (!priceRes.ok) {
      console.error("Stripe prices retrieve error", priceRes.status, await priceRes.text());
      return new Response(JSON.stringify({ error: "no_payment_method", fallback: true }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const price = (await priceRes.json()) as { unit_amount?: number; currency?: string };
    const amount = price.unit_amount ?? 1500;
    const currency = (price.currency as string) || "usd";

    const piForm = stripe({
      amount: String(amount),
      currency,
      customer: customerId,
      "payment_method": pmId,
      off_session: "true",
      confirm: "true",
      "metadata[user_id]": user.id,
      "metadata[credits]": String(conf.credits ?? 0),
    });

    const piRes = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: piForm,
    });
    const piText = await piRes.text();
    if (!piRes.ok) {
      console.error("Stripe payment_intents create error", piRes.status, piText);
      return new Response(JSON.stringify({ error: "no_payment_method", fallback: true }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const pi = JSON.parse(piText) as { status?: string; client_secret?: string; last_payment_error?: { message?: string } };
    if (pi.status === "succeeded") {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (pi.status === "requires_action" && pi.client_secret) {
      return new Response(JSON.stringify({ requires_action: true, client_secret: pi.client_secret }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    // e.g. requires_payment_method, or other failure
    console.error("Stripe payment_intent unexpected status", pi.status, pi.last_payment_error);
    return new Response(JSON.stringify({ error: "no_payment_method", fallback: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Subscription: create with default_payment_method, payment_behavior=default_incomplete, expand latest_invoice.payment_intent
  const subForm = stripe({
    customer: customerId,
    "items[0][price]": priceId,
    "default_payment_method": pmId,
    payment_behavior: "default_incomplete",
    "expand[]": "latest_invoice.payment_intent",
    "metadata[user_id]": user.id,
    "metadata[tier]": product,
  });

  const subRes = await fetch("https://api.stripe.com/v1/subscriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: subForm,
  });
  const subText = await subRes.text();
  if (!subRes.ok) {
    console.error("Stripe subscriptions create error", subRes.status, subText);
    return new Response(JSON.stringify({ error: "no_payment_method", fallback: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const sub = JSON.parse(subText) as {
    status?: string;
    latest_invoice?: { payment_intent?: { status?: string; client_secret?: string } } | string;
  };
  if (sub.status === "active" || sub.status === "trialing") {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const li = sub.latest_invoice;
  const pi = typeof li === "object" && li?.payment_intent && typeof li.payment_intent === "object"
    ? li.payment_intent
    : null;
  if (pi?.status === "requires_action" && pi.client_secret) {
    return new Response(JSON.stringify({ requires_action: true, client_secret: pi.client_secret }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  console.error("Stripe subscription unexpected status", sub.status, "pi:", pi?.status);
  return new Response(JSON.stringify({ error: "no_payment_method", fallback: true }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
