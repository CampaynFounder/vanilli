import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };

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

  let body: { setup_intent_id?: string } = {};
  try {
    const b = await req.json().catch(() => ({}));
    body = b && typeof b === "object" ? b : {};
  } catch { /* ignore */ }

  const setupIntentId = typeof body.setup_intent_id === "string" ? body.setup_intent_id.trim() : null;
  if (!setupIntentId || !setupIntentId.startsWith("seti_")) {
    return new Response(JSON.stringify({ error: "Missing or invalid setup_intent_id" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

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

  const uid = user.id;

  // 1) Retrieve SetupIntent
  const siRes = await fetch(`https://api.stripe.com/v1/setup_intents/${setupIntentId}`, {
    headers: { "Authorization": `Bearer ${stripeKey}` },
  });
  if (!siRes.ok) {
    const t = await siRes.text();
    console.error("register-user: setupIntents.retrieve failed", siRes.status, t);
    return new Response(JSON.stringify({ error: "Invalid setup intent" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const si = (await siRes.json()) as {
    id?: string;
    status?: string;
    payment_method?: string;
    customer?: string | { id?: string };
    metadata?: { user_id?: string };
  };

  if (si.metadata?.user_id && si.metadata.user_id !== uid) {
    return new Response(JSON.stringify({ error: "Setup intent does not belong to this user" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (si.status !== "succeeded") {
    return new Response(JSON.stringify({ error: "Setup intent not succeeded" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const pmId = typeof si.payment_method === "string" ? si.payment_method : null;
  if (!pmId) {
    return new Response(JSON.stringify({ error: "No payment method on setup intent" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // 2) Retrieve PaymentMethod
  const pmRes = await fetch(`https://api.stripe.com/v1/payment_methods/${pmId}`, {
    headers: { "Authorization": `Bearer ${stripeKey}` },
  });
  if (!pmRes.ok) {
    console.error("register-user: paymentMethods.retrieve failed", pmRes.status);
    return new Response(JSON.stringify({ error: "Could not load payment method" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  const pm = (await pmRes.json()) as {
    id?: string;
    type?: string;
    card?: { fingerprint?: string; last4?: string; brand?: string };
    us_bank_account?: { last4?: string };
    cashapp?: Record<string, unknown>;
  };

  const fingerprint = pm?.card?.fingerprint ?? null;
  let last4 = pm?.card?.last4 ?? pm?.us_bank_account?.last4 ?? null;
  let brand = pm?.card?.brand ?? null;

  if (!brand && pm?.type) {
    if (pm.type === "card" && pm?.card?.brand) brand = pm.card.brand;
    else if (pm.type === "us_bank_account") brand = "Bank";
    else if (pm.type === "cashapp") brand = "Cash App";
    else brand = pm.type;
  }
  if (!last4 && (pm?.type === "cashapp" || pm?.type === "us_bank_account")) last4 = "";

  const pmType = pm?.type ?? "card";
  const identifier = fingerprint ?? pmId;

  const supabase = createClient(supabaseUrl, supabaseService);

  // 3) Check if user had any billing_profiles before (for first-link free credit)
  const { count: priorCount } = await supabase
    .from("billing_profiles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", uid);

  const isFirstLink = (priorCount ?? 0) === 0;

  // 4) Upsert billing_profiles
  const { error: upsertErr } = await supabase.from("billing_profiles").upsert(
    {
      user_id: uid,
      stripe_payment_method_id: pmId,
      card_fingerprint: fingerprint,
      card_last4: last4 || null,
      card_brand: brand || null,
      payment_method_type: pmType,
      has_valid_card: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,stripe_payment_method_id" }
  );

  if (upsertErr) {
    console.error("register-user: billing_profiles upsert failed", upsertErr);
    return new Response(JSON.stringify({ error: "Could not save payment method" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // 5) Update users: has_valid_card, payment_method_last4, payment_method_brand
  const userUp: Record<string, string | boolean> = { has_valid_card: true };
  if (last4 != null) userUp.payment_method_last4 = last4;
  if (brand != null) userUp.payment_method_brand = brand;

  await supabase.from("users").update(userUp).eq("id", uid);

  // 6) Set Stripe customer default payment method
  const custId = typeof si.customer === "string" ? si.customer : (si.customer as { id?: string })?.id;
  if (custId && pmId) {
    await fetch(`https://api.stripe.com/v1/customers/${custId}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: `invoice_settings[default_payment_method]=${encodeURIComponent(pmId)}`,
    });
  }

  // 7) Grant 3 credits on first link (via grant_free_credits_for_payment_method; dedupes by fingerprint)
  if (isFirstLink) {
    const { data: grantResult, error: rpcErr } = await supabase.rpc("grant_free_credits_for_payment_method", {
      p_user_id: uid,
      p_credits: 3,
      p_payment_method_identifier: identifier,
      p_stripe_pm_id: pmId,
    });
    if (rpcErr) {
      console.error("register-user: grant_free_credits_for_payment_method error", rpcErr);
      // Don't fail the request; has_valid_card is set, user can use the site. They just don't get the credits.
    }
    // grantResult === 'already_used' means this payment method was used by another account for free credits; no credit, but has_valid_card is already set.
  }

  const { data: u } = await supabase.from("users").select("credits_remaining").eq("id", uid).single();
  const creditsRemaining = (u as { credits_remaining?: number } | null)?.credits_remaining ?? 0;

  return new Response(JSON.stringify({ ok: true, has_valid_card: true, credits_remaining: creditsRemaining }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
