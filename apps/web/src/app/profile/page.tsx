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
import { LinkPaymentMethod } from '@/components/LinkPaymentMethod';

interface ProfileData {
  id: string;
  email: string;
  tier: 'free' | 'open_mic' | 'indie_artist' | 'artist' | 'label';
  creditsRemaining: number;
  freeGenerationRedeemed: boolean;
  avatarUrl?: string;
  referralCode: string;
  createdAt: string;
  stripeCustomerId?: string | null;
  paymentMethodLast4?: string | null;
  paymentMethodBrand?: string | null;
  hasValidCard?: boolean;
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
  const [showLinkBanner, setShowLinkBanner] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setShowLinkBanner(new URLSearchParams(window.location.search).get('link_required') === '1');
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!session?.user?.id) return;
      const uid = session.user.id;
      try {
        const { data: uData } = await supabase.from('users').select('id,email,tier,credits_remaining,free_generation_redeemed,avatar_url,created_at,stripe_customer_id,payment_method_last4,payment_method_brand,has_valid_card').eq('id', uid);
        const u = Array.isArray(uData) && uData.length > 0 ? uData[0] : null;
        if (u) {
          let refCode = '';
          const { data: rData } = await supabase.from('referrals').select('referral_code').eq('referrer_user_id', uid).limit(1);
          const r = Array.isArray(rData) && rData.length > 0 ? rData[0] : null;
          if (r?.referral_code) refCode = r.referral_code;
          else refCode = `VANNI-${uid.slice(0, 8).toUpperCase()}`;
          const { data: subData, error: subErr } = await supabase.from('subscriptions').select('status,tier,current_period_end').eq('user_id', uid).eq('status', 'active').limit(1);
          const sub = !subErr && Array.isArray(subData) && subData.length > 0 ? subData[0] : null;
          setProfile({ id: u.id, email: u.email, tier: u.tier, creditsRemaining: u.credits_remaining ?? 0, freeGenerationRedeemed: u.free_generation_redeemed ?? false, avatarUrl: u.avatar_url, referralCode: refCode, createdAt: u.created_at, stripeCustomerId: u.stripe_customer_id ?? null, paymentMethodLast4: u.payment_method_last4 ?? null, paymentMethodBrand: u.payment_method_brand ?? null, hasValidCard: u.has_valid_card === true, subscription: sub ? { status: sub.status, tier: sub.tier, currentPeriodEnd: sub.current_period_end } : undefined });
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    const setup = q.get('setup');
    if (setup === 'success' || setup === 'cancel') {
      let n = 0;
      const run = () => {
        refreshUser();
        n++;
        if (setup === 'success' && n < 6) setTimeout(run, 1500);
        else window.history.replaceState(null, '', '/profile');
      };
      run();
    }
  }, [refreshUser]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="spinner w-12 h-12"></div>
      </div>
    );
  }

  const displayProfile: ProfileData = profile || { id: authUser?.id || '', email: authUser?.email || '', tier: authUser?.tier || 'free', creditsRemaining: authUser?.creditsRemaining ?? 0, freeGenerationRedeemed: authUser?.freeGenerationRedeemed ?? false, avatarUrl: authUser?.avatarUrl, referralCode: authUser?.id ? `VANNI-${authUser.id.slice(0, 8).toUpperCase()}` : '', createdAt: new Date().toISOString(), stripeCustomerId: null, paymentMethodLast4: null, paymentMethodBrand: null, hasValidCard: authUser?.hasValidCard ?? false };
  const displayReferralData: ReferralData = referralData || { stats: { totalReferrals: 0, completedReferrals: 0, pendingReferrals: 0, totalCreditsEarned: 0 }, referrals: [] };
  // Prefer session (auth) email when public.users has the uuid@auth.local placeholder
  const displayEmail = (displayProfile.email && !displayProfile.email.endsWith('@auth.local')) ? displayProfile.email : (session?.user?.email || displayProfile.email || '');

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
              <div className="flex items-center gap-4 md:gap-6">
                <Link href="/profile" className="opacity-100 transition-opacity" aria-label="Profile">
                  <img src="/images/headerimages/profile.png" alt="" className="h-8 w-auto object-contain" />
                </Link>
                <Link href="/studio" className="opacity-60 hover:opacity-100 transition-opacity" aria-label="Studio">
                  <img src="/images/headerimages/studio.png" alt="" className="h-8 w-auto object-contain" />
                </Link>
                <Link href="/history" className="opacity-60 hover:opacity-100 transition-opacity" aria-label="History">
                  <img src="/images/headerimages/history.png" alt="" className="h-8 w-auto object-contain" />
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
        {showLinkBanner && !displayProfile.hasValidCard && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
            Link a payment method below to use Studio, History, and purchase credits.
          </div>
        )}

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
                <h2 className="text-xl font-semibold text-white mb-1">{displayEmail || 'Account'}</h2>
                <PremiumBadge tier={displayProfile.tier} />
              </div>
            </GlassCard>

            {/* Credits Card */}
            <GlassCard>
              <h3 className="text-sm font-semibold text-slate-400 mb-3">Available Credits</h3>
              <div className="text-4xl font-bold gradient-text-premium mb-4">
                {displayProfile.creditsRemaining}
              </div>
              {displayProfile.hasValidCard && displayProfile.paymentMethodLast4 && (
                <p className="text-sm text-slate-300 mb-3">
                  Payment method on file: {[displayProfile.paymentMethodBrand ? displayProfile.paymentMethodBrand.charAt(0).toUpperCase() + displayProfile.paymentMethodBrand.slice(1).toLowerCase() : null, `•••• ${displayProfile.paymentMethodLast4}`].filter(Boolean).join(' ')}
                </p>
              )}
              {!displayProfile.hasValidCard || displayProfile.paymentMethodLast4 == null ? (
                <div id="link-payment-required">
                  <p className="text-sm text-amber-400/90 mb-3">Link a payment method to use Studio, History, and purchase credits.</p>
                  <LinkPaymentMethod onSuccess={refreshUser} />
                </div>
              ) : (
                <div className="space-y-3">
                  <Link
                    href="/pricing"
                    className="block w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg text-center transition-all tap-effect"
                  >
                    Buy More Credits
                  </Link>
                  <div id="update-payment-method">
                    <LinkPaymentMethod onSuccess={refreshUser} updateOnly />
                  </div>
                </div>
              )}
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
