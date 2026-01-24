'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth, withAuth } from '@/lib/auth';
import { Logo } from '@/components/Logo';
import { HistoryTabs } from '@/components/history/HistoryTabs';
import { GenerationsList } from '@/components/history/GenerationsList';
import { GlassCard } from '@/components/ui/GlassCard';

function HistoryPage() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'generations' | 'projects' | 'activity'>('generations');
  const [generations, setGenerations] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!session) return;

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.vannilli.xaino.io';

        // Fetch based on active tab
        if (activeTab === 'generations') {
          const response = await fetch(`${apiUrl}/api/generations/history`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });
          if (response.ok) {
            const data = await response.json();
            setGenerations(data.generations || []);
          }
        } else if (activeTab === 'projects') {
          const response = await fetch(`${apiUrl}/api/projects/history`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });
          if (response.ok) {
            const data = await response.json();
            setProjects(data.projects || []);
          }
        } else if (activeTab === 'activity') {
          const response = await fetch(`${apiUrl}/api/activity/payments`, {
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
            },
          });
          if (response.ok) {
            const data = await response.json();
            setActivity(data.activity || []);
          }
        }
      } catch (error) {
        console.error('Error fetching history:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [session, activeTab]);

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/90 border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Logo width={120} height={40} className="h-10" />
              <div className="hidden md:flex gap-6">
                <Link href="/profile" className="text-slate-400 hover:text-white transition-colors">
                  Profile
                </Link>
                <Link href="/studio" className="text-slate-400 hover:text-white transition-colors">
                  Studio
                </Link>
                <Link href="/history" className="text-white font-semibold">
                  History
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
                          <div className="text-white font-semibold capitalize">{item.action.replace('_', ' ')}</div>
                          <div className="text-xs text-slate-400">
                            {new Date(item.created_at).toLocaleString()}
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
  );
}

export default withAuth(HistoryPage);
