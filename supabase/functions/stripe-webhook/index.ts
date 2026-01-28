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

        // Check if this is a DEMO tier subscription for credit reset
        if (inv.customer) {
          const { data: user } = await supabase
            .from("users")
            .select("id, tier")
            .eq("stripe_customer_id", inv.customer)
            .single();
          
          if (user && user.tier === "demo") {
            // Reset DEMO tier credits to 20 (discard unused, no rollover)
            // Get current credits before reset for logging
            const { data: userBefore } = await supabase
              .from("users")
              .select("credits_remaining")
              .eq("id", user.id)
              .single();
            
            const creditsBefore = (userBefore as { credits_remaining?: number } | null)?.credits_remaining ?? 0;
            
            await supabase
              .from("users")
              .update({ credits_remaining: 20 })
              .eq("id", user.id)
              .eq("tier", "demo")
              .execute();
            
            console.log(`[stripe-webhook] Reset DEMO tier credits for user ${user.id} from ${creditsBefore} to 20`);
            
            // Log to audit_log for transaction history
            await supabase.from("audit_log").insert({
              user_id: user.id,
              action: "subscription_renewed",
              resource_type: "subscription",
              resource_id: null,
              metadata: {
                source: "subscription_renewal",
                tier: "demo",
                credits: 20,
                credits_before: creditsBefore,
                credits_after: 20,
                stripe_subscription_id: subId,
                event_id: event.id,
                note: "DEMO tier daily reset (no rollover)"
              },
            });
          }
        }
        
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
          let tier = "open_mic";
          const sk = Deno.env.get("STRIPE_SECRET_KEY");
          if (sk) {
            try {
              const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
                headers: { Authorization: `Bearer ${sk}` },
              });
              if (subRes.ok) {
                const subJson = (await subRes.json()) as { metadata?: { tier?: string } };
                if (subJson.metadata?.tier) tier = subJson.metadata.tier;
              }
            } catch (e) {
              console.error("stripe-webhook invoice.paid: fetch subscription for tier", e);
            }
          }
          if (u?.id) {
            await supabase.from("subscriptions").insert({
              user_id: u.id,
              stripe_subscription_id: subId,
              tier,
              status: "active",
              current_period_start: start,
              current_period_end: end,
            });
          }
        }

        // Grant credits for Artist (80), Label (330), and Industry (1000) on each paid invoice (first + renewals)
        // DEMO tier credits are reset above, not added here
        const SUBSCRIPTION_CREDITS: Record<string, number> = { artist: 80, label: 330, industry: 1000 };
        const { data: subRow } = await supabase
          .from("subscriptions")
          .select("user_id, tier")
          .eq("stripe_subscription_id", subId)
          .single();
        const uid = (subRow as { user_id?: string } | null)?.user_id;
        const tier = (subRow as { tier?: string } | null)?.tier;
        const creds = tier ? (SUBSCRIPTION_CREDITS[tier] ?? 0) : 0;
        if (uid && creds > 0) {
          const { error: addErr } = await supabase.rpc("add_credits", {
            p_user_id: uid,
            p_credits: creds,
          });
          if (addErr) {
            await supabase.from("audit_log").insert({
              user_id: uid,
              action: "stripe_webhook_error",
              resource_type: "invoice",
              resource_id: null,
              metadata: { error: addErr.message, event_id: event.id, type: event.type, source: "invoice.paid" },
            });
          } else {
            await supabase.from("audit_log").insert({
              user_id: uid,
              action: "credit_purchase",
              resource_type: "invoice",
              resource_id: null,
              metadata: { source: "subscription", tier, credits: creds, stripe_subscription_id: subId, event_id: event.id },
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
          metadata?: { tier?: string };
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
          const tier = sub.metadata?.tier || "open_mic";
          if (u?.id) {
            await supabase.from("subscriptions").insert({
              user_id: u.id,
              stripe_subscription_id: sub.id,
              tier,
              status,
              current_period_start: start,
              current_period_end: end,
              cancel_at_period_end: sub.cancel_at_period_end ?? false,
            });
          }
        }
        break;
      }

      case "customer.subscription.created": {
        const sub = obj as {
          id: string;
          customer?: string;
          status?: string;
          metadata?: { tier?: string; user_id?: string };
          current_period_start?: number;
          current_period_end?: number;
        };
        const subId = sub.id;
        const tier = sub.metadata?.tier;
        const uid = sub.metadata?.user_id;
        const customerId = typeof sub.customer === "string" ? sub.customer : null;
        
        console.log(`[stripe-webhook] Subscription created: id=${subId}, tier=${tier}, user_id=${uid}, customer=${customerId}`);
        
        // Find user if not in metadata
        let userId = uid;
        if (!userId && customerId) {
          const { data: userRow } = await supabase
            .from("users")
            .select("id")
            .eq("stripe_customer_id", customerId)
            .single();
          userId = userRow?.id ?? null;
        }
        
        // For DEMO tier, grant initial 20 credits immediately when subscription is created
        if (tier === "demo" && userId) {
          console.log(`[stripe-webhook] DEMO tier subscription created, granting initial 20 credits to user ${userId}`);
          
          // Update user tier to demo
          const { error: tierErr } = await supabase
            .from("users")
            .update({ tier: "demo", credits_remaining: 20 })
            .eq("id", userId)
            .execute();
          
          if (tierErr) {
            console.error(`[stripe-webhook] Failed to update DEMO tier:`, tierErr);
          } else {
            console.log(`[stripe-webhook] Updated user ${userId} to DEMO tier with 20 credits`);
            await supabase.from("audit_log").insert({
              user_id: userId,
              action: "credit_purchase",
              resource_type: "subscription",
              resource_id: null,
              metadata: { source: "subscription_created", tier: "demo", credits: 20, stripe_subscription_id: subId, event_id: event.id },
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
        const si = obj as { payment_method?: string; customer?: string | { id?: string }; metadata?: Record<string, string> };
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
        const pm = (await pmRes.json()) as { card?: { fingerprint?: string; last4?: string; brand?: string }; id?: string; object?: string };
        const fingerprint = pm?.card?.fingerprint;

        // Require card fingerprint for free-credit grants. Same physical card => same fingerprint
        // across users in our Stripe account, so we can block same-card reuse. If we fell back to
        // pmId, each new SetupIntent would create a new pm_xxx and we could not detect reuse.
        if (pm?.card && !fingerprint) {
          await supabase.from("audit_log").insert({
            user_id: uid,
            action: "free_credits_rejected_no_fingerprint",
            resource_type: "setup_intent",
            resource_id: null,
            metadata: { stripe_pm_id: pmId, last4: pm?.card?.last4, event_id: event.id },
          });
          break;
        }
        const identifier = fingerprint ?? pmId;
        const last4 = pm?.card?.last4;

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
            metadata: { payment_method_identifier: identifier, last4, event_id: event.id },
          });
        } else {
          await supabase.from("audit_log").insert({
            user_id: uid,
            action: "free_credits_granted",
            resource_type: "setup_intent",
            resource_id: null,
            metadata: { credits, payment_method_identifier: identifier, last4, event_id: event.id },
          });
        }
        // Set the newly attached PM as default so one-tap uses it.
        const custId = typeof si.customer === "string" ? si.customer : (si.customer as { id?: string })?.id;
        if (sk && custId && pmId) {
          await fetch(`https://api.stripe.com/v1/customers/${custId}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${sk}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: `invoice_settings[default_payment_method]=${encodeURIComponent(pmId)}`,
          });
        }
        const up: Record<string, string> = {};
        if (pm?.card?.last4) up.payment_method_last4 = pm.card.last4;
        if (pm?.card?.brand) up.payment_method_brand = pm.card.brand;
        if (Object.keys(up).length) await supabase.from("users").update(up).eq("id", uid);
        break;
      }

      case "checkout.session.completed": {
        const sess = obj as {
          mode?: string;
          customer?: string;
          client_reference_id?: string;
          metadata?: Record<string, string>;
          setup_intent?: string;
          payment_intent?: string;
        };
        const sk = Deno.env.get("STRIPE_SECRET_KEY");
        const updatePmDisplay = async (uid: string, pmId: string) => {
          if (!sk || !pmId) return;
          const res = await fetch(`https://api.stripe.com/v1/payment_methods/${pmId}`, { headers: { Authorization: `Bearer ${sk}` } });
          if (!res.ok) return;
          const pm = (await res.json()) as { card?: { last4?: string; brand?: string } };
          const last4 = pm?.card?.last4;
          const brand = pm?.card?.brand;
          if (last4 || brand) {
            await supabase.from("users").update({
              ...(last4 && { payment_method_last4: last4 }),
              ...(brand && { payment_method_brand: brand }),
            }).eq("id", uid);
          }
        };
        // ---- Payment or subscription: persist stripe_customer_id when Checkout created a new customer ----
        if ((sess.mode === "payment" || sess.mode === "subscription") && sess.customer && sess.client_reference_id) {
          await supabase
            .from("users")
            .update({ stripe_customer_id: sess.customer })
            .eq("id", sess.client_reference_id)
            .is("stripe_customer_id", null);
          if (sess.mode === "payment" && sess.payment_intent && sk) {
            const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${sess.payment_intent}`, { headers: { Authorization: `Bearer ${sk}` } });
            if (piRes.ok) {
              const pi = (await piRes.json()) as { payment_method?: string };
              const pmId = typeof pi.payment_method === "string" ? pi.payment_method : null;
              if (pmId) await updatePmDisplay(sess.client_reference_id!, pmId);
            }
          }
          break;
        }
        // ---- Setup mode: update PM only, or free-credits + set default PM ----
        if (sess.mode !== "setup" || !sess.metadata?.user_id) break;
        const uid = sess.metadata.user_id;
        const setupIntentId = typeof sess.setup_intent === "string" ? sess.setup_intent : null;
        if (!setupIntentId) break;

        if (!sk) {
          console.error("stripe-webhook checkout.session.completed: STRIPE_SECRET_KEY not set");
          break;
        }
        const siRes = await fetch(`https://api.stripe.com/v1/setup_intents/${setupIntentId}`, {
          headers: { Authorization: `Bearer ${sk}` },
        });
        if (!siRes.ok) {
          console.error("stripe-webhook checkout.session.completed: failed to fetch SetupIntent", siRes.status);
          break;
        }
        const si = (await siRes.json()) as { payment_method?: string };
        const pmId = typeof si.payment_method === "string" ? si.payment_method : null;
        if (!pmId) break;

        const custId = typeof sess.customer === "string" ? sess.customer : null;
        const setDefaultPm = async () => {
          if (!sk || !custId || !pmId) return;
          await fetch(`https://api.stripe.com/v1/customers/${custId}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${sk}`, "Content-Type": "application/x-www-form-urlencoded" },
            body: `invoice_settings[default_payment_method]=${encodeURIComponent(pmId)}`,
          });
        };

        if (sess.metadata.update_payment_method === "true") {
          await setDefaultPm();
          await updatePmDisplay(uid, pmId);
          break;
        }

        if (!sess.metadata.free_credits) break;

        const pmRes = await fetch(`https://api.stripe.com/v1/payment_methods/${pmId}`, {
          headers: { Authorization: `Bearer ${sk}` },
        });
        if (!pmRes.ok) {
          console.error("stripe-webhook checkout.session.completed: failed to fetch PaymentMethod", pmRes.status);
          break;
        }
        const pm = (await pmRes.json()) as { card?: { fingerprint?: string; last4?: string } };
        const fingerprint = pm?.card?.fingerprint;
        if (pm?.card && !fingerprint) {
          await supabase.from("audit_log").insert({
            user_id: uid,
            action: "free_credits_rejected_no_fingerprint",
            resource_type: "checkout_session",
            resource_id: null,
            metadata: { stripe_pm_id: pmId, last4: pm?.card?.last4, event_id: event.id },
          });
          break;
        }
        const identifier = fingerprint ?? pmId;
        const last4 = pm?.card?.last4;
        const credits = parseInt(sess.metadata.free_credits, 10) || 1;
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
            resource_type: "checkout_session",
            resource_id: null,
            metadata: { error: rpcErr.message, event_id: event.id, type: event.type },
          });
          break;
        }
        if (result === "already_used") {
          await supabase.from("audit_log").insert({
            user_id: uid,
            action: "free_credits_rejected_duplicate_pm",
            resource_type: "checkout_session",
            resource_id: null,
            metadata: { payment_method_identifier: identifier, last4, event_id: event.id },
          });
        } else {
          await supabase.from("audit_log").insert({
            user_id: uid,
            action: "free_credits_granted",
            resource_type: "checkout_session",
            resource_id: null,
            metadata: { credits, payment_method_identifier: identifier, last4, event_id: event.id },
          });
        }
        await setDefaultPm();
        await updatePmDisplay(uid, pmId);
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
