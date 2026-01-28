'use client';

import { useState, useRef } from 'react';
import { GlassCard } from '../ui/GlassCard';

interface TutorialCard {
  id: string;
  title: string;
  icon: string;
  content: React.ReactNode;
}

interface DirectorTrainingTutorialProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function DirectorTrainingTutorial({ onComplete, onSkip }: DirectorTrainingTutorialProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [promptData, setPromptData] = useState({
    songGenre: '',
    movementStyle: '',
    backgroundAction: 'dancing',
  });

  const cards: TutorialCard[] = [
    {
      id: 'intro',
      title: 'Welcome, Director! 🎬',
      icon: '🎬',
      content: (
        <div className="space-y-4">
          <p className="text-slate-300 text-sm leading-relaxed">
            Great videos have <strong className="text-white">multiple scenes</strong> and <strong className="text-white">multiple angles</strong>. 
            Follow these tips to create a strong video that gets your AI Artist signed and gets you the bag.
          </p>
          <p className="text-purple-400 text-sm font-semibold">
            Swipe through to learn the secrets of professional tracking videos.
          </p>
        </div>
      ),
    },
    {
      id: 'director-prep',
      title: "Director's Prep",
      icon: '🎯',
      content: (
        <div className="space-y-4">
          <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-4">
            <h4 className="text-white font-semibold mb-2 text-sm">The Pre-Roll & Trim Method</h4>
            <p className="text-slate-300 text-xs mb-3">
              This ensures the AI has enough buffer to "lock onto" your face before the first phoneme hits.
            </p>
            <div className="space-y-2 text-xs text-slate-300">
              <div className="flex items-start gap-2">
                <span className="text-purple-400 font-bold">1.</span>
                <span><strong className="text-white">Start Recording:</strong> Press record <em>before</em> the music starts.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-400 font-bold">2.</span>
                <span><strong className="text-white">Count Down:</strong> Say "3, 2, 1" silently, then play the part of the music the AI artist will perform as you lip sync the facial movements for training.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-400 font-bold">3.</span>
                <span><strong className="text-white">The Trim:</strong> Cut the video to 1-2 seconds before you start performing.</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-purple-500/20">
              <p className="text-purple-300 text-xs font-semibold">
                💡 Why? This 2-second "Silent Buffer" allows the AI to map your facial structure so the first word is frame-perfect.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'visual-mastery',
      title: 'Visual & Phoneme Mastery',
      icon: '📸',
      content: (
        <div className="space-y-4">
          <p className="text-slate-300 text-sm mb-4">
            Use these <strong className="text-white">"Big Three" angles</strong> for professional results:
          </p>
          
          <div 
            className={`bg-slate-800/50 border rounded-lg p-4 transition-all ${expandedCard === 'frontal' ? 'border-purple-500' : 'border-slate-700'}`}
            onClick={() => setExpandedCard(expandedCard === 'frontal' ? null : 'frontal')}
          >
            <div className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📷</span>
                <div>
                  <h4 className="text-white font-semibold text-sm">The Frontal</h4>
                  <p className="text-slate-400 text-xs">Eye-level, centered, well-lit face</p>
                </div>
              </div>
              <span className="text-purple-400">{expandedCard === 'frontal' ? '−' : '+'}</span>
            </div>
            {expandedCard === 'frontal' && (
              <p className="text-slate-300 text-xs mt-3 pt-3 border-t border-slate-700">
                Essential for 1:1 lip-sync accuracy. Keep your face centered and well-lit.
              </p>
            )}
          </div>

          <div 
            className={`bg-slate-800/50 border rounded-lg p-4 transition-all ${expandedCard === 'profile' ? 'border-purple-500' : 'border-slate-700'}`}
            onClick={() => setExpandedCard(expandedCard === 'profile' ? null : 'profile')}
          >
            <div className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-3">
                <span className="text-2xl">👤</span>
                <div>
                  <h4 className="text-white font-semibold text-sm">The Side Profile</h4>
                  <p className="text-slate-400 text-xs">45-degree turn</p>
                </div>
              </div>
              <span className="text-purple-400">{expandedCard === 'profile' ? '−' : '+'}</span>
            </div>
            {expandedCard === 'profile' && (
              <p className="text-slate-300 text-xs mt-3 pt-3 border-t border-slate-700">
                Teaches the AI the 3D depth of your jawline for realistic side-angle lip-sync.
              </p>
            )}
          </div>

          <div 
            className={`bg-slate-800/50 border rounded-lg p-4 transition-all ${expandedCard === 'performance' ? 'border-purple-500' : 'border-slate-700'}`}
            onClick={() => setExpandedCard(expandedCard === 'performance' ? null : 'performance')}
          >
            <div className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎭</span>
                <div>
                  <h4 className="text-white font-semibold text-sm">The Performance</h4>
                  <p className="text-slate-400 text-xs">Full-body, elbows away from torso</p>
                </div>
              </div>
              <span className="text-purple-400">{expandedCard === 'performance' ? '−' : '+'}</span>
            </div>
            {expandedCard === 'performance' && (
              <p className="text-slate-300 text-xs mt-3 pt-3 border-t border-slate-700">
                Prevents "limb-melting" by keeping your silhouette clear. Keep arms away from your body.
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'pronunciation',
      title: 'Pronunciation Checklist',
      icon: '🗣️',
      content: (
        <div className="space-y-4">
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-4">
            <p className="text-amber-300 font-semibold text-sm mb-2">
              The "M-O-P" Rule: Over-exaggerate your words
            </p>
            <p className="text-slate-300 text-xs mb-3">
              VANNILLI doesn't hear, it <strong className="text-white">sees</strong>. If you mumble, the AI artist will look like they're just chewing gum. Over-act the words!
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-amber-400 font-bold text-lg">M</span>
                <span className="text-slate-300">Press lips <strong className="text-white">firmly together</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-amber-400 font-bold text-lg">O</span>
                <span className="text-slate-300">Exaggerate the <strong className="text-white">circle shape</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-amber-400 font-bold text-lg">P</span>
                <span className="text-slate-300">Make a visible <strong className="text-white">"pop"</strong> with your lips</span>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'background',
      title: 'Silent Background',
      icon: '🎥',
      content: (
        <div className="space-y-4">
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
            <h4 className="text-white font-semibold mb-2 text-sm">Directing the Crowd</h4>
            <p className="text-slate-300 text-xs mb-3">
              If you have people behind you in the VANNILLI video, tell them to:
            </p>
            <ul className="space-y-2 text-xs text-slate-300 mb-3">
              <li className="flex items-start gap-2">
                <span className="text-blue-400">•</span>
                <span>Clap, cheer, or dance with their <strong className="text-white">mouths closed</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-400">•</span>
                <span>If they sing along, the AI might give them your voice</span>
              </li>
            </ul>
            <p className="text-blue-300 text-xs font-semibold">
              💡 Pro Tip: Keep the background "Silent but High-Energy" for a cinematic look.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'prompt-generator',
      title: 'Generate Your Prompt',
      icon: '✨',
      content: (
        <div className="space-y-4">
          <p className="text-slate-300 text-sm mb-4">
            Fill in these details to generate a sample Vannilli prompt:
          </p>
          
          <div className="space-y-3">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Song Genre</label>
              <input
                type="text"
                value={promptData.songGenre}
                onChange={(e) => setPromptData({ ...promptData, songGenre: e.target.value })}
                placeholder="e.g., Hip-Hop, Pop, R&B"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Movement Style</label>
              <input
                type="text"
                value={promptData.movementStyle}
                onChange={(e) => setPromptData({ ...promptData, movementStyle: e.target.value })}
                placeholder="e.g., Smooth, Energetic, Laid-back"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Background Action</label>
              <select
                value={promptData.backgroundAction}
                onChange={(e) => setPromptData({ ...promptData, backgroundAction: e.target.value })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500"
              >
                <option value="dancing">Dancing</option>
                <option value="cheering">Cheering</option>
                <option value="standing">Standing</option>
              </select>
            </div>
          </div>

          {promptData.songGenre && promptData.movementStyle && (
            <div className="mt-4 bg-purple-900/20 border border-purple-500/30 rounded-lg p-4">
              <p className="text-purple-300 text-xs font-semibold mb-2">Your Generated Prompt:</p>
              <div className="bg-slate-900/50 rounded p-3 text-xs text-slate-300 font-mono leading-relaxed">
                [AI Image Subject] performing {promptData.songGenre} with {promptData.movementStyle} movement style. High-fidelity lip-sync following the reference tracking video. PRIMARY FOCUS on lead subject's facial expressions and mouth movement. BACKGROUND SUBJECTS: {promptData.backgroundAction} with closed mouths and bokeh blur. No secondary lip-sync. Shot on 35mm, cinematic lighting, 8k.
              </div>
              <button
                onClick={async (e) => {
                  const prompt = `[AI Image Subject] performing ${promptData.songGenre} with ${promptData.movementStyle} movement style. High-fidelity lip-sync following the reference tracking video. PRIMARY FOCUS on lead subject's facial expressions and mouth movement. BACKGROUND SUBJECTS: ${promptData.backgroundAction} with closed mouths and bokeh blur. No secondary lip-sync. Shot on 35mm, cinematic lighting, 8k.`;
                  try {
                    await navigator.clipboard.writeText(prompt);
                    // Show temporary success message
                    const btn = e.currentTarget;
                    const originalText = btn.textContent;
                    if (btn.textContent) {
                      btn.textContent = '✓ Copied!';
                    }
                    btn.classList.add('bg-green-600');
                    setTimeout(() => {
                      if (btn.textContent && originalText) {
                        btn.textContent = originalText;
                      }
                      btn.classList.remove('bg-green-600');
                    }, 2000);
                  } catch (err) {
                    // Fallback for older browsers
                    const textArea = document.createElement('textarea');
                    textArea.value = prompt;
                    textArea.style.position = 'fixed';
                    textArea.style.opacity = '0';
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    const btn = e.currentTarget;
                    const originalText = btn.textContent;
                    if (btn.textContent) {
                      btn.textContent = '✓ Copied!';
                    }
                    btn.classList.add('bg-green-600');
                    setTimeout(() => {
                      if (btn.textContent && originalText) {
                        btn.textContent = originalText;
                      }
                      btn.classList.remove('bg-green-600');
                    }, 2000);
                  }
                }}
                className="mt-3 w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors text-sm"
              >
                Copy Prompt
              </button>
            </div>
          )}
        </div>
      ),
    },
  ];

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const scrollLeft = scrollContainerRef.current.scrollLeft;
    const cardWidth = scrollContainerRef.current.clientWidth;
    const index = Math.round(scrollLeft / cardWidth);
    setCurrentIndex(index);
  };

  const scrollToCard = (index: number) => {
    if (!scrollContainerRef.current) return;
    const cardWidth = scrollContainerRef.current.clientWidth;
    scrollContainerRef.current.scrollTo({
      left: index * cardWidth,
      behavior: 'smooth',
    });
  };

  const isLastCard = currentIndex === cards.length - 1;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <h2 className="text-white font-bold text-lg">Director Training</h2>
        <button
          onClick={onSkip}
          className="text-slate-400 hover:text-white text-sm transition-colors"
        >
          Skip
        </button>
      </div>

      {/* Carousel */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex h-full">
          {cards.map((card) => (
            <div
              key={card.id}
              className="w-full flex-shrink-0 snap-start px-4 py-6 flex items-center justify-center"
              style={{ minWidth: '100%' }}
            >
              <GlassCard className="w-full max-w-md p-6 max-h-[calc(80vh-120px)] overflow-y-auto">
                <div className="text-center mb-4">
                  <div className="text-5xl mb-3">{card.icon}</div>
                  <h3 className="text-xl font-bold text-white mb-2">{card.title}</h3>
                </div>
                <div className="text-sm">{card.content}</div>
              </GlassCard>
            </div>
          ))}
        </div>
      </div>

      {/* Footer with dots and button */}
      <div className="p-4 border-t border-slate-800">
        {/* Dots indicator */}
        <div className="flex justify-center gap-2 mb-4">
          {cards.map((_, index) => (
            <button
              key={index}
              onClick={() => scrollToCard(index)}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentIndex ? 'bg-purple-500 w-8' : 'bg-slate-700'
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        {/* Action button */}
        {isLastCard ? (
          <button
            onClick={onComplete}
            className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-lg transition-all shadow-lg"
          >
            Start Creating 🚀
          </button>
        ) : (
          <button
            onClick={() => scrollToCard(currentIndex + 1)}
            className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
