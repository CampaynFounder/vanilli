# Testing Authentication - Quick Start Guide

## ⚠️ Important: Test in Your Real Browser

The authentication flow requires network access to Supabase, which is blocked in the Cursor browser preview. **Open your regular browser (Chrome, Safari, Firefox, etc.) to test.**

## 🚀 Quick Start: Access the Logged-In Experience

### Step 1: Open in Your Browser

Open your regular browser and go to:
```
http://localhost:3000
```

### Step 2: Click "Sign In"

Click the "Sign In" link in the top navigation, or go directly to:
```
http://localhost:3000/auth/signin
```

### Step 3: Create a Test Account

**Option A: Quick Test Account (Recommended)**
1. Click "Sign Up" link
2. Email: `test@example.com` (or any email)
3. Password: `password123` (minimum 6 characters)
4. Click "Create Account"
5. **Manually confirm in Supabase:**
   - Go to https://app.supabase.com
   - Select project: `veencpuzmhecmrubjxjk`
   - Authentication → Users
   - Find your user → Click "..." → "Confirm user"
6. Go back to http://localhost:3000/auth/signin and sign in

**Option B: Real Email**
1. Use your real email address
2. Check email for Supabase confirmation link
3. Click the link - you'll be automatically signed in!

### Step 4: Access Logged-In Pages

After signing in, you'll automatically be redirected to:
```
http://localhost:3000/profile
```

From there, you can navigate to:
- **Profile:** Account info, avatar, referral code, credits
- **Studio:** Video creation workspace (click "Studio" in nav)
- **History:** Generation and payment history (click "History" in nav)

## 🎯 What to Expect (Without Backend API)

Since the backend Workers API isn't running locally, you'll see:

✅ **Working:**
- Sign up / Sign in / Sign out
- Session persistence (stays logged in)
- Protected routes (redirects if not authenticated)
- Navigation between pages
- All UI components and premium design

⚠️ **Limited Data:**
- **Tier:** Shows "free" (default)
- **Credits:** Shows "0" 
- **Referral Code:** Shows "LOADING"
- **Referral Stats:** Empty (0 referrals)
- **History:** Empty state

**To see full data:** You need the backend Workers API running, which provides:
- Real user tier from database
- Actual credits balance
- Generated referral codes
- Referral tracking
- Generation history
- Payment activity

## 🔧 Troubleshooting

### Can't Sign In
- Make sure you confirmed your email (check inbox/spam)
- Or manually confirm in Supabase Dashboard
- Check browser console for errors

### "Failed to load profile"
- This means auth is working but you're not signed in yet
- Go to `/auth/signin` and sign in first

### Session Not Persisting
- Clear browser cookies and try again
- Make sure `.env.local` exists in `apps/web/`
- Check Supabase URL and anon key are correct

### Network Errors in Cursor Browser
- **This is expected!** Cursor browser blocks Supabase API calls
- Use your regular browser (Chrome/Safari/Firefox) instead

## 📍 Testing URLs

- **Homepage:** http://localhost:3000
- **Sign In:** http://localhost:3000/auth/signin
- **Sign Up:** http://localhost:3000/auth/signup
- **Profile:** http://localhost:3000/profile (protected)
- **Studio:** http://localhost:3000/studio (protected)
- **History:** http://localhost:3000/history (protected)

## ✅ Success Indicators

You'll know it's working when:
1. ✅ Sign up creates account (check Supabase Dashboard)
2. ✅ Sign in redirects to `/profile`
3. ✅ You see your email in the profile page
4. ✅ Navigation shows "Profile", "Studio", "History" tabs
5. ✅ Accessing `/profile` without auth redirects to homepage

## 🎨 Premium Design Features to Check

Once logged in, verify these premium UI elements:

- **Glassmorphism:** Frosted glass cards with blur
- **Gradient Text:** Purple/blue gradients on headings
- **Premium Badges:** Tier badges with animated shimmer
- **Hover Effects:** Smooth transitions on buttons
- **Dark Theme:** Slate-950 background with neon accents
- **Progress Rings:** In Studio generation preview (click state buttons)
- **Bottom Sheets:** (Not yet triggered in current UI)
- **Floating Action Buttons:** "+ New Project" in Studio

## 🔐 Disabling Email Confirmation (Optional)

For faster testing, disable email confirmation in Supabase:

1. Go to Supabase Dashboard
2. Project Settings → Authentication
3. Email Auth section
4. **Uncheck:** "Enable email confirmations"
5. Save

Now sign-ups will work immediately without needing to confirm email!

## 📝 Next Steps After Testing UI

Once you've confirmed the UI looks good:
1. Test all three pages (Profile, Studio, History)
2. Check premium design elements
3. Verify navigation works
4. Test sign-out (will need to add button)
5. Deploy to production when ready

---

**Current Server:** `http://localhost:3000` ✅ Running

**Open this URL in Chrome/Safari/Firefox to test authentication!**
