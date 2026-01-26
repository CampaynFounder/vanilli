'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, withAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Logo } from '@/components/Logo';
import { AppBackground } from '@/components/AppBackground';
import { HistoryTabs } from '@/components/history/HistoryTabs';
import { GenerationsList, type Generation } from '@/components/history/GenerationsList';
import { GlassCard } from '@/components/ui/GlassCard';

interface Project {
  id?: string;
  track_name?: string;
  bpm?: number;
  bars?: number;
  status?: string;
}

interface ActivityItem {
  action?: string;
  created_at?: string;
  metadata?: { credits?: number };
}

function HistoryPage() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'generations' | 'projects' | 'activity'>('generations');
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!session?.user?.id) return;
      const uid = session.user.id;
      try {
        if (activeTab === 'generations') {
          const { data: g } = await supabase.from('generations').select('*, projects!inner(user_id,track_name,bpm,bars)').eq('projects.user_id', uid).order('created_at', { ascending: false }).limit(50);
          setGenerations((g || []) as Generation[]);
        } else if (activeTab === 'projects') {
          const { data: p } = await supabase.from('projects').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(50);
          setProjects((p || []) as Project[]);
        } else {
          const { data: a } = await supabase.from('audit_log').select('*').eq('user_id', uid).in('action', ['credit_purchase', 'subscription_created', 'subscription_renewed', 'referral_credit_earned']).order('created_at', { ascending: false }).limit(50);
          setActivity((a || []) as ActivityItem[]);
        }
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    };
    fetchData();
  }, [session, activeTab]);

  return (
    <div className="min-h-screen relative">
      <AppBackground />
      <div className="relative z-10">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/90 border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 md:gap-8">
              <Logo width={120} height={40} className="h-[150px] w-auto object-contain" />
              <div className="flex items-center gap-4 md:gap-6">
                <Link href="/profile" className="opacity-60 hover:opacity-100 transition-opacity flex items-center" aria-label="Profile">
                  <img src="/icons/nav/profile.png" alt="" className="h-[120px] w-auto object-contain" />
                </Link>
                <Link href="/studio" className="opacity-60 hover:opacity-100 transition-opacity flex items-center" aria-label="Studio">
                  <img src="/icons/nav/studio.png" alt="" className="h-[120px] w-auto object-contain" />
                </Link>
                <Link href="/history" className="opacity-100 transition-opacity flex items-center" aria-label="History">
                  <img src="/icons/nav/history.png" alt="" className="h-[120px] w-auto object-contain" />
                </Link>
                <Link href="/pricing" className="opacity-60 hover:opacity-100 transition-opacity flex items-center" aria-label="Pricing">
                  <img src="/icons/nav/pricing.png" alt="" className="h-[120px] w-auto object-contain" />
                </Link>
              </div>
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
      </nav>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-4xl font-bold gradient-text-premium mb-8">History</h1>

        <div className="mb-6">
          <HistoryTabs activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="spinner w-12 h-12"></div>
          </div>
        ) : (
          <>
            {activeTab === 'generations' && <GenerationsList generations={generations} />}
            
            {activeTab === 'projects' && (
              <div className="space-y-4">
                {projects.length === 0 ? (
                  <GlassCard className="text-center py-12">
                    <div className="text-4xl mb-3">📁</div>
                    <p className="text-slate-400">No projects yet</p>
                  </GlassCard>
                ) : (
                  projects.map((project) => (
                    <GlassCard key={project.id} elevated className="card-3d">
                      <h3 className="text-lg font-semibold text-white mb-2">{project.track_name}</h3>
                      <div className="flex items-center gap-3 text-sm text-slate-400">
                        <span>{project.bpm} BPM</span>
                        <span>•</span>
                        <span>{project.bars} bars</span>
                        <span>•</span>
                        <span className="capitalize">{project.status}</span>
                      </div>
                    </GlassCard>
                  ))
                )}
              </div>
            )}
            
            {activeTab === 'activity' && (
              <div className="space-y-4">
                {activity.length === 0 ? (
                  <GlassCard className="text-center py-12">
                    <div className="text-4xl mb-3">💳</div>
                    <p className="text-slate-400">No activity yet</p>
                  </GlassCard>
                ) : (
                  activity.map((item, index) => (
                    <GlassCard key={index} elevated>
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-white font-semibold capitalize">{(item.action ?? '').replace('_', ' ')}</div>
                          <div className="text-xs text-slate-400">
                            {new Date(item.created_at ?? 0).toLocaleString()}
                          </div>
                        </div>
                        {item.metadata?.credits && (
                          <div className="text-purple-400 font-semibold">
                            +{item.metadata.credits} credits
                          </div>
                        )}
                      </div>
                    </GlassCard>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}

export default withAuth(HistoryPage);
