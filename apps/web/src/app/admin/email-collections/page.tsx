'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface EmailCollection {
  id: string;
  email: string;
  phone: string;
  is_investor: boolean;
  source: string;
  created_at: string;
}

interface DashboardData {
  data: EmailCollection[];
  total: number;
  last24Hours: number;
  weeklyTrend: Array<{ date: string; count: number }>;
  investors: EmailCollection[];
}

// API URL - try custom domain first, fallback to workers.dev if DNS not configured
const API_URL = process.env.NEXT_PUBLIC_API_URL || 
  process.env.NEXT_PUBLIC_WORKER_URL || 
  'https://api.vannilli.xaino.io';

export default function AdminEmailCollections() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const auth = sessionStorage.getItem('admin_authenticated');
    if (auth === 'true') {
      setIsAuthenticated(true);
      fetchData();
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/admin/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        // Store authentication state (password stored in memory only, not in sessionStorage for security)
        sessionStorage.setItem('admin_authenticated', 'true');
        setIsAuthenticated(true);
        // Password stays in component state for API calls
        fetchData(password);
      } else {
        setError('Invalid password');
        setPassword(''); // Clear password on error
      }
    } catch (err) {
      setError('Authentication failed. Please check your connection.');
      setPassword(''); // Clear password on error
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async (adminPassword?: string) => {
    setRefreshing(true);
    try {
      // Use password from parameter or state
      const pwd = adminPassword || password;
      if (!pwd) {
        // If no password, re-authenticate
        setIsAuthenticated(false);
        sessionStorage.removeItem('admin_authenticated');
        return;
      }

      const response = await fetch(`${API_URL}/api/admin/email-collections`, {
        headers: {
          'Authorization': `Bearer ${pwd}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        setDashboardData(result);
      } else if (response.status === 401) {
        // Re-authenticate if session expired
        sessionStorage.removeItem('admin_authenticated');
        setIsAuthenticated(false);
        setPassword('');
        setError('Session expired. Please log in again.');
      }
    } catch (err) {
      console.error('Failed to fetch data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  const exportCSV = () => {
    if (!dashboardData) return;
    
    const headers = ['Email', 'Phone', 'Investor', 'Source', 'Date'];
    const rows = dashboardData.data.map(item => [
      item.email,
      item.phone,
      item.is_investor ? 'Yes' : 'No',
      item.source,
      new Date(item.created_at).toLocaleString(),
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email-collections-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 p-8 rounded-xl border border-slate-800 max-w-md w-full">
          <h1 className="text-2xl font-bold text-white mb-6">Admin Access</h1>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500"
              required
              autoFocus
            />
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
            >
              {loading ? 'Verifying...' : 'Access Dashboard'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white">Loading dashboard data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">Email Collections Dashboard</h1>
          <div className="flex gap-3">
            <button
              onClick={() => fetchData()}
              disabled={refreshing}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              onClick={exportCSV}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm transition-colors"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid md:grid-cols-2 gap-4 sm:gap-6">
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-sm mb-2">Total Emails Collected</div>
            <div className="text-3xl sm:text-4xl font-bold text-white">{dashboardData.total.toLocaleString()}</div>
          </div>
          <div className="bg-slate-900 p-6 rounded-xl border border-slate-800">
            <div className="text-slate-400 text-sm mb-2">Last 24 Hours</div>
            <div className="text-3xl sm:text-4xl font-bold text-green-400">{dashboardData.last24Hours.toLocaleString()}</div>
          </div>
        </div>

        {/* Investors Priority Section */}
        {dashboardData.investors.length > 0 && (
          <div className="bg-gradient-to-r from-purple-900/50 to-pink-900/50 border-2 border-purple-500 rounded-xl p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                <span>⭐</span>
                Priority: Investors ({dashboardData.investors.length})
              </h2>
            </div>
            <div className="space-y-3">
              {dashboardData.investors.map((investor) => (
                <div
                  key={investor.id}
                  className="bg-slate-900/50 p-4 rounded-lg border border-purple-500/30"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="text-white font-semibold break-all">{investor.email}</div>
                      <div className="text-slate-300 text-sm">{investor.phone}</div>
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="text-xs text-slate-400 mb-1">
                        {new Date(investor.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                      <div className="text-xs text-purple-300">Source: {investor.source}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weekly Trend Chart */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 sm:p-6">
          <h2 className="text-xl font-bold text-white mb-4">Weekly Signup Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dashboardData.weeklyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis 
                dataKey="date" 
                stroke="#94a3b8"
                style={{ fontSize: '12px' }}
              />
              <YAxis 
                stroke="#94a3b8"
                style={{ fontSize: '12px' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Line 
                type="monotone" 
                dataKey="count" 
                stroke="#9333ea" 
                strokeWidth={2}
                dot={{ fill: '#9333ea', r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* All Email Collections Table */}
        <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-xl font-bold text-white">All Email Collections ({dashboardData.data.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800">
                <tr>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Email</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Phone</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Investor</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Source</th>
                  <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-slate-300 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {dashboardData.data.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                      No email collections yet
                    </td>
                  </tr>
                ) : (
                  dashboardData.data.map((item) => (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-slate-800/50 ${item.is_investor ? 'bg-purple-500/10' : ''}`}
                    >
                      <td className="px-4 sm:px-6 py-4 text-sm text-white break-all">{item.email}</td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-slate-300">{item.phone}</td>
                      <td className="px-4 sm:px-6 py-4 text-sm">
                        {item.is_investor ? (
                          <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded font-semibold text-xs">⭐ Investor</span>
                        ) : (
                          <span className="text-slate-400">No</span>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-slate-300">{item.source}</td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-slate-400 whitespace-nowrap">
                        {new Date(item.created_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

