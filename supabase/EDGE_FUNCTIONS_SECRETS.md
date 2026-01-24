# Edge Functions – Secrets

Set these in **Supabase Dashboard → Project Settings → Edge Functions → Secrets** (or `supabase secrets set KEY=value`).  
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are usually provided by Supabase.

---

## All three functions

| Secret | Used by | Notes |
|--------|---------|-------|
| `STRIPE_SECRET_KEY` | create-checkout-session, claim-free-credits-setup, stripe-webhook | Stripe secret key (sk_live_… or sk_test_…) |

---

## stripe-webhook only

| Secret | Notes |
|--------|-------|
| `STRIPE_WEBHOOK_SECRET` | Signing secret from Stripe Dashboard → Developers → Webhooks → [your endpoint] → Signing secret (whsec_…) |

---

## create-checkout-session only

| Secret | Notes |
|--------|-------|
| `SITE_URL` | Base URL for success/cancel (e.g. `https://vannilli.xaino.io`). Optional; defaults to `https://vannilli.xaino.io`. |
| `STRIPE_PRICE_OPEN_MIC` | Stripe Price ID for Open Mic – $15 one-time, 40 credits |
| `STRIPE_PRICE_ARTIST` | Stripe Price ID for Artist – $20/mo, 80 credits |
| `STRIPE_PRICE_LABEL` | Stripe Price ID for Label – $50/mo, 330 credits |

---

## claim-free-credits-setup

Uses only `STRIPE_SECRET_KEY` (and Supabase auto-injected vars). No extra secrets.

---

## Quick checklist

- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET` (for stripe-webhook)
- [ ] `SITE_URL` (optional for create-checkout-session)
- [ ] `STRIPE_PRICE_OPEN_MIC`
- [ ] `STRIPE_PRICE_ARTIST`
- [ ] `STRIPE_PRICE_LABEL`

**Removed (no longer used):** `STRIPE_PRICE_CREDITS_30`
