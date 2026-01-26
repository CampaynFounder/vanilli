'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Calculator } from '@/components/Calculator';
import { VideoGallery } from '@/components/VideoGallery';
import { useSignupModal } from '@/hooks/useSignupModal';

export default function HomePage() {
  const { showModal } = useSignupModal();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && ref.trim()) {
      localStorage.setItem('vannilli_referral_code', ref.trim());
    }
  }, []);

  const handlePreLaunchLink = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    showModal();
  };

  return (
    <main className="min-h-screen bg-slate-950">
      {/* Navigation - Kling Style */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center h-full">
              <Link href="/" className="flex items-center h-full">
                <Image
                  src="/logo/logo.png"
                  alt="Vannilli"
                  width={768}
                  height={256}
                  className="h-full w-auto"
                  style={{
                    width: 'auto',
                    height: '100%',
                    objectFit: 'contain',
                  }}
                  priority
                />
              </Link>
            </div>
            <div className="hidden md:flex items-center gap-6 lg:gap-8">
              <Link href="#gallery" className="text-sm text-slate-400 hover:text-white transition-colors px-2 py-2 min-h-[44px] flex items-center">
                Gallery
              </Link>
              <Link href="#features" className="text-sm text-slate-400 hover:text-white transition-colors px-2 py-2 min-h-[44px] flex items-center">
                Features
              </Link>
              <Link href="#calculator" className="text-sm text-slate-400 hover:text-white transition-colors px-2 py-2 min-h-[44px] flex items-center">
                Calculator
              </Link>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-4">
              <Link
                href="/auth/signin"
                className="text-xs sm:text-sm md:text-base text-slate-400 hover:text-white transition-colors px-2 sm:px-3 py-2 min-h-[44px] flex items-center cursor-pointer whitespace-nowrap"
              >
                Sign In
              </Link>
              <a
                href="#"
                onClick={handlePreLaunchLink}
                className="px-3 py-2 sm:px-4 sm:py-2.5 bg-white text-slate-950 text-xs sm:text-sm md:text-base font-semibold rounded-lg hover:bg-slate-100 transition-all min-h-[44px] flex items-center justify-center cursor-pointer whitespace-nowrap"
              >
                Get Started
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - Kling Pricing Style with Background Image */}
      <section className="relative pt-32 pb-16 px-6 lg:px-8 bg-slate-950 overflow-hidden min-h-[600px]">
        {/* Background Image - z-index 0 */}
        <div 
          className="absolute inset-0 w-full h-full z-0"
          style={{
            backgroundImage: 'url(/images/hero-background.png)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        />
        {/* Dark overlay for WCAG compliance - z-index 1 (reduced opacity for visibility) */}
        <div className="absolute inset-0 bg-slate-950/50 z-[1]" />
        {/* Additional gradient overlay for better text readability - z-index 2 (lighter) */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/50 to-slate-950/60 z-[2]" />
        
        {/* Content with proper z-index */}
        <div className="relative z-[10] max-w-4xl mx-auto text-center space-y-6">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] leading-tight">
            Hyper-Realistic AI Music Videos
          </h1>
          
          <p className="text-xl text-white max-w-2xl mx-auto drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] font-semibold">
            Bring Your AI Artist To Life with Perfect Lip Sync
          </p>

          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center items-stretch sm:items-center pt-4 w-full sm:w-auto">
            <a
              href="#"
              onClick={handlePreLaunchLink}
              className="px-6 py-3.5 sm:py-3 bg-white text-slate-950 text-sm sm:text-base font-semibold rounded-lg hover:bg-slate-100 transition-all shadow-lg min-h-[48px] flex items-center justify-center w-full sm:w-auto cursor-pointer"
            >
              Create My AI Video
            </a>
            <Link
              href="#calculator"
              className="px-6 py-3.5 sm:py-3 bg-white/10 backdrop-blur-sm text-white text-sm sm:text-base font-semibold rounded-lg hover:bg-white/20 transition-all border border-white/20 shadow-lg min-h-[48px] flex items-center justify-center w-full sm:w-auto"
            >
              Try Calculator
            </Link>
          </div>
        </div>
      </section>

      {/* Video Gallery Section - Main Feature (Landscape) */}
      <section id="gallery" className="py-16 px-6 lg:px-8 bg-slate-950">
        <div className="max-w-7xl mx-auto">
          <div className="mb-12 text-center">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-3">
              AI Artist Creator Roster
            </h2>
            <p className="text-base sm:text-lg text-slate-400 max-w-2xl mx-auto">
              Watch real music videos created with perfect lip-sync and talking movements
            </p>
          </div>
          
          <VideoGallery />
        </div>
      </section>

      {/* Features Section - Kling Style Grid */}
      <section id="features" className="py-16 px-6 lg:px-8 bg-slate-950 border-t border-slate-800/50">
        <div className="max-w-7xl mx-auto">
          <div className="mb-12 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
              How It Works
            </h2>
            <p className="text-lg text-slate-400">
              Create professional music videos in 4 simple steps
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                step: '01',
                title: 'Enter Your BPM',
                description: 'Tell us the tempo of your track and how many bars you need.',
                icon: '🎵',
              },
              {
                step: '02',
                title: 'Upload Your Style',
                description: 'Upload an AI-generated image that defines your visual aesthetic.',
                icon: '🎨',
              },
              {
                step: '03',
                title: 'Record Performance',
                description: 'Rap or sing along to your track while we capture your movements.',
                icon: '📹',
              },
              {
                step: '04',
                title: 'Download Video',
                description: 'Get your professional music video in minutes, ready to share.',
                icon: '⬇️',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="bg-slate-900/50 p-6 rounded-xl border border-slate-800 hover:border-slate-700 transition-all"
              >
                <div className="text-4xl mb-4">{item.icon}</div>
                <div className="text-xs font-semibold text-purple-400 mb-2 tracking-wider">
                  STEP {item.step}
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Calculator Section - Kling Style */}
      <section id="calculator" className="py-16 px-6 lg:px-8 bg-slate-950 border-t border-slate-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
              Calculate Your Video Cost
            </h2>
            <p className="text-lg text-slate-400">
              See how much a traditional music video would cost vs. Vannilli
            </p>
          </div>
          
          <Calculator />
        </div>
      </section>

      {/* Stats Section - Kling Style */}
      <section className="py-16 px-6 lg:px-8 bg-slate-950 border-t border-slate-800/50">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { 
                value: '95%', 
                label: 'Cost Savings vs Traditional Studios',
                description: 'Save thousands on music video production',
              },
              { 
                value: '5 min', 
                label: 'Average Generation Time',
                description: 'From recording to final video',
              },
              { 
                value: '98%', 
                label: 'Labels Signing AI Artists by 2030',
                description: 'Record labels say they will sign more AI artists to major deals',
              },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-5xl font-bold gradient-text mb-3">{stat.value}</div>
                <div className="text-lg font-semibold text-white mb-2">{stat.label}</div>
                <div className="text-sm text-slate-400">{stat.description}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section - Kling Style */}
      <section className="py-16 px-6 lg:px-8 bg-slate-950 border-t border-slate-800/50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to Create Your First Video?
          </h2>
          <p className="text-lg text-slate-400 mb-8">
            Get started with one free 3-second generation.
          </p>
          <a
            href="#"
            onClick={handlePreLaunchLink}
            className="inline-block px-6 sm:px-8 py-3.5 sm:py-3 bg-white text-slate-950 text-sm sm:text-base font-semibold rounded-lg hover:bg-slate-100 transition-all min-h-[48px] flex items-center justify-center cursor-pointer"
          >
            Start Creating Now →
          </a>
        </div>
      </section>

      {/* Footer - Kling Style */}
      <footer className="border-t border-slate-800/50 py-12 px-6 lg:px-8 bg-slate-950">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <Link href="/" className="inline-block mb-4">
                <Image
                  src="/logo/logo.png"
                  alt="Vannilli"
                  width={768}
                  height={256}
                  className="h-16 w-auto"
                  style={{
                    width: 'auto',
                    height: '64px',
                    objectFit: 'contain',
                  }}
                />
              </Link>
              <p className="text-slate-500 text-sm">
                Bring Your AI Artists and Music to Life
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold text-white mb-4 text-sm">Product</h3>
              <ul className="space-y-2 text-slate-500 text-sm">
                <li><a href="#" onClick={handlePreLaunchLink} className="hover:text-white transition-colors block py-2 min-h-[44px] flex items-center cursor-pointer">Pricing</a></li>
                <li><a href="#" onClick={handlePreLaunchLink} className="hover:text-white transition-colors block py-2 min-h-[44px] flex items-center cursor-pointer">Showcase</a></li>
                <li><Link href="#calculator" className="hover:text-white transition-colors block py-2 min-h-[44px] flex items-center">Calculator</Link></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-4 text-sm">Company</h3>
              <ul className="space-y-2 text-slate-500 text-sm">
                <li><a href="#" onClick={handlePreLaunchLink} className="hover:text-white transition-colors block py-2 min-h-[44px] flex items-center cursor-pointer">About</a></li>
                <li><a href="#" onClick={handlePreLaunchLink} className="hover:text-white transition-colors block py-2 min-h-[44px] flex items-center cursor-pointer">Blog</a></li>
                <li><a href="#" onClick={handlePreLaunchLink} className="hover:text-white transition-colors block py-2 min-h-[44px] flex items-center cursor-pointer">Contact</a></li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-white mb-4 text-sm">Legal</h3>
              <ul className="space-y-2 text-slate-500 text-sm">
                <li><a href="#" onClick={handlePreLaunchLink} className="hover:text-white transition-colors block py-2 min-h-[44px] flex items-center cursor-pointer">Terms</a></li>
                <li><a href="#" onClick={handlePreLaunchLink} className="hover:text-white transition-colors block py-2 min-h-[44px] flex items-center cursor-pointer">Privacy</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-800/50 text-center text-slate-500 text-sm">
            <p>&copy; 2026 Vannilli. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
