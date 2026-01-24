import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function parseStripeSignature(header: string): { t: string; v1: string } | null {
  const parts: Record<string, string> = {};
  for (const p of header.split(",")) {
    const [k, v] = p.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const t = parts["t"];
  const v1 = parts["v1"];
  return t && v1 ? { t, v1 } : null;
}

async function verifyStripeSignature(
  payload: string,
  sig: { t: string; v1: string },
  secret: string
): Promise<boolean> {
  const signed = `${sig.t}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const buf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signed)
  );
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex === sig.v1;
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const sigHeader = req.headers.get("stripe-signature");
  if (!secret || !sigHeader) {
    return new Response(JSON.stringify({ error: "Missing webhook secret or signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.text();
  const parsed = parseStripeSignature(sigHeader);
  if (!parsed || !(await verifyStripeSignature(body, parsed, secret))) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const obj = event.data?.object as Record<string, unknown> | undefined;
  if (!obj) {
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = obj as { id?: string; metadata?: Record<string, string> };
        const uid = pi.metadata?.user_id;
        const creds = pi.metadata?.credits ? parseInt(pi.metadata.credits, 10) : 0;
        if (uid && creds > 0) {
          const { error } = await supabase.rpc("add_credits", {
            p_user_id: uid,
            p_credits: creds,
          });
          if (error) {
            await supabase.from("audit_log").insert({
              user_id: uid,
              action: "stripe_webhook_error",
              resource_type: "payment_intent",
              resource_id: null,
              metadata: { error: error.message, event_id: event.id, type: event.type },
            });
          } else {
            await supabase.from("audit_log").insert({
              user_id: uid,
              action: "credit_purchase",
              resource_type: "payment_intent",
              resource_id: null,
              metadata: { stripe_pi: pi.id, credits: creds, event_id: event.id },
            });
          }
        }
        break;
      }

      case "invoice.paid": {
        const inv = obj as {
          subscription?: string;
          customer?: string;
          lines?: { data?: Array<{ period?: { start?: number; end?: number } }> };
        };
        const subId = inv.subscription;
        if (!subId) break;
        const period = inv.lines?.data?.[0]?.period;
        const start = period?.start ? new Date(period.start * 1000).toISOString() : null;
        const end = period?.end ? new Date(period.end * 1000).toISOString() : null;

        const { data: existing } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("stripe_subscription_id", subId)
          .single();

        if (existing && start && end) {
          await supabase
            .from("subscriptions")
            .update({ current_period_start: start, current_period_end: end, status: "active" })
            .eq("stripe_subscription_id", subId);
        } else if (!existing && inv.customer && start && end) {
          const { data: u } = await supabase
            .from("users")
            .select("id")
            .eq("stripe_customer_id", inv.customer)
            .single();
          if (u?.id) {
            await supabase.from("subscriptions").insert({
              user_id: u.id,
              stripe_subscription_id: subId,
              tier: "open_mic",
              status: "active",
              current_period_start: start,
              current_period_end: end,
            });
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = obj as {
          id: string;
          status: string;
          customer?: string;
          current_period_start?: number;
          current_period_end?: number;
          cancel_at_period_end?: boolean;
        };
        const statusMap: Record<string, string> = {
          active: "active",
          trialing: "active",
          past_due: "past_due",
          unpaid: "past_due",
          canceled: "canceled",
          paused: "paused",
          incomplete: "past_due",
          incomplete_expired: "past_due",
        };
        const status = statusMap[sub.status] ?? "past_due";
        const start = sub.current_period_start
          ? new Date(sub.current_period_start * 1000).toISOString()
          : undefined;
        const end = sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : undefined;

        const { data: existing } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("stripe_subscription_id", sub.id)
          .single();

        if (existing) {
          await supabase
            .from("subscriptions")
            .update({
              status,
              ...(start && { current_period_start: start }),
              ...(end && { current_period_end: end }),
              cancel_at_period_end: sub.cancel_at_period_end ?? false,
            })
            .eq("stripe_subscription_id", sub.id);
        } else if (sub.customer && start && end) {
          const { data: u } = await supabase
            .from("users")
            .select("id")
            .eq("stripe_customer_id", sub.customer)
            .single();
          if (u?.id) {
            await supabase.from("subscriptions").insert({
              user_id: u.id,
              stripe_subscription_id: sub.id,
              tier: "open_mic",
              status,
              current_period_start: start,
              current_period_end: end,
              cancel_at_period_end: sub.cancel_at_period_end ?? false,
            });
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = obj as { id: string };
        await supabase
          .from("subscriptions")
          .update({ status: "canceled" })
          .eq("stripe_subscription_id", sub.id);
        break;
      }

      case "invoice.payment_failed": {
        const inv = obj as { subscription?: string };
        if (inv.subscription) {
          await supabase
            .from("subscriptions")
            .update({ status: "past_due" })
            .eq("stripe_subscription_id", inv.subscription);
        }
        break;
      }

      case "setup_intent.succeeded": {
        const si = obj as { payment_method?: string; metadata?: Record<string, string> };
        const uid = si.metadata?.user_id;
        const freeCredits = si.metadata?.free_credits;
        const pmId = typeof si.payment_method === "string" ? si.payment_method : null;
        if (!uid || !freeCredits || !pmId) break;

        const sk = Deno.env.get("STRIPE_SECRET_KEY");
        if (!sk) {
          console.error("stripe-webhook setup_intent.succeeded: STRIPE_SECRET_KEY not set");
          break;
        }
        const pmRes = await fetch(`https://api.stripe.com/v1/payment_methods/${pmId}`, {
          headers: { Authorization: `Bearer ${sk}` },
        });
        if (!pmRes.ok) {
          console.error("stripe-webhook setup_intent.succeeded: failed to fetch PaymentMethod", pmRes.status);
          break;
        }
        const pm = (await pmRes.json()) as { card?: { fingerprint?: string }; id?: string };
        const fingerprint = pm?.card?.fingerprint;
        const identifier = fingerprint ?? pmId;

        const credits = parseInt(freeCredits, 10) || 1;
        const { data: result, error: rpcErr } = await supabase.rpc("grant_free_credits_for_payment_method", {
          p_user_id: uid,
          p_credits: credits,
          p_payment_method_identifier: identifier,
          p_stripe_pm_id: pmId,
        });
        if (rpcErr) {
          await supabase.from("audit_log").insert({
            user_id: uid,
            action: "stripe_webhook_error",
            resource_type: "setup_intent",
            resource_id: null,
            metadata: { error: rpcErr.message, event_id: event.id, type: event.type },
          });
          break;
        }
        if (result === "already_used") {
          await supabase.from("audit_log").insert({
            user_id: uid,
            action: "free_credits_rejected_duplicate_pm",
            resource_type: "setup_intent",
            resource_id: null,
            metadata: { payment_method_identifier: identifier, event_id: event.id },
          });
        } else {
          await supabase.from("audit_log").insert({
            user_id: uid,
            action: "free_credits_granted",
            resource_type: "setup_intent",
            resource_id: null,
            metadata: { credits, payment_method_identifier: identifier, event_id: event.id },
          });
        }
        break;
      }

      default:
        break;
    }
  } catch (e) {
    console.error("stripe-webhook", event.type, e);
    return new Response(
      JSON.stringify({ error: "Handler error", message: String(e) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
