interface NeumorphicCardProps {
  children: React.ReactNode;
  className?: string;
  inset?: boolean;
}

export function NeumorphicCard({ children, className = '', inset = false }: NeumorphicCardProps) {
  const baseClass = inset ? 'neumorphic-inset' : 'neumorphic';
  
  return (
    <div className={`${baseClass} p-6 ${className}`}>
      {children}
    </div>
  );
}
