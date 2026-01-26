# create-checkout-session

Creates a Stripe Checkout Session for plans and credit packs. Requires auth.

## Deploy

From the **project root**, with [Supabase CLI](https://supabase.com/docs/guides/cli) installed:

```bash
# 1) Log in (once)
supabase login

# 2) Link this project to your Supabase project (once, if not already)
supabase link --project-ref YOUR_PROJECT_REF

# 3) Deploy this function
supabase functions deploy create-checkout-session
# or: npm run supabase:deploy:create-checkout
```

Or set `SUPABASE_ACCESS_TOKEN` and use a linked project.

**Secrets:** In Supabase Dashboard → Edge Functions → create-checkout-session → Secrets (or `supabase secrets set`), set: `STRIPE_SECRET_KEY`, `SITE_URL`, `STRIPE_PRICE_OPEN_MIC`, `STRIPE_PRICE_ARTIST`, `STRIPE_PRICE_LABEL`, `STRIPE_PRICE_INDUSTRY`.

## Environment (Supabase Edge Function secrets)

- `STRIPE_SECRET_KEY` – Stripe secret key
- `SITE_URL` – Base URL (e.g. `https://vannilli.xaino.io`) for success/cancel
- `STRIPE_PRICE_OPEN_MIC` – Price ID for Open Mic one-time ($15, 40 credits)
- `STRIPE_PRICE_ARTIST` – Price ID for Artist subscription ($20/mo, 80 credits)
- `STRIPE_PRICE_LABEL` – Price ID for Label subscription ($50/mo, 330 credits)
- `STRIPE_PRICE_INDUSTRY` – Price ID for Industry subscription ($199/mo, 1000 credits)
- `STRIPE_PRICE_DEMO` – Price ID for DEMO subscription ($0/day, 20 credits, no rollover)

## Request

```
POST /functions/v1/create-checkout-session
Authorization: Bearer <supabase_access_token>
Content-Type: application/json

{ "product": "open_mic" | "artist" | "label" | "industry" }
```

## Response

- `200` – `{ "url": "https://checkout.stripe.com/..." }` – redirect user to `url`
- `4xx/5xx` – `{ "error": "..." }`

## Webhooks

- One-time (`open_mic`): `payment_intent.succeeded` uses `metadata.credits` (40) and `metadata.user_id`; `stripe-webhook` calls `add_credits`.
- Subscriptions (`artist`, `label`, `industry`): `invoice.paid` and `customer.subscription.*` update `subscriptions`. Granting credits on subscription invoices (80 / 330 / 1000) is not yet implemented; add in `stripe-webhook` if needed.
