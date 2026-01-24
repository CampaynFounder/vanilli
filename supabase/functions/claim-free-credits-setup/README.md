# claim-free-credits-setup

Creates a Stripe SetupIntent so the user can link a payment method to receive free credits. No charge is made.

## Secrets (Supabase: Edge Functions → Secrets)

| Secret | Required | Notes |
|--------|----------|-------|
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (`sk_...`) |
| `SUPABASE_URL` | Auto | Set by Supabase |
| `SUPABASE_ANON_KEY` | Auto | Set by Supabase (for JWT validation) |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | Set by Supabase (for DB and creating/updating `users.stripe_customer_id`) |

## Deploy

```bash
supabase functions deploy claim-free-credits-setup
```

## Request

- **Method:** POST
- **Headers:** `Authorization: Bearer <supabase_session_jwt>`
- **Body:** none

## Response

- **200:** `{ "clientSecret": "seti_xxx_secret_xxx" }` – use with Stripe.js `confirmCardSetup` or Elements.
- **400:** `{ "error": "Free credits already claimed" }`
- **401:** `{ "error": "Unauthorized" }`
- **404:** `{ "error": "User record not found" }`
- **500:** server/Stripe error

## Flow

1. User must be logged in (`public.users` row must exist; `free_generation_redeemed` must be false).
2. If `users.stripe_customer_id` is null, creates a Stripe Customer and updates `users`.
3. Creates a SetupIntent with `metadata: { user_id, free_credits: "1" }`, `usage: off_session`, `payment_method_types: [card]`.
4. Frontend confirms with Stripe.js; on `setup_intent.succeeded`, the **stripe-webhook** Edge Function grants credits (and enforces unique payment method via `card.fingerprint`).
