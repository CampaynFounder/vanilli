'use client';

interface HistoryTabsProps {
  activeTab: 'generations' | 'projects' | 'activity';
  onTabChange: (tab: 'generations' | 'projects' | 'activity') => void;
}

export function HistoryTabs({ activeTab, onTabChange }: HistoryTabsProps) {
  const tabs = [
    { id: 'generations' as const, label: 'Generations' },
    { id: 'projects' as const, label: 'Projects' },
    { id: 'activity' as const, label: 'Activity' },
  ];

  return (
    <div className="glass-card rounded-2xl p-2 inline-flex gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`px-6 py-3 rounded-xl font-semibold transition-all tap-effect ${
            activeTab === tab.id
              ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
