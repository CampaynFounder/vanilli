'use client';

import { GlassCard } from '../ui/GlassCard';

interface ReferralStatsProps {
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
  totalCreditsEarned: number;
  referredUsers: Array<{
    email: string;
    tier: string;
    signedUpAt: string;
    status: string;
    creditsAwarded: number;
  }>;
}

export function ReferralStats({
  totalReferrals,
  completedReferrals,
  pendingReferrals,
  totalCreditsEarned,
  referredUsers,
}: ReferralStatsProps) {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GlassCard className="text-center">
          <div className="text-3xl font-bold gradient-text-premium mb-1">
            {totalReferrals}
          </div>
          <div className="text-xs text-slate-400">Total Referrals</div>
        </GlassCard>

        <GlassCard className="text-center">
          <div className="text-3xl font-bold text-green-400 mb-1">
            {completedReferrals}
          </div>
          <div className="text-xs text-slate-400">Completed</div>
        </GlassCard>

        <GlassCard className="text-center">
          <div className="text-3xl font-bold text-yellow-400 mb-1">
            {pendingReferrals}
          </div>
          <div className="text-xs text-slate-400">Pending</div>
        </GlassCard>

        <GlassCard className="text-center">
          <div className="text-3xl font-bold text-purple-400 mb-1">
            {totalCreditsEarned}
          </div>
          <div className="text-xs text-slate-400">Credits Earned</div>
        </GlassCard>
      </div>

      {/* Referred Users List */}
      {referredUsers.length > 0 && (
        <GlassCard>
          <h3 className="text-lg font-semibold text-white mb-4">Referred Users</h3>
          <div className="space-y-3">
            {referredUsers.map((referredUser, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-slate-800/30 rounded-lg"
              >
                <div className="flex-1">
                  <div className="text-sm text-white font-medium">{referredUser.email}</div>
                  <div className="text-xs text-slate-400">
                    {new Date(referredUser.signedUpAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-semibold text-purple-400">
                      +{referredUser.creditsAwarded} credits
                    </div>
                    <div className="text-xs text-slate-500 capitalize">{referredUser.tier}</div>
                  </div>
                  <div
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      referredUser.status === 'completed'
                        ? 'bg-green-500/20 text-green-300'
                        : 'bg-yellow-500/20 text-yellow-300'
                    }`}
                  >
                    {referredUser.status === 'completed' ? 'Active' : 'Pending'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
