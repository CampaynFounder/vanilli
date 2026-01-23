'use client';

import { useState } from 'react';
import { useSignupModal } from '@/hooks/useSignupModal';

// Inline the music calculation logic for now
function calculateVideoSeconds(bpm: number, bars: number): number {
  const beatsPerBar = 4; // Standard 4/4 time
  const secondsPerBeat = 60 / bpm;
  const exactSeconds = (bars * beatsPerBar * secondsPerBeat);
  return Math.ceil(exactSeconds);
}

function getPartName(bars: number): string {
  if (bars <= 4) return 'Short Hook';
  if (bars <= 8) return 'Hook';
  if (bars <= 16) return 'Verse';
  if (bars <= 24) return 'Full Verse';
  return 'Extended Section';
}

export function Calculator() {
  const [bpm, setBpm] = useState(140);
  const [bars, setBars] = useState(8);
  const { showModal } = useSignupModal();

  const handlePreLaunchLink = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    showModal();
  };

  const duration = calculateVideoSeconds(bpm, bars);
  const partName = getPartName(bars);
  const vannilliCost = duration * 0.25; // Artist tier rate

  // Traditional cost breakdown: $7,500 video + $2,500 styling = $10,000 for 40 bars
  // Per bar: $187.50 video + $62.50 styling = $250 per bar
  const videoCostPerBar = 7500 / 40; // $187.50 per bar
  const stylingCostPerBar = 2500 / 40; // $62.50 per bar
  const traditionalVideoCost = bars * videoCostPerBar;
  const traditionalStylingCost = bars * stylingCostPerBar;
  const traditionalCost = traditionalVideoCost + traditionalStylingCost;

  return (
    <div className="bg-slate-900/50 backdrop-blur-sm p-8 lg:p-12 rounded-xl border border-slate-800">
      <div className="grid lg:grid-cols-2 gap-12">
        {/* Input Section */}
        <div className="space-y-8">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-4">
              Your Track&apos;s BPM
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="60"
                max="200"
                value={bpm}
                onChange={(e) => setBpm(parseInt(e.target.value))}
                className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <div className="text-4xl font-bold gradient-text w-24 text-right">
                {bpm}
              </div>
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-2">
              <span>60 (Slow)</span>
              <span>200 (Fast)</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-4">
              Number of Bars
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[4, 8, 16, 32].map((value) => (
                <button
                  key={value}
                  onClick={() => setBars(value)}
                  className={`py-4 px-3 sm:px-4 rounded-xl text-sm sm:text-base font-semibold transition-all min-h-[48px] flex items-center justify-center ${
                    bars === value
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/50'
                      : 'bg-slate-900/50 backdrop-blur-sm text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="mt-4 text-center flex flex-col sm:flex-row items-center justify-center gap-2">
              <input
                type="number"
                min="1"
                max="32"
                value={bars}
                onChange={(e) => setBars(parseInt(e.target.value) || 1)}
                className="w-24 px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-center text-sm sm:text-base font-semibold text-white focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[48px]"
              />
              <span className="text-xs sm:text-sm text-slate-400">bars (1-32)</span>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-purple-500/20 via-pink-500/20 to-orange-500/20 p-6 rounded-xl border border-slate-800">
            <div className="text-xs font-semibold text-purple-400 mb-2 tracking-wider">YOUR VIDEO</div>
            <div className="text-3xl font-bold text-white mb-1">
              {duration} seconds
            </div>
            <div className="text-lg text-slate-300">{partName}</div>
          </div>

          <div className="space-y-4">
            <div className="p-5 bg-red-500/10 rounded-xl border border-red-500/20">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-sm text-slate-400 mb-1">Traditional Studio</div>
                  <div className="text-2xl font-bold text-red-400">
                    ${traditionalCost.toFixed(0)}
                  </div>
                </div>
                <div className="text-4xl">😰</div>
              </div>
              <div className="pt-3 border-t border-red-500/20 space-y-2">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Video, Edit, Post Production:</span>
                  <span className="text-red-300">${traditionalVideoCost.toFixed(0)}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Clothes, Accessories, Styling:</span>
                  <span className="text-red-300">${traditionalStylingCost.toFixed(0)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-5 bg-green-500/10 rounded-xl border border-green-500/20">
              <div>
                <div className="text-sm text-slate-400 mb-1">Vannilli (Artist Tier)</div>
                <div className="text-2xl font-bold text-green-400">
                  ${vannilliCost.toFixed(2)}
                </div>
              </div>
              <div className="text-4xl">🚀</div>
            </div>
          </div>

          <div className="p-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl text-center">
            <div className="text-sm opacity-90 mb-2">You Save</div>
            <div className="text-4xl font-bold text-white mb-1">
              ${(traditionalCost - vannilliCost).toFixed(0)}
            </div>
            <div className="text-sm opacity-90">
              ({((1 - vannilliCost / traditionalCost) * 100).toFixed(0)}% less)
            </div>
          </div>

          <a
            href="#"
            onClick={handlePreLaunchLink}
            className="block w-full py-3.5 sm:py-4 bg-white text-slate-950 text-sm sm:text-base font-semibold rounded-xl hover:bg-slate-100 transition-all text-center min-h-[48px] flex items-center justify-center cursor-pointer"
          >
            Visualize It Now →
          </a>
        </div>
      </div>
    </div>
  );
}
