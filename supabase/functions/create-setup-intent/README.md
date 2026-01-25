# create-setup-intent

Creates a Stripe SetupIntent for linking a payment method (card, Cash App, wallet, etc.) via the PaymentElement. No charge. Used for first-time required link and for updating payment method.

## Secrets

| Secret | Required |
|--------|----------|
| `STRIPE_SECRET_KEY` | Yes |
| `SUPABASE_URL` | Auto |
| `SUPABASE_ANON_KEY` | Auto |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto |

## Request

- **Method:** POST
- **Headers:** `Authorization: Bearer <supabase_session_jwt>`
- **Body:** none

## Response

- **200:** `{ "clientSecret": "seti_xxx_secret_xxx" }` — use with `stripe.confirmSetup` and the PaymentElement.
- **401:** `{ "error": "Unauthorized" }`
- **404:** `{ "error": "User record not found" }`
- **500:** server/Stripe error

## Flow

1. Ensures `public.users` row (creates from `auth.users` if missing).
2. Ensures `users.stripe_customer_id` (creates Stripe Customer if null).
3. Creates SetupIntent with `usage: 'off_session'` and `automatic_payment_methods: { enabled: true }`.
4. Frontend uses `stripe.confirmSetup` + PaymentElement; after success, calls **register-user** with `setup_intent_id`.
