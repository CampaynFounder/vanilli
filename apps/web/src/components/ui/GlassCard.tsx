interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  elevated?: boolean;
  onClick?: () => void;
}

export function GlassCard({ children, className = '', elevated = false, onClick }: GlassCardProps) {
  const baseClass = elevated ? 'glass-card-elevated' : 'glass-card';
  
  return (
    <div
      className={`${baseClass} rounded-2xl p-6 ${onClick ? 'cursor-pointer tap-effect' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
