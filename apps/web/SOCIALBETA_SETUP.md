# Social Beta (Post-Launch Signup) Setup

The `/socialbeta` page implements the post-launch signup flow: Stripe card verification first, then credential creation.

## Flow

1. User selects a plan and clicks **Get Free Credits**
2. Anonymous session created (Supabase Anonymous Sign-In)
3. Stripe Payment Element shown with trust messaging
4. User links card (no charge) → `register-user` grants 3 credits
5. Credential form expands: user sets email + password
6. `updateUser` converts anonymous to permanent account
7. Success: "Screenshot your username/password" + link to Studio

## Requirements

### Supabase

1. **Enable Anonymous Sign-Ins**  
   Supabase Dashboard → Authentication → Providers → Anonymous Sign-Ins → Enable

2. **Email confirmation**  
   For socialbeta, consider disabling "Confirm email" so the flow completes without email verification.  
   Or rely on `updateUser` to set the real email after the anonymous step.

### Environment

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Restrict other signups

Set `NEXT_PUBLIC_SIGNUP_VIA_SOCIALBETA_ONLY=true` so `/auth/signup` shows the email capture form and links to `/socialbeta`.

## GA4 Events

| Event | When | Params |
|-------|------|--------|
| `socialbeta_plan_selected` | User focuses a plan card | plan_id |
| `socialbeta_get_free_credits_click` | Clicks Get Free Credits | plan_id |
| `socialbeta_stripe_started` | Stripe form shown | plan_id |
| `socialbeta_card_linked` | Card linked successfully | plan_id |
| `socialbeta_credentials_form_shown` | Credential form shown | plan_id |
| `socialbeta_credentials_created` | Account created | plan_id |
| `socialbeta_complete` | Full flow complete | plan_id |
| `socialbeta_abandon` | User leaves (optional) | step, plan_id |
