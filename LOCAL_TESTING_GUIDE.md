# Local Testing Guide - Logged-In User Experience

## What Was Implemented

### Backend APIs
- ✅ Profile endpoints (`/api/auth/profile`, `/api/auth/referrals`)
- ✅ Avatar upload endpoint (`/api/upload/avatar`)
- ✅ History endpoints (`/api/projects/history`, `/api/generations/history`, `/api/activity/payments`)
- ✅ Referral rewards admin endpoints (`/api/admin/referral-rewards`)

### Frontend Pages
- ✅ Profile Page (`/profile`) - Account info, avatar upload, referral system
- ✅ History Page (`/history`) - Tabbed interface (Generations, Projects, Activity)
- ✅ Studio Page (`/studio`) - Project workspace with generation preview

### Premium Design System
- ✅ Glassmorphism effects
- ✅ Neumorphism 2.0
- ✅ Animated gradients
- ✅ Progress rings with glow
- ✅ Floating action buttons
- ✅ Bottom sheet modals
- ✅ Premium UI components

## Database Setup Required

Before testing, run these SQL scripts in Supabase:

1. **Referral Rewards Table**:
   ```bash
   # File: packages/database/add-referral-rewards-table.sql
   ```
   Run in Supabase SQL Editor

2. **User Avatar Column**:
   ```bash
   # File: packages/database/add-user-avatar.sql
   ```
   Run in Supabase SQL Editor

3. **Create Supabase Storage Bucket**:
   - Go to Supabase Dashboard → Storage
   - Create new bucket: `user-avatars`
   - Make it **public**
   - Set file size limit: 5MB
   - Allowed MIME types: `image/*`

## Local Testing Steps

### 1. Start Development Server

```bash
cd apps/web
npm run dev
```

The app will run at `http://localhost:3000`

### 2. Start Workers API (in separate terminal)

```bash
cd apps/workers
npm run dev
```

The API will run at `http://localhost:8787`

### 3. Update Environment Variables

Ensure `apps/web/.env.local` has:
```
NEXT_PUBLIC_API_URL=http://localhost:8787
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Test Authentication Flow

1. **Sign Up**:
   - Currently uses pre-launch modal
   - Will need proper sign-up page (not yet built)
   - For now, create test user directly in Supabase:
     ```sql
     -- In Supabase SQL Editor Auth > Users
     -- Or use Supabase Dashboard > Authentication > Users > Invite User
     ```

2. **Sign In**:
   - Use Supabase Auth to sign in
   - Session will persist in browser

### 5. Test Profile Page (`/profile`)

Navigate to: `http://localhost:3000/profile`

**Test**:
- ✅ Page loads with authentication check
- ✅ Displays user email, tier, credits
- ✅ Avatar upload works (click camera icon)
- ✅ Referral code displays
- ✅ Copy/Share buttons work
- ✅ Referral stats display (will show 0 if no referrals)

### 6. Test History Page (`/history`)

Navigate to: `http://localhost:3000/history`

**Test**:
- ✅ Tabs work (Generations, Projects, Activity)
- ✅ Displays empty state if no data
- ✅ Data loads when available

### 7. Test Studio Page (`/studio`)

Navigate to: `http://localhost:3000/studio`

**Test**:
- ✅ Page loads
- ✅ Generation preview with animations (scanning line, blur reveal)
- ✅ Demo controls work (Pending → Processing → Completed → Failed)
- ✅ Progress ring animates
- ✅ Floating action button visible
- ✅ Premium UI effects (glass, neumorphic cards)

## Testing Premium Design Elements

Check for these visual effects:

### Glassmorphism
- Cards should have frosted glass appearance
- Backdrop blur visible
- Subtle borders

### Neumorphism
- Avatar upload has inset shadow effect
- Cards have soft 3D appearance
- Elevated cards have depth

### Animations
- **Scanning line**: Moves top to bottom during processing
- **Noise fade**: Noise texture fades out
- **Blur reveal**: Image progressively unblurs
- **Glow pulse**: Purple glow on FAB and buttons
- **Shimmer**: Premium tier badges shimmer

### Micro-interactions
- Buttons scale on tap (tap-effect class)
- Hover states on all interactive elements
- Smooth transitions

## Known Limitations (To Complete)

1. **Authentication Pages**: Sign-up and sign-in pages not yet built
   - Currently relies on Supabase Dashboard user creation
   - Need `/auth/signup` and `/auth/signin` pages

2. **Studio Workflow**: Full video creation flow not yet implemented
   - Awaiting mockup for detailed implementation
   - Current version shows preview and placeholder

3. **RAG Help Panel**: Placeholder only
   - Will integrate RAG API later
   - Current version is a static help section

4. **Payment Integration**: One-tap payment buttons not yet implemented
   - Existing Stripe checkout works
   - Need Apple Pay, Google Pay, Cash App integrations

## Testing Checklist

- [ ] Database tables created (referral_rewards, avatar column)
- [ ] Supabase Storage bucket created (user-avatars)
- [ ] Environment variables configured (.env.local)
- [ ] Dev servers running (web + workers)
- [ ] Test user created in Supabase
- [ ] Profile page loads and displays data
- [ ] Avatar upload works
- [ ] Referral code displays and copies
- [ ] History page loads with tabs
- [ ] Studio page loads with generation preview
- [ ] Premium UI effects visible (glass, neumorphic, animations)
- [ ] Mobile responsive (test on different screen sizes)

## Next Steps After Local Testing

Once testing is complete:

1. **Fix any bugs** found during testing
2. **Build authentication pages** (`/auth/signup`, `/auth/signin`)
3. **Complete Studio workflow** (based on mockup)
4. **Implement RAG help system**
5. **Add payment integrations** (Apple Pay, Google Pay, Cash App)
6. **Merge to main branch** for production deployment

## Troubleshooting

### "Profile page won't load"
- Check Supabase session is active
- Check API is running on `http://localhost:8787`
- Check environment variables

### "Avatar upload fails"
- Verify Supabase Storage bucket `user-avatars` exists and is public
- Check file size < 5MB
- Check file is an image

### "Animations not working"
- Clear browser cache
- Check Tailwind classes compiled correctly
- Inspect element to verify animation classes applied

### "API returns 401"
- Session might be expired
- Re-authenticate through Supabase
- Check SUPABASE_SERVICE_KEY is set in workers

## Contact

If you encounter issues, check:
- Browser console for errors
- Network tab for API requests
- Supabase logs for database errors
