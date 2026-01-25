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
  let { data: row, error: rowErr } = await supabase
    .from("users")
    .select("id, email, stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (rowErr || !row) {
    const preferredEmail = (user.email && String(user.email).trim()) || `${user.id}@auth.local`;
    await supabase.from("users").insert({
      id: user.id,
      email: preferredEmail,
      password_hash: "",
    }).then(() => {});

    const res = await supabase.from("users").select("id, email, stripe_customer_id").eq("id", user.id).maybeSingle();
    if (res.error || !res.data) {
      return new Response(JSON.stringify({ error: "User record not found" }), {
        status: 404,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    row = res.data;
  }

  let customerId = row.stripe_customer_id as string | null;
  const authEmail = (user.email && String(user.email).trim()) || "";

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
    await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: authEmail }).toString(),
    });
  }

  if (!customerId) {
    return new Response(JSON.stringify({ error: "Could not create payment profile" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Create SetupIntent via Stripe API: usage=off_session, automatic_payment_methods (card, Cash App, etc.)
  const body = new URLSearchParams();
  body.set("customer", customerId);
  body.set("usage", "off_session");
  body.set("automatic_payment_methods[enabled]", "true");
  body.set("metadata[user_id]", user.id);

  const siRes = await fetch("https://api.stripe.com/v1/setup_intents", {
    method: "POST",
    headers: { "Authorization": `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!siRes.ok) {
    const t = await siRes.text();
    console.error("Stripe setup_intents create failed", siRes.status, t);
    try {
      const j = JSON.parse(t) as { error?: { message?: string } };
      const msg = j?.error?.message;
      return new Response(JSON.stringify({ error: msg || "Could not create setup" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ error: "Could not create setup" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  }

  const si = (await siRes.json()) as { client_secret?: string };
  if (!si.client_secret) {
    return new Response(JSON.stringify({ error: "No client secret from Stripe" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ clientSecret: si.client_secret }), {
    status: 200,
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
