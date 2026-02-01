'use client';

import { useRef, useEffect } from 'react';
import Link from 'next/link';
import { motion, type Variants } from 'framer-motion';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { PLANS, type Plan, type Product } from '@/config/pricing';

function trackPricingCardView(planId: string) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'view_pricing_card', { plan_id: planId, plan_name: planId });
  }
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20, filter: 'blur(8px)' },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { delay: i * 0.08, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

interface PricingCardsProps {
  plans?: Plan[];
  /** Landing: link to signin/pricing. App: full checkout flow */
  variant: 'landing' | 'app';
  onSelect?: (product: Product) => void;
  onCardFocus?: (product: Product) => void;
  focusedPlan?: Product | null;
  purchasingProduct?: Product | null;
  user?: { hasValidCard?: boolean } | null;
  /** Use horizontal scroll on mobile (for pricing page) */
  scrollOnMobile?: boolean;
  /** Show investor demo tier (logged-in only; hidden from public/landing) */
  showDemoTier?: boolean;
}

export function PricingCards({
  plans,
  variant,
  onSelect,
  onCardFocus,
  focusedPlan = null,
  purchasingProduct = null,
  user = null,
  scrollOnMobile = true,
  showDemoTier = false,
}: PricingCardsProps) {
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const viewedRef = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  const basePlans = plans ?? PLANS;
  const items = showDemoTier ? basePlans : basePlans.filter((p) => p.id !== 'demo');
  const labelIndex = items.findIndex((p) => p.id === 'label');

  // On mount: scroll carousel to Label tier (default focused) on mobile/tablet only
  useEffect(() => {
    if (!scrollOnMobile || labelIndex < 0) return;
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) return;
    const labelEl = cardRefs.current.get(items[labelIndex].id);
    if (!labelEl) return;
    const timer = setTimeout(() => {
      labelEl.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'center' });
    }, 150);
    return () => clearTimeout(timer);
  }, [scrollOnMobile, labelIndex, items]);

  useEffect(() => {
    const timers: Record<string, ReturnType<typeof setTimeout>> = {};
    const observers: IntersectionObserver[] = [];
    items.forEach((p: Plan) => {
      const el = cardRefs.current.get(p.id);
      if (!el) return;
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const planId = (entry.target as HTMLElement).dataset?.planId as string | undefined;
            if (!planId || viewedRef.current.has(planId)) return;
            if (entry.isIntersecting) {
              timers[planId] = setTimeout(() => {
                viewedRef.current.add(planId);
                trackPricingCardView(planId);
              }, 500);
            } else if (timers[planId]) {
              clearTimeout(timers[planId]);
              delete timers[planId];
            }
          });
        },
        { threshold: 0.5, rootMargin: '0px' }
      );
      observer.observe(el);
      observers.push(observer);
    });
    return () => {
      observers.forEach((o) => o.disconnect());
      Object.values(timers).forEach(clearTimeout);
    };
  }, [items]);

  const handleCardClick = (p: Plan) => {
    if (variant === 'landing') return;
    onCardFocus?.(p.id);
  };

  const renderButton = (p: Plan) => {
    if (variant === 'landing') {
      return (
        <Link
          href="/pricing"
          className="w-full py-3 rounded-xl font-semibold text-sm transition-all text-center block bg-gradient-to-t from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white border border-purple-500/50"
          onClick={(e) => e.stopPropagation()}
        >
          View pricing
        </Link>
      );
    }
    // No button when logged out on pricing page
    if (!user) return null;
    const disabled = !!purchasingProduct || user.hasValidCard !== true;
    const isPurchasing = purchasingProduct === p.id;
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(p.id);
        }}
        disabled={disabled}
        className={cn(
          'w-full py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-70 disabled:cursor-not-allowed',
          (p.featured || (variant === 'app' && focusedPlan === p.id))
            ? 'bg-white text-purple-600 hover:bg-white/95'
            : 'bg-slate-800 border border-slate-600 text-white hover:bg-slate-700 hover:border-slate-500'
        )}
      >
        {isPurchasing ? 'Processing…' : p.cta}
      </button>
    );
  };

  return (
    <div
      ref={scrollRef}
      className={cn(
        'grid gap-4 lg:gap-6',
        scrollOnMobile
          ? 'flex lg:grid overflow-x-auto overflow-y-visible snap-x snap-mandatory overscroll-x-contain lg:overflow-visible lg:grid-cols-2 xl:grid-cols-5 pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 video-gallery-scroll'
          : 'lg:grid-cols-2 xl:grid-cols-5'
      )}
    >
      {items.map((p: Plan, index: number) => (
        <motion.div
          key={p.id}
          ref={(el) => {
            if (el) cardRefs.current.set(p.id, el);
          }}
          data-plan-id={p.id}
          custom={index}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-50px' }}
          variants={cardVariants}
          onClick={() => handleCardClick(p)}
          animate={
            variant === 'app' && focusedPlan === p.id
              ? { scale: 1.02, y: -4, boxShadow: '0 20px 40px -12px rgba(168, 85, 247, 0.35), 0 0 0 2px rgba(192, 132, 252, 0.5)' }
              : { scale: 1, y: 0, boxShadow: '0 0 0 0 rgba(0,0,0,0)' }
          }
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className={cn(
            'cursor-pointer',
            scrollOnMobile && 'flex-shrink-0 w-[min(260px,78vw)] lg:w-auto snap-center aspect-[9/16]'
          )}
        >
          <Card
            className={cn(
              'relative overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1 h-full flex flex-col',
              variant === 'app' && focusedPlan === p.id
                ? 'border-purple-500 bg-gradient-to-br from-purple-600/80 to-violet-700/80 shadow-[0_0_40px_-8px_rgba(147,51,234,0.4)]'
                : p.featured
                  ? 'border-purple-500/50 shadow-[0_0_40px_-8px_rgba(147,51,234,0.4)] bg-gradient-to-br from-purple-900/60 via-slate-900 to-slate-900'
                  : 'border-slate-700/80 hover:border-slate-600 bg-slate-900/80'
            )}
          >
            <CardHeader className={cn('pb-2 flex-shrink-0', scrollOnMobile && 'p-4')}>
              {p.featured && (
                <span className="text-[10px] font-semibold text-purple-300 uppercase tracking-wider mb-2">
                  Most popular
                </span>
              )}
              <h3 className={cn('font-bold text-white', scrollOnMobile ? 'text-lg' : 'text-xl')}>{p.name}</h3>
              <div className="flex items-baseline gap-1 mt-2">
                <span className={cn('font-bold text-white', scrollOnMobile ? 'text-2xl' : 'text-3xl')}>${p.price}</span>
                <span className="text-slate-400 text-sm">{p.period}</span>
              </div>
              <p className={cn('text-slate-400 mt-2', scrollOnMobile ? 'text-xs line-clamp-2' : 'text-sm')}>{p.description}</p>
              <p className="text-slate-500 text-xs mt-1">{p.credits} credits</p>
            </CardHeader>
            <CardContent className={cn('pt-2 flex-1 min-h-0 overflow-y-auto', scrollOnMobile && 'p-4 pt-0')}>
              {(() => {
                const btn = renderButton(p);
                return btn && <div className="mb-4">{btn}</div>;
              })()}
              <div className="space-y-2 pt-3 border-t border-slate-700/80">
                {p.features.slice(0, 4).map((f, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-purple-500/60 flex-shrink-0" />
                    <span className="text-sm text-slate-300">{f}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
