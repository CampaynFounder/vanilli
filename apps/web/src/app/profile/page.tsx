'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { GlassCard } from '@/components/ui/GlassCard';
import { PremiumBadge } from '@/components/ui/PremiumBadge';
import { AvatarUpload } from '@/components/profile/AvatarUpload';
import { ReferralCode } from '@/components/profile/ReferralCode';
import { ReferralStats } from '@/components/profile/ReferralStats';
import { LinkPaymentForFreeCredits } from '@/components/LinkPaymentForFreeCredits';

interface ProfileData {
  id: string;
  email: string;
  tier: 'free' | 'open_mic' | 'indie_artist' | 'artist' | 'label';
  creditsRemaining: number;
  freeGenerationRedeemed: boolean;
  avatarUrl?: string;
  referralCode: string;
  createdAt: string;
  subscription?: {
    status: string;
    tier: string;
    currentPeriodEnd: string;
  };
}

interface ReferralData {
  stats: {
    totalReferrals: number;
    completedReferrals: number;
    pendingReferrals: number;
    totalCreditsEarned: number;
  };
  referrals: Array<{
    id: string;
    referralCode: string;
    creditsAwarded: number;
    status: string;
    referredProduct: string;
    createdAt: string;
    completedAt: string | null;
    referredUser: {
      email: string;
      tier: string;
      signedUpAt: string;
    } | null;
  }>;
}

function ProfilePage() {
  const router = useRouter();
  const { user: authUser, session, refreshUser, signOut } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [referralData, setReferralData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!session?.user?.id) return;
      const uid = session.user.id;
      try {
        const { data: u } = await supabase.from('users').select('id,email,tier,credits_remaining,free_generation_redeemed,avatar_url,created_at').eq('id', uid).single();
        if (u) {
          let refCode = '';
          const { data: r } = await supabase.from('referrals').select('referral_code').eq('referrer_user_id', uid).limit(1).single();
          if (r?.referral_code) refCode = r.referral_code;
          else refCode = `VANNI-${uid.slice(0, 8).toUpperCase()}`;
          const { data: sub } = await supabase.from('subscriptions').select('status,tier,current_period_end').eq('user_id', uid).eq('status', 'active').single();
          setProfile({ id: u.id, email: u.email, tier: u.tier, creditsRemaining: u.credits_remaining ?? 0, freeGenerationRedeemed: u.free_generation_redeemed ?? false, avatarUrl: u.avatar_url, referralCode: refCode, createdAt: u.created_at, subscription: sub ? { status: sub.status, tier: sub.tier, currentPeriodEnd: sub.current_period_end } : undefined });
        }
        const { data: refs } = await supabase.from('referrals').select('id,referral_code,credits_awarded,status,referred_product,created_at,completed_at,referred_user_id').eq('referrer_user_id', uid).order('created_at', { ascending: false });
        if (refs?.length) {
          const ids = refs.map((r) => r.referred_user_id).filter(Boolean);
          const { data: us } = await supabase.from('users').select('id,email,tier,created_at').in('id', ids);
          const usersMap = new Map((us || []).map((x) => [x.id, x]));
          setReferralData({ stats: { totalReferrals: refs.length, completedReferrals: refs.filter((r) => r.status === 'completed').length, pendingReferrals: refs.filter((r) => r.status === 'pending').length, totalCreditsEarned: refs.reduce((s, r) => s + (r.credits_awarded || 0), 0) }, referrals: refs.map((r) => ({ id: r.id, referralCode: r.referral_code, creditsAwarded: r.credits_awarded || 0, status: r.status, referredProduct: r.referred_product || '', createdAt: r.created_at, completedAt: r.completed_at, referredUser: usersMap.get(r.referred_user_id) ? { email: usersMap.get(r.referred_user_id)!.email, tier: usersMap.get(r.referred_user_id)!.tier, signedUpAt: usersMap.get(r.referred_user_id)!.created_at } : null })) });
        } else setReferralData({ stats: { totalReferrals: 0, completedReferrals: 0, pendingReferrals: 0, totalCreditsEarned: 0 }, referrals: [] });
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [session]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="spinner w-12 h-12"></div>
      </div>
    );
  }

  const displayProfile: ProfileData = profile || { id: authUser?.id || '', email: authUser?.email || '', tier: authUser?.tier || 'free', creditsRemaining: authUser?.creditsRemaining ?? 0, freeGenerationRedeemed: authUser?.freeGenerationRedeemed ?? false, avatarUrl: authUser?.avatarUrl, referralCode: authUser?.id ? `VANNI-${authUser.id.slice(0, 8).toUpperCase()}` : '', createdAt: new Date().toISOString() };
  const displayReferralData: ReferralData = referralData || { stats: { totalReferrals: 0, completedReferrals: 0, pendingReferrals: 0, totalCreditsEarned: 0 }, referrals: [] };

  const referredUsers = displayReferralData.referrals.map((r) => ({
    email: r.referredUser?.email || 'Unknown',
    tier: r.referredUser?.tier || 'unknown',
    signedUpAt: r.referredUser?.signedUpAt || r.createdAt,
    status: r.status,
    creditsAwarded: r.creditsAwarded,
  }));

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/90 border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Logo width={120} height={40} className="h-10" />
              <div className="hidden md:flex gap-6">
                <Link href="/profile" className="text-white font-semibold">
                  Profile
                </Link>
                <Link href="/studio" className="text-slate-400 hover:text-white transition-colors">
                  Studio
                </Link>
                <Link href="/history" className="text-slate-400 hover:text-white transition-colors">
                  History
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="px-4 py-2 bg-purple-600/20 border border-purple-500/30 rounded-lg">
                <span className="text-sm font-semibold text-purple-300">{displayProfile.creditsRemaining} credits</span>
              </div>
              <button
                onClick={async () => { await signOut(); router.push('/'); }}
                className="flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800/50 rounded-lg transition-colors text-sm"
                aria-label="Sign out"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-4xl font-bold gradient-text-premium mb-8">Profile</h1>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Account Info & Avatar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Avatar */}
            <GlassCard elevated className="text-center">
              <AvatarUpload
                userId={authUser?.id ?? ''}
                currentAvatarUrl={displayProfile.avatarUrl}
                onAvatarUpdate={async (url) => {
                  if (authUser?.id) await supabase.from('users').update({ avatar_url: url }).eq('id', authUser.id);
                  if (profile) setProfile({ ...profile, avatarUrl: url });
                  refreshUser();
                }}
              />
              <div className="mt-4">
                <h2 className="text-xl font-semibold text-white mb-1">{displayProfile.email}</h2>
                <PremiumBadge tier={displayProfile.tier} />
              </div>
            </GlassCard>

            {/* Credits Card */}
            <GlassCard>
              <h3 className="text-sm font-semibold text-slate-400 mb-3">Available Credits</h3>
              <div className="text-4xl font-bold gradient-text-premium mb-4">
                {displayProfile.creditsRemaining}
              </div>
              {!displayProfile.freeGenerationRedeemed && displayProfile.creditsRemaining === 0 && (
                <div className="mb-4">
                  <p className="text-xs text-slate-400 mb-3">Link a payment method to get 3 free credits. No charge.</p>
                  <LinkPaymentForFreeCredits onSuccess={refreshUser} />
                </div>
              )}
              <Link
                href="/pricing"
                className="block w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg text-center transition-all tap-effect"
              >
                Buy More Credits
              </Link>
            </GlassCard>

            {/* Subscription Card */}
            {displayProfile.subscription && (
              <GlassCard>
                <h3 className="text-sm font-semibold text-slate-400 mb-3">Subscription</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-300">Status</span>
                    <span className="text-sm font-semibold text-green-400 capitalize">
                      {displayProfile.subscription.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-300">Plan</span>
                    <span className="text-sm font-semibold text-white capitalize">
                      {displayProfile.subscription.tier.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-300">Renews</span>
                    <span className="text-sm font-semibold text-slate-300">
                      {new Date(displayProfile.subscription.currentPeriodEnd).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </GlassCard>
            )}
          </div>

          {/* Right Column - Referrals */}
          <div className="lg:col-span-2 space-y-6">
            <ReferralCode code={displayProfile.referralCode} />
            
            <ReferralStats
              totalReferrals={displayReferralData.stats.totalReferrals}
              completedReferrals={displayReferralData.stats.completedReferrals}
              pendingReferrals={displayReferralData.stats.pendingReferrals}
              totalCreditsEarned={displayReferralData.stats.totalCreditsEarned}
              referredUsers={referredUsers}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default withAuth(ProfilePage);
