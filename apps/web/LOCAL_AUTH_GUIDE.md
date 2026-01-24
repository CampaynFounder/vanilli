# Local Authentication Guide

## ✅ Authentication is Now Working!

The auth system has been fixed to work locally without requiring the backend Workers API to be running.

## 🔐 How to Sign In & Access Logged-In Experience

### Step 1: Create an Account

1. Navigate to: **http://localhost:3000/auth/signup**
2. Enter your email address
3. Create a password (minimum 6 characters)
4. Confirm your password
5. Click **"Create Account"**

### Step 2: Confirm Your Email

**Supabase will send you a confirmation email.** You have two options:

#### Option A: Click Email Confirmation Link (Recommended)
- Check your email inbox
- Click the confirmation link from Supabase
- You'll be automatically signed in and redirected to `/profile`

#### Option B: Manual Confirmation (For Testing)
If you don't want to wait for email:
1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project: `veencpuzmhecmrubjxjk`
3. Go to **Authentication** → **Users**
4. Find your user
5. Click the **"..."** menu → **"Confirm user"**
6. Now go back and sign in at http://localhost:3000/auth/signin

### Step 3: Sign In

1. Navigate to: **http://localhost:3000/auth/signin**
2. Enter your email and password
3. Click **"Sign In"**
4. **You'll be automatically redirected to `/profile`!**

## 🎯 Available Pages After Sign-In

Once authenticated, you have access to:

- **Profile** - `http://localhost:3000/profile`
  - Account information
  - Avatar upload
  - Referral code & stats
  - Credits balance
  - Subscription info

- **Studio** - `http://localhost:3000/studio`
  - Project management
  - Video generation preview
  - Create new projects

- **History** - `http://localhost:3000/history`
  - Generation history
  - Project history
  - Payment activity

## 🔄 Alternative: Magic Link Sign-In

For passwordless authentication:

1. Go to **http://localhost:3000/auth/signin**
2. Enter your email (no password needed)
3. Click **"Send Magic Link"**
4. Check your email for the magic link
5. Click the link to be automatically signed in

## ⚠️ Important Notes

### Backend API Not Required for Local Auth
- The auth flow works **without** the Workers API running
- User data falls back to Supabase user information
- For full functionality (profile data, referrals, history), you'll need the backend API

### Email Confirmation Required
- Supabase requires email confirmation by default
- Use the manual confirmation method above for faster testing
- Or disable email confirmation in Supabase Dashboard:
  - Project Settings → Authentication → Email Auth → Uncheck "Enable email confirmations"

### Session Persistence
- Your session persists across page reloads
- Refresh token is automatically handled
- Sign out from any logged-in page (will be added to navigation)

## 🐛 Troubleshooting

### "Failed to load profile" Error
This means the backend API isn't running, but auth still works! You'll see basic user info from Supabase.

### Redirected Back to Homepage
- Make sure you've confirmed your email
- Check browser console for errors
- Verify Supabase credentials in `.env.local`

### Can't Receive Emails
- Check spam/junk folder
- Use manual confirmation method
- Or disable email confirmation in Supabase

## 🔗 Quick Links

- Sign Up: http://localhost:3000/auth/signup
- Sign In: http://localhost:3000/auth/signin  
- Profile: http://localhost:3000/profile
- Studio: http://localhost:3000/studio
- History: http://localhost:3000/history
- Homepage: http://localhost:3000

## 📝 Current User Data

When backend API is not available, you'll see:
- **Email:** Your actual Supabase email
- **Tier:** `free` (default)
- **Credits:** `0` (requires backend API for real data)
- **Avatar:** From Supabase user metadata (if set)

To see full user data with real credits, referrals, etc., you need to run the backend Workers API.
