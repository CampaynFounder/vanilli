# Frontend Debugging Guide

Since the direct SQL insert worked, the RLS policy is correct. The issue is with the frontend request.

## Step 1: Check Browser Network Tab

1. Open browser DevTools (F12)
2. Go to **Network** tab
3. Try submitting the email form
4. Find the POST request to `email_collections`
5. Click on it to see details

## Step 2: Check Request Headers

Look for these headers in the request:

```
apikey: eyJ... (your anon key)
Authorization: Bearer eyJ... (same anon key)
Content-Type: application/json
```

**If these headers are missing or wrong:**
- The Supabase client isn't configured correctly
- Check that `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set in Cloudflare Pages
- Trigger a new deployment after setting env vars

## Step 3: Check Request Payload

The request body should look like:
```json
{
  "email": "test@example.com",
  "phone": "555-1234",
  "is_investor": false,
  "source": "pre_launch_modal",
  "user_agent": "..."
}
```

## Step 4: Check Response

Look at the response:
- **Status Code**: Should be 201 (Created) or 200 (OK)
- **Response Body**: Should contain the inserted record
- **Error Response**: If 42501, check the error message details

## Step 5: Check Browser Console

Look for these logs:
```
Supabase Config Check: { hasUrl: true, hasKey: true, ... }
Supabase client created successfully
Submitting email form: { email: ..., phone: ..., ... }
```

If you see warnings or errors in the console, that's the issue.

## Common Issues

### Issue: Headers are missing
**Solution**: Environment variables aren't embedded. Set them in Cloudflare Pages and trigger a new deployment.

### Issue: Wrong anon key
**Solution**: Make sure you're using the **anon/public** key from Supabase Settings → API, not the service_role key.

### Issue: CORS error
**Solution**: Check Supabase project settings. CORS should allow your domain.

### Issue: 401 instead of 42501
**Solution**: The anon key is wrong or missing. Check environment variables.

## Still Not Working?

1. Check the exact error message in the Network tab response
2. Compare the request headers with what Supabase expects
3. Verify the anon key matches exactly (no extra spaces, correct format)
4. Check Supabase API logs: Dashboard → Logs → API Logs


