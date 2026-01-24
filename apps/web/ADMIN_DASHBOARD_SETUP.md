# Admin Email Collections Dashboard Setup

## Overview

The admin dashboard allows you to monitor email collections, view analytics, and export data to CSV for Google Marketing.

**URL**: `https://vannilli.xaino.io/admin/email-collections`

## Environment Variables Required

### Cloudflare Pages (Frontend)
- `NEXT_PUBLIC_API_URL` - Should be set to `https://api.vannilli.xaino.io`

### Cloudflare Workers (Backend)
- `ADMIN_PASSWORD` - Your admin password (set as a secret)
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_KEY` - Supabase service role key (bypasses RLS)

## Setting Up ADMIN_PASSWORD

1. Go to **Cloudflare Dashboard** → **Workers & Pages** → Your Worker
2. Click **Settings** → **Variables and Secrets**
3. Click **Add variable** → **Secret**
4. Name: `ADMIN_PASSWORD`
5. Value: Your secure password
6. Click **Save**

**Important**: Use a strong password. This is the only protection for your admin dashboard.

## Features

### Dashboard Stats
- **Total Emails Collected**: Total count of all email signups
- **Last 24 Hours**: Count of signups in the past 24 hours

### Priority Section
- **Investors**: Highlighted section showing all users who checked "Investor Interest"
- Shows email, phone, date, and source
- Purple gradient background for visibility

### Weekly Trend Chart
- Line chart showing daily signup counts for the last 7 days
- Helps identify growth trends

### Email Collections Table
- Full list of all email collections
- Investors highlighted with purple background
- Sortable by date (newest first)
- Mobile responsive

### CSV Export
- Click "Export CSV" to download all email collections
- Format: Email, Phone, Investor, Source, Date
- Ready to import into Google Marketing/Ads

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
- Ensure `ADMIN_PASSWORD` is set in Cloudflare Workers secrets
- Redeploy the worker after setting the secret

### "Unauthorized" error
- Check that `ADMIN_PASSWORD` matches between login and API calls
- Try refreshing the page and logging in again

### Data not loading
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set in Workers
- Check that RLS policies allow service_role to SELECT from email_collections

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


