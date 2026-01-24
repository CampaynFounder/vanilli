/**
 * @vannilli/music-calculator
 * 
 * Core music logic for converting BPM and bars to video duration.
 * This is the "secret sauce" that makes Vannilli speak musicians' language.
 */

/**
 * Musical time signature
 */
export interface TimeSignature {
  beatsPerBar: number;    // Top number (e.g., 4 in 4/4)
  beatUnit: number;       // Bottom number (e.g., 4 in 4/4 means quarter note)
}

/**
 * Standard time signatures
 */
export const TIME_SIGNATURES = {
  COMMON: { beatsPerBar: 4, beatUnit: 4 } as TimeSignature,      // 4/4 (most music)
  WALTZ: { beatsPerBar: 3, beatUnit: 4 } as TimeSignature,       // 3/4 (waltz)
  CUT_TIME: { beatsPerBar: 2, beatUnit: 2 } as TimeSignature,    // 2/2 (march)
  COMPOUND: { beatsPerBar: 6, beatUnit: 8 } as TimeSignature,    // 6/8 (folk)
} as const;

/**
 * Calculate video duration in seconds from musical parameters
 * 
 * Formula: Duration = (Bars × Beats per Bar × 60) / BPM
 * 
 * @param bpm - Beats per minute (60-200)
 * @param bars - Number of bars/measures (1-32)
 * @param timeSignature - Time signature (defaults to 4/4)
 * @returns Duration in seconds (rounded up)
 * 
 * @example
 * // Hip-hop hook: 140 BPM, 8 bars
 * calculateVideoSeconds(140, 8) // Returns 14 seconds
 * 
 * @example
 * // Waltz: 180 BPM, 8 bars in 3/4 time
 * calculateVideoSeconds(180, 8, TIME_SIGNATURES.WALTZ) // Returns 8 seconds
 */
export function calculateVideoSeconds(
  bpm: number,
  bars: number,
  timeSignature: TimeSignature = TIME_SIGNATURES.COMMON
): number {
  // Validation
  if (bpm < 60 || bpm > 200) {
    throw new Error('BPM must be between 60 and 200');
  }
  if (bars < 1 || bars > 32) {
    throw new Error('Bars must be between 1 and 32');
  }
  if (timeSignature.beatsPerBar < 1 || timeSignature.beatsPerBar > 12) {
    throw new Error('Beats per bar must be between 1 and 12');
  }

  // Calculate exact duration
  const totalBeats = bars * timeSignature.beatsPerBar;
  const secondsPerBeat = 60 / bpm;
  const exactSeconds = totalBeats * secondsPerBeat;

  // Always round up to nearest second (better for looping)
  return Math.ceil(exactSeconds);
}

/**
 * Cost calculation result
 */
export interface CostCalculation {
  durationSeconds: number;
  userRate: number;           // Rate per second for user's tier
  klingCost: number;          // What we pay Kling
  userCost: number;           // What user pays
  margin: number;             // Profit per generation
  marginPercent: number;      // Profit margin percentage
  creditsAfter: number;       // Credits remaining after generation
  sufficientCredits: boolean; // Can user afford this?
}

/**
 * Kling API cost per second (our cost basis)
 */
export const KLING_COST_PER_SEC = 0.07;

/**
 * Tier configuration
 */
export const TIER_RATES = {
  free: { rate: 0, included: 3, watermark: true },
  open_mic: { rate: 0.35, included: 0, watermark: false },
  indie_artist: { rate: 0.30, included: 50, watermark: false },
  artist: { rate: 0.25, included: 80, watermark: false },
  label: { rate: 0.15, included: 333, watermark: false },
} as const;

export type UserTier = keyof typeof TIER_RATES;

/**
 * Calculate the cost in credits for a video generation
 * 
 * @param durationSeconds - Video duration in seconds
 * @param tier - User's subscription tier
 * @param creditsRemaining - User's current credit balance
 * @returns Cost breakdown with margin analysis
 * 
 * @example
 * // 14-second video for Artist tier user with 80 credits
 * calculateCost(14, 'artist', 80)
 * // Returns: {
 * //   durationSeconds: 14,
 * //   userRate: 0.25,
 * //   klingCost: 0.98,
 * //   userCost: 3.50,
 * //   margin: 2.52,
 * //   marginPercent: 72,
 * //   creditsAfter: 66,
 * //   sufficientCredits: true
 * // }
 */
export function calculateCost(
  durationSeconds: number,
  tier: UserTier,
  creditsRemaining: number
): CostCalculation {
  const tierConfig = TIER_RATES[tier];
  const klingCost = durationSeconds * KLING_COST_PER_SEC;
  const userCost = durationSeconds * tierConfig.rate;
  const margin = userCost - klingCost;
  const marginPercent = userCost > 0 ? (margin / userCost) * 100 : 0;
  const creditsAfter = creditsRemaining - durationSeconds;
  const sufficientCredits = creditsAfter >= 0;

  return {
    durationSeconds,
    userRate: tierConfig.rate,
    klingCost: Number(klingCost.toFixed(2)),
    userCost: Number(userCost.toFixed(2)),
    margin: Number(margin.toFixed(2)),
    marginPercent: Number(marginPercent.toFixed(2)),
    creditsAfter,
    sufficientCredits,
  };
}

/**
 * Convert seconds back to bars (for display purposes)
 * 
 * @param seconds - Duration in seconds
 * @param bpm - Beats per minute
 * @param timeSignature - Time signature
 * @returns Number of bars (rounded to nearest 0.25)
 * 
 * @example
 * secondsToBars(14, 140, TIME_SIGNATURES.COMMON) // Returns 8
 */
export function secondsToBars(
  seconds: number,
  bpm: number,
  timeSignature: TimeSignature = TIME_SIGNATURES.COMMON
): number {
  const secondsPerBeat = 60 / bpm;
  const totalBeats = seconds / secondsPerBeat;
  const bars = totalBeats / timeSignature.beatsPerBar;
  
  // Round to nearest quarter bar for display
  return Math.round(bars * 4) / 4;
}

/**
 * Get user-friendly description of musical section
 * 
 * @param bars - Number of bars
 * @returns Human-readable description
 * 
 * @example
 * getPartName(4)  // Returns "Short Hook"
 * getPartName(8)  // Returns "Hook"
 * getPartName(16) // Returns "Verse"
 */
export function getPartName(bars: number): string {
  if (bars <= 4) return 'Short Hook';
  if (bars <= 8) return 'Hook';
  if (bars <= 16) return 'Verse';
  if (bars <= 24) return 'Full Verse';
  return 'Extended Section';
}

/**
 * Validate BPM is within acceptable range
 * 
 * @param bpm - Beats per minute to validate
 * @returns True if valid, false otherwise
 */
export function isValidBPM(bpm: number): boolean {
  return bpm >= 60 && bpm <= 200 && Number.isInteger(bpm);
}

/**
 * Validate bars is within acceptable range
 * 
 * @param bars - Number of bars to validate
 * @returns True if valid, false otherwise
 */
export function isValidBars(bars: number): boolean {
  return bars >= 1 && bars <= 32 && Number.isInteger(bars);
}

/**
 * Get tier information
 * 
 * @param tier - User tier
 * @returns Tier configuration
 */
export function getTierInfo(tier: UserTier) {
  return TIER_RATES[tier];
}

/**
 * Calculate how many videos a user can generate with their current credits
 * 
 * @param creditsRemaining - User's current credit balance
 * @param durationSeconds - Duration of video in seconds
 * @returns Number of videos user can generate
 */
export function getMaxGenerations(creditsRemaining: number, durationSeconds: number): number {
  return Math.floor(creditsRemaining / durationSeconds);
}


