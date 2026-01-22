'use client';

import { useState } from 'react';
import { calculateVideoSeconds, getPartName } from '@vannilli/music-calculator';

export function Calculator() {
  const [bpm, setBpm] = useState(140);
  const [bars, setBars] = useState(8);

  const duration = calculateVideoSeconds(bpm, bars);
  const partName = getPartName(bars);
  const traditionalCost = Math.random() * 10000 + 5000; // $5K-$15K
  const vannilliCost = duration * 0.25; // Artist tier rate

  return (
    <div className="glass p-8 rounded-3xl border border-slate-200 shadow-xl">
      <div className="grid md:grid-cols-2 gap-12">
        {/* Input Section */}
        <div className="space-y-8">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Your Track's BPM
            </label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="60"
                max="200"
                value={bpm}
                onChange={(e) => setBpm(parseInt(e.target.value))}
                className="flex-1 h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
              />
              <div className="text-3xl font-bold text-primary-600 w-20 text-right">
                {bpm}
              </div>
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-1">
              <span>60 (Slow)</span>
              <span>200 (Fast)</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Number of Bars
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[4, 8, 16, 32].map((value) => (
                <button
                  key={value}
                  onClick={() => setBars(value)}
                  className={`py-3 px-4 rounded-lg font-semibold transition-all ${
                    bars === value
                      ? 'bg-primary-600 text-white shadow-lg'
                      : 'bg-white text-slate-700 hover:bg-slate-50 border-2 border-slate-200'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="mt-2 text-center">
              <input
                type="number"
                min="1"
                max="32"
                value={bars}
                onChange={(e) => setBars(parseInt(e.target.value) || 1)}
                className="w-24 px-3 py-2 border-2 border-slate-200 rounded-lg text-center font-semibold"
              />
              <span className="ml-2 text-sm text-slate-500">bars (1-32)</span>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-primary-50 to-accent-50 p-6 rounded-2xl border border-primary-100">
            <div className="text-sm font-semibold text-primary-600 mb-1">YOUR VIDEO</div>
            <div className="text-2xl font-bold text-slate-900 mb-3">
              {duration} seconds • {partName}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl border border-red-100">
              <div>
                <div className="text-sm text-slate-600">Traditional Studio</div>
                <div className="text-2xl font-bold text-red-600">
                  ${traditionalCost.toFixed(0)}
                </div>
              </div>
              <div className="text-3xl">😰</div>
            </div>

            <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100">
              <div>
                <div className="text-sm text-slate-600">Vannilli (Artist Tier)</div>
                <div className="text-2xl font-bold text-green-600">
                  ${vannilliCost.toFixed(2)}
                </div>
              </div>
              <div className="text-3xl">🚀</div>
            </div>
          </div>

          <div className="p-4 bg-primary-600 text-white rounded-xl text-center">
            <div className="text-sm opacity-90 mb-1">You Save</div>
            <div className="text-3xl font-bold">
              ${(traditionalCost - vannilliCost).toFixed(0)}
            </div>
            <div className="text-sm opacity-90">
              ({((1 - vannilliCost / traditionalCost) * 100).toFixed(0)}% less)
            </div>
          </div>

          <a
            href="/auth/signup"
            className="block w-full py-4 bg-accent-500 text-white font-semibold rounded-xl hover:bg-accent-600 transition-all text-center shadow-lg hover:shadow-xl"
          >
            Visualize It Now →
          </a>
        </div>
      </div>
    </div>
  );
}

