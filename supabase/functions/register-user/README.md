# register-user

Registers a linked payment method after the frontend confirms a SetupIntent with `stripe.confirmSetup` and the PaymentElement. Call with `setup_intent_id` after `setup_intent.succeeded`.

## Secrets

| Secret | Required |
|--------|----------|
| `STRIPE_SECRET_KEY` | Yes |
| `SUPABASE_URL` | Auto |
| `SUPABASE_ANON_KEY` | Auto |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto |

## Request

- **Method:** POST
- **Headers:** `Authorization: Bearer <supabase_session_jwt>`, `Content-Type: application/json`
- **Body:** `{ "setup_intent_id": "seti_xxx" }`

## Response

- **200:** `{ "ok": true, "has_valid_card": true }`
- **400:** `{ "error": "..." }` (missing/invalid setup_intent_id, SI not succeeded, no PM)
- **401:** `{ "error": "Unauthorized" }`
- **403:** `{ "error": "Setup intent does not belong to this user" }`
- **500:** server/Stripe/DB error

## Flow

1. Validates `setup_intent_id` and auth.
2. `stripe.setupIntents.retrieve` and `stripe.paymentMethods.retrieve` → payment method id, `card.fingerprint`, `card.last4`, `card.brand`. For Cash App, `us_bank_account`, etc., uses `last4`/`brand` from the appropriate sub-object or `type`.
3. Upserts `billing_profiles` with `stripe_payment_method_id`, `card_fingerprint`, `card_last4`, `card_brand`, `has_valid_card: true`. Dedupes by `(user_id, stripe_payment_method_id)`.
4. Updates `users`: `has_valid_card: true`, `payment_method_last4`, `payment_method_brand`.
5. Sets Stripe customer `invoice_settings[default_payment_method]` to the new PM.
6. On **first link** (user had 0 `billing_profiles`), calls `grant_free_credits_for_payment_method` with 3 credits. Duplicate `card.fingerprint` across users returns `already_used` (no credit), but `has_valid_card` is still set so the user can use the site.
