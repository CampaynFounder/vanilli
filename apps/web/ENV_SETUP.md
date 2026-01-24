# Environment Variables Setup

## Local Development

Create a `.env.local` file in `apps/web/` directory:

```bash
cd apps/web
touch .env.local
```

Then add your Supabase credentials:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Optional: API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8787
```

**Important**: 
- `.env.local` is gitignored (won't be committed to git)
- Restart your dev server after adding/changing variables
- Get your credentials from Supabase Dashboard → Settings → API

## Production (Cloudflare Pages)

Set environment variables in Cloudflare Pages dashboard:

1. Go to your Cloudflare Pages project
2. Navigate to **Settings** → **Environment Variables**
3. Add these variables for **Production** environment:

```
NEXT_PUBLIC_SUPABASE_URL = https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY = your-anon-key-here
NEXT_PUBLIC_API_URL = https://api.vannilli.xaino.io
```

**Note**: After adding variables, you may need to trigger a new deployment for changes to take effect.

## Getting Your Supabase Credentials

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → Use for `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → Use for `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Testing

After setting variables, test the connection:

1. Start dev server: `npm run dev`
2. Open the signup modal on your site
3. Submit a test email/phone
4. Check Supabase dashboard → Table Editor → `email_collections` to verify


