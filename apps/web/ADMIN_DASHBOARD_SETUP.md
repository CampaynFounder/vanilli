# Admin Email Collections Dashboard Setup

## Overview

The admin dashboard allows you to monitor email collections, view analytics, and export data to CSV for Google Marketing.

**URL**: `https://vannilli.xaino.io/admin/email-collections`

## Environment Variables Required

Set these in **Cloudflare Pages** → **Settings** → **Environment Variables** (Production and Preview):

- `ADMIN_PASSWORD` - Your admin password (protects the dashboard)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (bypasses RLS; from Supabase Dashboard → Settings → API)
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase URL (likely already set for the frontend)

**Architecture**: The admin page calls `/api/admin/*` which are handled by **Cloudflare Pages Functions** (in `/functions` at repo root). No separate Worker—just the same Pages deployment.

**Deploy from CLI:**
```bash
# 1. Set env vars in Cloudflare Dashboard (Pages → vannilli-web → Settings → Environment Variables):
#    ADMIN_PASSWORD, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL

# 2. From repo root:
npm run deploy:pages
```
This builds the web app and deploys to Cloudflare Pages (static + Functions). Wrangler uses `wrangler.toml` and auto-detects the `functions/` folder.

## Features

### Dashboard Stats
- **Total Emails Collected**: Total count of all email signups
- **Last 24 Hours**: Count of signups in the past 24 hours

### Priority Section
- **Investors**: Highlighted section showing all users who checked "Investor Interest"
- Shows email, phone, date, and source
- Purple gradient background for visibility

### Signups by Source
- Bar chart showing count per source (pre_launch_modal, socialsignup, etc.)

### Weekly Trend Chart
- Line chart showing daily signup counts for the last 7 days
- Helps identify growth trends

### Email Collections Table
- Full list of all email collections
- Investors highlighted with purple background
- Sortable by date (newest first)
- Mobile responsive

### Drill-down Filters
- **Source** - Filter by signup source (pre_launch_modal, socialsignup, etc.)
- **Investor** - All, Investors only, or Non-investors only
- **Date range** - All time, Last 7 days, Last 30 days
- Export CSV downloads only the filtered data for retargeting

### CSV Export
- Click "Export CSV" to download email collections (filtered or full)
- Format: Email, Phone, Investor, Source, Date
- Ready to import into Google Ads (Customer Match), Google Marketing Platform, etc.

## Security

- Password-protected access
- No links from main site (direct URL only)
- Session-based authentication (expires on page refresh)
- Uses Supabase service_role key (bypasses RLS for admin access)
- Password never stored in localStorage (only in component state during session)

## Usage

1. Navigate to: `https://vannilli.xaino.io/admin/email-collections`
2. Enter your admin password
3. View dashboard with stats and visualizations
4. Click "Export CSV" to download for Google Marketing
5. Investors are highlighted for priority outreach

## Troubleshooting

### "Admin password not configured"
- Add `ADMIN_PASSWORD` to Cloudflare Pages env vars
- Redeploy after adding

### "Unauthorized" error
- Check that `ADMIN_PASSWORD` matches between login and API calls
- Try refreshing the page and logging in again

### Data not loading / "Database not configured"
- Add `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` in Cloudflare Pages env vars
- Ensure Functions can access them (Settings → Environment Variables)
- RLS policies allow service_role to SELECT from email_collections

### Chart not displaying
- Ensure Recharts is installed: `npm install recharts`
- Check browser console for errors

## CSV Format for Google Marketing

The exported CSV includes:
- Email addresses
- Phone numbers
- Investor status (Yes/No)
- Source (pre_launch_modal, landing_page, etc.)
- Signup date

You can import this directly into:
- Google Ads (Customer Match)
- Google Marketing Platform
- Email marketing tools


