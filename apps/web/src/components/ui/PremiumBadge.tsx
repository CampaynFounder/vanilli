interface PremiumBadgeProps {
  tier: 'free' | 'open_mic' | 'artist' | 'label' | 'industry';
  className?: string;
}

const tierConfig = {
  free: {
    label: 'Free',
    colors: 'bg-slate-700 text-slate-300',
    shimmer: false,
  },
  open_mic: {
    label: 'Open Mic',
    colors: 'bg-green-600 text-white',
    shimmer: false,
  },
  artist: {
    label: 'Artist',
    colors: 'bg-purple-600 text-white',
    shimmer: true,
  },
  label: {
    label: 'Label',
    colors: 'bg-gradient-to-r from-purple-600 to-pink-600 text-white',
    shimmer: true,
  },
  industry: {
    label: 'Industry',
    colors: 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white',
    shimmer: true,
  },
};

export function PremiumBadge({ tier, className = '' }: PremiumBadgeProps) {
  const config = tierConfig[tier];

  return (
    <div
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${config.colors} ${
        config.shimmer ? 'tier-badge-shimmer' : ''
      } ${className}`}
    >
      {config.label}
    </div>
  );
}
