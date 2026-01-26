import Image from 'next/image';
import Link from 'next/link';

interface LogoProps {
  width?: number;
  height?: number;
  className?: string;
  href?: string;
}

export function Logo({ width = 768, height = 256, className = '', href }: LogoProps) {
  return (
    <Link href={href || "/"} className="flex items-center">
      <Image
        src="/logo/logo.png"
        alt="Vannilli"
        width={width}
        height={height}
        className={`h-16 w-auto object-contain ${className}`}
        priority
      />
    </Link>
  );
}

