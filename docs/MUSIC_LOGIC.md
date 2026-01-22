# Music Logic: BPM to Video Duration Conversion

**The Secret Sauce of Vannilli**

This document defines how we convert musical terms (BPM, bars, measures) into video duration and cost. This abstraction is core to our value proposition: **musicians pay for bars, not compute seconds**.

## Core Formula

### Basic Conversion

```
Duration (seconds) = (Bars × Beats per Bar × 60) / BPM
```

**Standard Assumptions**:
- **Time Signature**: 4/4 (four beats per bar)
- **Note Resolution**: Quarter note gets the beat
- **Rounding**: Always round UP to nearest second

### Example Calculations

#### Example 1: Hip-Hop Hook (140 BPM, 8 Bars)

```
Duration = (8 bars × 4 beats/bar × 60 sec/min) / 140 BPM
Duration = (32 beats × 60) / 140
Duration = 1920 / 140
Duration = 13.71 seconds
→ Round up to 14 seconds
```

**Cost Breakdown**:
- Kling API Cost: 14s × $0.07 = $0.98
- Artist Tier: 14s × $0.25 = $3.50 charged
- **Margin**: $3.50 - $0.98 = **$2.52 (72%)**

#### Example 2: Pop Chorus (120 BPM, 16 Bars)

```
Duration = (16 bars × 4 beats/bar × 60 sec/min) / 120 BPM
Duration = (64 beats × 60) / 120
Duration = 3840 / 120
Duration = 32 seconds (exact)
```

**Cost Breakdown**:
- Kling API Cost: 32s × $0.07 = $2.24
- Label Tier: 32s × $0.15 = $4.80 charged
- **Margin**: $4.80 - $2.24 = **$2.56 (53%)**

#### Example 3: EDM Drop (128 BPM, 4 Bars)

```
Duration = (4 bars × 4 beats/bar × 60 sec/min) / 128 BPM
Duration = (16 beats × 60) / 128
Duration = 960 / 128
Duration = 7.5 seconds
→ Round up to 8 seconds
```

**Cost Breakdown**:
- Kling API Cost: 8s × $0.07 = $0.56
- Open Mic: 8s × $0.35 = $2.80 charged
- **Margin**: $2.80 - $0.56 = **$2.24 (80%)**

## TypeScript Implementation

### Core Calculator Module

**Location**: `/packages/music-calculator/src/index.ts`

```typescript
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
 * @param bpm - Beats per minute (60-200)
 * @param bars - Number of bars/measures (1-32)
 * @param timeSignature - Time signature (defaults to 4/4)
 * @returns Duration in seconds (rounded up)
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
 * Calculate the cost in credits for a video generation
 * 
 * @param durationSeconds - Video duration in seconds
 * @param tier - User's subscription tier
 * @param creditsRemaining - User's current credit balance
 * @returns Cost breakdown
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

export const KLING_COST_PER_SEC = 0.07;

export const TIER_RATES = {
  free: { rate: 0, included: 3, watermark: true },
  open_mic: { rate: 0.35, included: 0, watermark: false },
  indie_artist: { rate: 0.30, included: 50, watermark: false },
  artist: { rate: 0.25, included: 80, watermark: false },
  label: { rate: 0.15, included: 333, watermark: false },
} as const;

export type UserTier = keyof typeof TIER_RATES;

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
    klingCost,
    userCost,
    margin,
    marginPercent,
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
 * Get user-friendly description of duration
 * 
 * @param bars - Number of bars
 * @returns Human-readable description
 */
export function getPartName(bars: number): string {
  if (bars <= 4) return 'Short Hook';
  if (bars <= 8) return 'Hook';
  if (bars <= 16) return 'Verse';
  if (bars <= 24) return 'Full Verse';
  return 'Extended Section';
}
```

### Example Usage in API

```typescript
// In Cloudflare Worker: /api/calculate-duration
import { calculateVideoSeconds, calculateCost, getPartName } from '@vannilli/music-calculator';

export async function handleCalculateDuration(request: Request, env: Env) {
  const { bpm, bars } = await request.json();
  
  // Calculate duration
  const durationSeconds = calculateVideoSeconds(bpm, bars);
  
  // Get user's tier and credits from database
  const user = await getUserFromAuth(request, env);
  const cost = calculateCost(durationSeconds, user.tier, user.creditsRemaining);
  
  return Response.json({
    bpm,
    bars,
    durationSeconds,
    partName: getPartName(bars),
    cost: {
      credits: durationSeconds,
      dollars: cost.userCost,
      sufficientCredits: cost.sufficientCredits,
      creditsAfter: cost.creditsAfter,
    },
    message: cost.sufficientCredits 
      ? `This ${getPartName(bars)} will use ${durationSeconds} seconds of credit`
      : `Insufficient credits. You need ${durationSeconds - user.creditsRemaining} more seconds.`,
  });
}
```

## Edge Cases & Handling

### 1. Non-Standard Time Signatures

**Problem**: Not all music is in 4/4 time.

**Solution**: Support common time signatures (3/4, 6/8, 2/2) but default to 4/4.

```typescript
// Waltz in 3/4
const waltzDuration = calculateVideoSeconds(180, 8, TIME_SIGNATURES.WALTZ);
// (8 bars × 3 beats/bar × 60) / 180 BPM = 8 seconds
```

**UI Decision**: Hide time signature selector in v1. 95% of music is 4/4. Add in v2 based on user requests.

### 2. Tempo Changes

**Problem**: Some songs have tempo changes mid-song (ritardando, accelerando).

**Solution**: Not supported in v1. User must choose the primary BPM and accept slight sync drift.

**Future Enhancement**: Allow multiple BPM sections with timestamps.

### 3. Triplets & Swing

**Problem**: Swing timing divides beats unevenly (2:1 ratio instead of 1:1).

**Solution**: Swing is a performance style, not a timing change. BPM remains the same.

### 4. Very Slow/Fast BPMs

**Constraints**:
- **Min BPM**: 60 (Ambient/Drone)
- **Max BPM**: 200 (Drum & Bass)

**Reasoning**: Outside this range, the video length becomes impractical:
- <60 BPM: Videos become too long (>45s for 8 bars)
- >200 BPM: Videos become too short (<5s for 8 bars, hard to lip-sync)

### 5. Maximum Video Length

**Problem**: Kling has a max generation length (likely 10-15 seconds per call).

**Solution**: For videos >10 seconds, we:
1. Split into multiple 10s chunks
2. Generate each chunk separately
3. Stitch together server-side using FFmpeg
4. Charge user for total duration

**Implementation**: Phase 2 (post-MVP)

### 6. Fractional Bars

**Problem**: User wants 8.5 bars (pickup measure).

**Solution**: Allow 0.5 bar increments in UI:
- 0.5 bars = 2 beats (half measure)
- 1.5 bars = 6 beats
- etc.

```typescript
// Modified calculation
const totalBeats = (bars + fractionalBars) * timeSignature.beatsPerBar;
```

## Competitive Analysis: Why This Matters

### Traditional Video Production

**Studio Cost**: $5,000 - $20,000 per music video  
**Timeline**: 2-4 weeks  
**Barrier**: Requires production team, location, equipment

### Generic AI Tools (Runway, Pika)

**Interface**: "Generate 10 seconds of video"  
**Problem**: Musicians think in bars, not seconds  
**Disconnect**: User must manually calculate duration for their song

### Vannilli's Approach

**Interface**: "Generate 8 bars at 140 BPM"  
**Advantage**: Speaks the user's language  
**Automation**: We handle the conversion and ensure perfect looping

**Example Scenario**:
- User has a 140 BPM hook (8 bars)
- Traditional AI: "Uh... how many seconds is that?"
- **Vannilli**: "That's a Hook section, 14 seconds. It'll cost $3.50."

## Pricing Strategy: Credit Model

### Credits = Seconds

**1 Credit = 1 Second of Video**

This simplification makes billing transparent:
- "You have 80 credits" = "You can generate 80 seconds of video"
- A 14-second video costs 14 credits
- Monthly plans include a credit balance that renews

### Tier Comparison

| Tier | Monthly Cost | Credits Included | Rate/Second | Break-Even Point |
|------|-------------|------------------|-------------|------------------|
| Open Mic | $15 (one-time) | 0 | $0.35 | N/A (pay-as-go) |
| Indie Artist | $15/month | 50 | $0.30 | Deprecated |
| Artist | $20/month | 80 | $0.25 | Use >80s/month |
| Label | $50/month | 333 | $0.15 | Use >333s/month |

**Psychological Pricing**:
- Artist tier at $20 = $0.25/credit is **5× cheaper** than Open Mic
- Label tier at $50 gives 333 credits = **saves artists $83.25** if used fully
- Free tier (3s) is enough to see the magic, but not enough to post

### Rollover Policy

**Credits DO NOT roll over** (except within same billing month).

**Reasoning**:
1. Encourages monthly engagement
2. Prevents credit hoarding
3. Aligns with SaaS subscription models (Spotify, Netflix don't roll over)

**Exception**: "Top Up" credits purchased separately DO roll over (no expiry).

## UI/UX Considerations

### Input Form Design

```
┌─────────────────────────────────────┐
│  New Project                        │
├─────────────────────────────────────┤
│                                     │
│  Track Name: [____________]         │
│                                     │
│  Tempo (BPM): [140] ←slider→       │
│               60 ─────────── 200    │
│                                     │
│  Length: [8] bars                   │
│          ↑ ↓                        │
│                                     │
│  📊 This Hook will be 14 seconds    │
│  💰 Cost: 14 credits ($3.50)        │
│  ✅ You have 66 credits remaining   │
│                                     │
│  [Continue to Upload]               │
└─────────────────────────────────────┘
```

**Real-Time Feedback**:
- As user adjusts BPM slider, duration updates instantly
- Bar counter shows preset options: 4, 8, 16, 32
- Visual indicator shows "Hook", "Verse", "Full Section" labels

### Error Messages

**Insufficient Credits**:
```
❌ Not enough credits
You need 14 credits for this 8-bar Hook, but you only have 5 remaining.

[Top Up Credits] [Upgrade to Artist Tier]
```

**Invalid BPM**:
```
⚠️ BPM must be between 60 and 200
Most music falls between 80-160 BPM. Need help finding your song's BPM?
[Use BPM Detector Tool]
```

## Testing & Validation

### Unit Tests

```typescript
describe('calculateVideoSeconds', () => {
  it('calculates 140 BPM, 8 bars correctly', () => {
    expect(calculateVideoSeconds(140, 8)).toBe(14);
  });

  it('rounds up fractional seconds', () => {
    expect(calculateVideoSeconds(140, 7)).toBe(12); // 11.99... → 12
  });

  it('handles 3/4 waltz time', () => {
    expect(calculateVideoSeconds(180, 8, TIME_SIGNATURES.WALTZ)).toBe(8);
  });

  it('throws error for invalid BPM', () => {
    expect(() => calculateVideoSeconds(300, 8)).toThrow('BPM must be between 60 and 200');
  });
});
```

### Integration Tests

```typescript
describe('Cost Calculation API', () => {
  it('returns correct cost for Artist tier', async () => {
    const response = await fetch('/api/calculate-duration', {
      method: 'POST',
      body: JSON.stringify({ bpm: 140, bars: 8 }),
      headers: { 'Authorization': 'Bearer artist_token' },
    });
    const data = await response.json();
    
    expect(data.durationSeconds).toBe(14);
    expect(data.cost.credits).toBe(14);
    expect(data.cost.dollars).toBe(3.50);
  });
});
```

## Future Enhancements

### V2 Features

1. **Variable BPM**: Support tempo changes (ballad verse → uptempo chorus)
2. **Custom Time Signatures**: Full support for 3/4, 5/4, 6/8, 7/8
3. **Beat Matching**: Auto-detect BPM from uploaded audio
4. **Triplet Support**: More accurate swing calculation
5. **Multi-Section Videos**: Combine verse + chorus in one generation

### V3 Features

1. **MIDI Integration**: Import MIDI file for precise timing
2. **Collaborative Projects**: Multiple artists in one video
3. **Live Performance Sync**: Real-time processing for live shows

---

**This document is living and will be updated as we refine the music logic based on user feedback.**

