import Link from 'next/link';
import { Calculator } from '@/components/Calculator';

export default function HomePage() {
  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="px-4 py-16 sm:py-24 max-w-7xl mx-auto">
        <div className="text-center space-y-6">
          <h1 className="text-5xl sm:text-7xl font-display font-bold gradient-text">
            Pay for Bars,
            <br />
            Not Compute
          </h1>
          
          <p className="text-xl sm:text-2xl text-slate-600 max-w-2xl mx-auto">
            Transform your music performances into stunning AI-powered videos. 
            Enter your BPM, record your verse, and let Vannilli do the magic.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center pt-6">
            <Link
              href="/auth/signup"
              className="px-8 py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all transform hover:scale-105 shadow-lg hover:shadow-xl"
            >
              Start Creating Free
            </Link>
            <Link
              href="/pricing"
              className="px-8 py-4 bg-white text-primary-600 font-semibold rounded-xl hover:bg-slate-50 transition-all border-2 border-primary-600"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Calculator Section */}
      <section className="px-4 py-16 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-display font-bold text-slate-900 mb-4">
              Calculate Your Video Cost
            </h2>
            <p className="text-lg text-slate-600">
              See how much a traditional music video would cost vs. Vannilli
            </p>
          </div>
          
          <Calculator />
        </div>
      </section>

      {/* How It Works */}
      <section className="px-4 py-16 max-w-7xl mx-auto">
        <h2 className="text-3xl sm:text-4xl font-display font-bold text-center text-slate-900 mb-12">
          Create in 4 Simple Steps
        </h2>

        <div className="grid md:grid-cols-4 gap-8">
          {[
            {
              step: '1',
              title: 'Enter Your BPM',
              description: 'Tell us the tempo of your track and how many bars you need.',
              icon: '🎵',
            },
            {
              step: '2',
              title: 'Upload Your Style',
              description: 'Upload an AI-generated image that defines your visual aesthetic.',
              icon: '🎨',
            },
            {
              step: '3',
              title: 'Record Performance',
              description: 'Rap or sing along to your track while we capture your movements.',
              icon: '📹',
            },
            {
              step: '4',
              title: 'Download Video',
              description: 'Get your professional music video in minutes, ready to share.',
              icon: '⬇️',
            },
          ].map((item) => (
            <div
              key={item.step}
              className="glass p-6 rounded-2xl border border-slate-200 hover:shadow-xl transition-all"
            >
              <div className="text-5xl mb-4">{item.icon}</div>
              <div className="text-sm font-semibold text-primary-600 mb-2">
                STEP {item.step}
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">{item.title}</h3>
              <p className="text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Social Proof */}
      <section className="px-4 py-16 bg-primary-50">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-slate-900 mb-4">
            Join the Next Wave of Music Production
          </h2>
          <p className="text-xl text-slate-600 mb-8">
            MySpace → YouTube → Social Media → AI Twins
          </p>
          
          <div className="grid md:grid-cols-3 gap-8 mt-12">
            {[
              { stat: '72%', label: 'Profit Margin vs Traditional Studios' },
              { stat: '5 min', label: 'Average Video Generation Time' },
              { stat: '$20', label: 'Starting at Artist Tier' },
            ].map((item) => (
              <div key={item.label} className="glass p-8 rounded-2xl">
                <div className="text-5xl font-bold gradient-text mb-2">{item.stat}</div>
                <div className="text-slate-600">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 py-16 max-w-4xl mx-auto text-center">
        <div className="glass p-12 rounded-3xl border border-primary-200">
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-slate-900 mb-4">
            Ready to Create Your First Video?
          </h2>
          <p className="text-lg text-slate-600 mb-8">
            Get started with one free 3-second generation. No credit card required to try.
          </p>
          <Link
            href="/auth/signup"
            className="inline-block px-10 py-5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-all transform hover:scale-105 shadow-lg hover:shadow-xl text-lg"
          >
            Start Creating Now
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-4 py-12 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto grid md:grid-cols-4 gap-8">
          <div>
            <div className="text-2xl font-display font-bold mb-4">Vannilli</div>
            <p className="text-slate-400">
              Democratizing high-end music video production
            </p>
          </div>
          
          <div>
            <h3 className="font-semibold mb-4">Product</h3>
            <ul className="space-y-2 text-slate-400">
              <li><Link href="/pricing">Pricing</Link></li>
              <li><Link href="/showcase">Showcase</Link></li>
              <li><Link href="/calculator">Calculator</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Company</h3>
            <ul className="space-y-2 text-slate-400">
              <li><Link href="/about">About</Link></li>
              <li><Link href="/blog">Blog</Link></li>
              <li><Link href="/contact">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-4">Legal</h3>
            <ul className="space-y-2 text-slate-400">
              <li><Link href="/legal/terms">Terms of Service</Link></li>
              <li><Link href="/legal/privacy">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-slate-800 text-center text-slate-400">
          <p>&copy; 2026 Vannilli. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}

