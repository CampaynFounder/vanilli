import {
  calculateVideoSeconds,
  calculateCost,
  secondsToBars,
  getPartName,
  isValidBPM,
  isValidBars,
  getMaxGenerations,
  TIME_SIGNATURES,
  KLING_COST_PER_SEC,
  type UserTier,
} from './index';

describe('calculateVideoSeconds', () => {
  describe('standard 4/4 time calculations', () => {
    it('calculates 140 BPM, 8 bars correctly', () => {
      // (8 bars × 4 beats/bar × 60 sec/min) / 140 BPM = 13.71... → rounds to 14
      expect(calculateVideoSeconds(140, 8)).toBe(14);
    });

    it('calculates 120 BPM, 16 bars correctly', () => {
      // (16 × 4 × 60) / 120 = 32 (exact)
      expect(calculateVideoSeconds(120, 16)).toBe(32);
    });

    it('calculates 128 BPM, 4 bars correctly', () => {
      // (4 × 4 × 60) / 128 = 7.5 → rounds to 8
      expect(calculateVideoSeconds(128, 4)).toBe(8);
    });

    it('rounds up fractional seconds', () => {
      expect(calculateVideoSeconds(140, 7)).toBe(12); // 11.99... → 12
      expect(calculateVideoSeconds(150, 5)).toBe(8);  // 8 (exact)
    });
  });

  describe('alternative time signatures', () => {
    it('handles 3/4 waltz time', () => {
      // (8 bars × 3 beats/bar × 60) / 180 BPM = 8 seconds
      expect(calculateVideoSeconds(180, 8, TIME_SIGNATURES.WALTZ)).toBe(8);
    });

    it('handles 6/8 compound time', () => {
      // (4 bars × 6 beats/bar × 60) / 120 BPM = 12 seconds
      expect(calculateVideoSeconds(120, 4, TIME_SIGNATURES.COMPOUND)).toBe(12);
    });

    it('handles 2/2 cut time', () => {
      // (8 bars × 2 beats/bar × 60) / 120 BPM = 8 seconds
      expect(calculateVideoSeconds(120, 8, TIME_SIGNATURES.CUT_TIME)).toBe(8);
    });
  });

  describe('edge cases and validation', () => {
    it('throws error for BPM below 60', () => {
      expect(() => calculateVideoSeconds(59, 8)).toThrow('BPM must be between 60 and 200');
    });

    it('throws error for BPM above 200', () => {
      expect(() => calculateVideoSeconds(201, 8)).toThrow('BPM must be between 60 and 200');
    });

    it('throws error for bars below 1', () => {
      expect(() => calculateVideoSeconds(120, 0)).toThrow('Bars must be between 1 and 32');
    });

    it('throws error for bars above 32', () => {
      expect(() => calculateVideoSeconds(120, 33)).toThrow('Bars must be between 1 and 32');
    });

    it('handles minimum BPM (60)', () => {
      expect(calculateVideoSeconds(60, 1)).toBe(4); // (1 × 4 × 60) / 60 = 4
    });

    it('handles maximum BPM (200)', () => {
      expect(calculateVideoSeconds(200, 1)).toBe(2); // (1 × 4 × 60) / 200 = 1.2 → 2
    });

    it('handles minimum bars (1)', () => {
      expect(calculateVideoSeconds(120, 1)).toBe(2); // (1 × 4 × 60) / 120 = 2
    });

    it('handles maximum bars (32)', () => {
      expect(calculateVideoSeconds(120, 32)).toBe(64); // (32 × 4 × 60) / 120 = 64
    });
  });
});

describe('calculateCost', () => {
  const testCases: Array<{
    tier: UserTier;
    duration: number;
    credits: number;
    expected: {
      userRate: number;
      klingCost: number;
      userCost: number;
      sufficientCredits: boolean;
    };
  }> = [
    {
      tier: 'artist',
      duration: 14,
      credits: 80,
      expected: {
        userRate: 0.25,
        klingCost: 0.98,
        userCost: 3.50,
        sufficientCredits: true,
      },
    },
    {
      tier: 'label',
      duration: 32,
      credits: 333,
      expected: {
        userRate: 0.15,
        klingCost: 2.24,
        userCost: 4.80,
        sufficientCredits: true,
      },
    },
    {
      tier: 'open_mic',
      duration: 8,
      credits: 0,
      expected: {
        userRate: 0.35,
        klingCost: 0.56,
        userCost: 2.80,
        sufficientCredits: false,
      },
    },
  ];

  testCases.forEach(({ tier, duration, credits, expected }) => {
    it(`calculates cost correctly for ${tier} tier (${duration}s)`, () => {
      const result = calculateCost(duration, tier, credits);
      
      expect(result.durationSeconds).toBe(duration);
      expect(result.userRate).toBe(expected.userRate);
      expect(result.klingCost).toBe(expected.klingCost);
      expect(result.userCost).toBe(expected.userCost);
      expect(result.sufficientCredits).toBe(expected.sufficientCredits);
      expect(result.creditsAfter).toBe(credits - duration);
    });
  });

  it('calculates margin correctly', () => {
    const result = calculateCost(14, 'artist', 80);
    expect(result.margin).toBeCloseTo(2.52, 2);
    expect(result.marginPercent).toBeCloseTo(72.00, 1);
  });

  it('handles free tier (zero cost)', () => {
    const result = calculateCost(3, 'free', 3);
    expect(result.userCost).toBe(0);
    expect(result.klingCost).toBe(0.21);
    expect(result.margin).toBe(-0.21); // We lose money on free tier
  });

  it('handles insufficient credits', () => {
    const result = calculateCost(10, 'artist', 5);
    expect(result.sufficientCredits).toBe(false);
    expect(result.creditsAfter).toBe(-5);
  });
});

describe('secondsToBars', () => {
  it('converts seconds back to bars accurately', () => {
    expect(secondsToBars(14, 140)).toBe(8);
    expect(secondsToBars(32, 120)).toBe(16);
    expect(secondsToBars(8, 128)).toBe(4.25); // Slight rounding
  });

  it('handles 3/4 time', () => {
    expect(secondsToBars(8, 180, TIME_SIGNATURES.WALTZ)).toBe(8);
  });

  it('rounds to nearest quarter bar', () => {
    expect(secondsToBars(7, 120)).toBe(3.5); // 3.5 bars
    expect(secondsToBars(3, 120)).toBe(1.5); // 1.5 bars
  });
});

describe('getPartName', () => {
  it('returns correct names for different bar counts', () => {
    expect(getPartName(2)).toBe('Short Hook');
    expect(getPartName(4)).toBe('Short Hook');
    expect(getPartName(6)).toBe('Hook');
    expect(getPartName(8)).toBe('Hook');
    expect(getPartName(12)).toBe('Verse');
    expect(getPartName(16)).toBe('Verse');
    expect(getPartName(20)).toBe('Full Verse');
    expect(getPartName(24)).toBe('Full Verse');
    expect(getPartName(32)).toBe('Extended Section');
  });
});

describe('isValidBPM', () => {
  it('returns true for valid BPMs', () => {
    expect(isValidBPM(60)).toBe(true);
    expect(isValidBPM(120)).toBe(true);
    expect(isValidBPM(140)).toBe(true);
    expect(isValidBPM(200)).toBe(true);
  });

  it('returns false for invalid BPMs', () => {
    expect(isValidBPM(59)).toBe(false);
    expect(isValidBPM(201)).toBe(false);
    expect(isValidBPM(120.5)).toBe(false); // Non-integer
  });
});

describe('isValidBars', () => {
  it('returns true for valid bar counts', () => {
    expect(isValidBars(1)).toBe(true);
    expect(isValidBars(8)).toBe(true);
    expect(isValidBars(32)).toBe(true);
  });

  it('returns false for invalid bar counts', () => {
    expect(isValidBars(0)).toBe(false);
    expect(isValidBars(33)).toBe(false);
    expect(isValidBars(8.5)).toBe(false); // Non-integer
  });
});

describe('getMaxGenerations', () => {
  it('calculates maximum generations correctly', () => {
    expect(getMaxGenerations(80, 14)).toBe(5); // 80 / 14 = 5.71... → 5
    expect(getMaxGenerations(333, 32)).toBe(10); // 333 / 32 = 10.40... → 10
    expect(getMaxGenerations(10, 14)).toBe(0); // Not enough credits
  });

  it('handles exact divisions', () => {
    expect(getMaxGenerations(64, 16)).toBe(4); // Exact
  });
});

describe('real-world music scenarios', () => {
  it('handles hip-hop hook (140 BPM, 8 bars)', () => {
    const duration = calculateVideoSeconds(140, 8);
    const cost = calculateCost(duration, 'artist', 80);
    
    expect(duration).toBe(14);
    expect(cost.userCost).toBe(3.50);
    expect(cost.marginPercent).toBeGreaterThan(70); // Good margin
  });

  it('handles pop chorus (120 BPM, 16 bars)', () => {
    const duration = calculateVideoSeconds(120, 16);
    const cost = calculateCost(duration, 'label', 333);
    
    expect(duration).toBe(32);
    expect(cost.userCost).toBe(4.80);
    expect(cost.sufficientCredits).toBe(true);
  });

  it('handles EDM drop (128 BPM, 4 bars)', () => {
    const duration = calculateVideoSeconds(128, 4);
    const cost = calculateCost(duration, 'open_mic', 0);
    
    expect(duration).toBe(8);
    expect(cost.userCost).toBe(2.80);
  });

  it('handles slow ballad (70 BPM, 8 bars)', () => {
    const duration = calculateVideoSeconds(70, 8);
    const cost = calculateCost(duration, 'artist', 80);
    
    expect(duration).toBe(28); // Longer duration for slow tempo
    expect(cost.userCost).toBe(7.00);
  });

  it('handles fast drum and bass (170 BPM, 16 bars)', () => {
    const duration = calculateVideoSeconds(170, 16);
    const cost = calculateCost(duration, 'label', 333);
    
    expect(duration).toBe(23); // Shorter duration for fast tempo
    expect(cost.userCost).toBe(3.45);
  });
});


