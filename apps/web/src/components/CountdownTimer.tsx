'use client';

import { useState, useEffect } from 'react';
import { getLaunchDate, shouldShowCountdown } from '@/config/launch';

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });
  const [isLaunched, setIsLaunched] = useState(false);

  useEffect(() => {
    if (!shouldShowCountdown()) {
      setIsLaunched(true);
      return;
    }

    const calculateTimeLeft = (): TimeLeft => {
      const launchDate = getLaunchDate();
      const now = new Date().getTime();
      const difference = launchDate.getTime() - now;

      if (difference <= 0) {
        setIsLaunched(true);
        return { days: 0, hours: 0, minutes: 0, seconds: 0 };
      }

      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        minutes: Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60)),
        seconds: Math.floor((difference % (1000 * 60)) / 1000),
      };
    };

    // Calculate immediately
    setTimeLeft(calculateTimeLeft());

    // Update every second
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  if (isLaunched || !shouldShowCountdown()) {
    return null;
  }

  return (
    <div className="mb-6">
      <p className="text-xs sm:text-sm text-slate-400 mb-3 text-center">
        Launching in:
      </p>
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {[
          { label: 'Days', value: timeLeft.days },
          { label: 'Hours', value: timeLeft.hours },
          { label: 'Minutes', value: timeLeft.minutes },
          { label: 'Seconds', value: timeLeft.seconds },
        ].map((item, index) => (
          <div
            key={index}
            className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 sm:p-4 text-center"
          >
            <div className="text-2xl sm:text-3xl font-bold text-white mb-1">
              {String(item.value).padStart(2, '0')}
            </div>
            <div className="text-xs sm:text-sm text-slate-400 uppercase tracking-wider">
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

