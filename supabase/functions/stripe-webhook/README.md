# stripe-webhook

Supabase Edge Function for Stripe webhooks.

## Secrets (Supabase: Edge Functions → Secrets)

| Secret | Required | Notes |
|--------|----------|-------|
| `STRIPE_WEBHOOK_SECRET` | Yes | From Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret (`whsec_...`) |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (`sk_...`) – used to fetch PaymentMethod for free-credit fingerprint check |
| `SUPABASE_URL` | Auto | Usually set by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | Usually set by Supabase |

## Deploy

```bash
supabase functions deploy stripe-webhook
```

## Webhook URL in Stripe

`https://<project-ref>.supabase.co/functions/v1/stripe-webhook`

Stripe Dashboard → Developers → Webhooks → Add endpoint → paste URL.

**Subscribe to these events:** `payment_intent.succeeded`, `setup_intent.succeeded`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.

## Events handled

- `payment_intent.succeeded` – metadata `user_id`, `credits` → `add_credits` RPC and `audit_log`
- `setup_intent.succeeded` – when metadata `free_credits` is set: fetch PaymentMethod, use `card.fingerprint` (or `id`) as unique identifier, call `grant_free_credits_for_payment_method` RPC. Rejects if that identifier was already used (prevents gaming free credits with the same card).
- `invoice.paid` – update or create `subscriptions` (period, status)
- `customer.subscription.updated` – upsert `subscriptions` (status, period, `cancel_at_period_end`)
- `customer.subscription.deleted` – set `subscriptions.status = 'canceled'`
- `invoice.payment_failed` – set `subscriptions.status = 'past_due'`

## PaymentIntent metadata (one-time)

When creating the PaymentIntent, set:

```json
{ "user_id": "<users.id UUID>", "credits": "10" }
```

`add_credits` must exist (from `packages/database/schema.sql`).
