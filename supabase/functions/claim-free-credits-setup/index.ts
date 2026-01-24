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
  const { data: row, error: rowErr } = await supabase
    .from("users")
    .select("id, email, free_generation_redeemed, stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (rowErr || !row) {
    return new Response(JSON.stringify({ error: "User record not found" }), {
      status: 404,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (row.free_generation_redeemed) {
    return new Response(JSON.stringify({ error: "Free credits already claimed" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let customerId = row.stripe_customer_id as string | null;
  if (!customerId) {
    const form = new URLSearchParams();
    form.set("email", row.email ?? "");
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
  }

  if (!customerId) {
    return new Response(JSON.stringify({ error: "Could not create payment profile" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const body = new URLSearchParams();
  body.set("customer", customerId);
  body.set("payment_method_types[]", "card");
  body.set("usage", "off_session");
  body.set("metadata[user_id]", user.id);
  body.set("metadata[free_credits]", "3");

  const siRes = await fetch("https://api.stripe.com/v1/setup_intents", {
    method: "POST",
    headers: { "Authorization": `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!siRes.ok) {
    const t = await siRes.text();
    console.error("Stripe create SetupIntent failed", siRes.status, t);
    return new Response(JSON.stringify({ error: "Could not start setup" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const si = (await siRes.json()) as { client_secret?: string };
  return new Response(JSON.stringify({ clientSecret: si.client_secret }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
