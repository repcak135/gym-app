import { describe, it, expect } from 'vitest'
import {
  epley1RM, suggestProgression, progressionText, buildPrefill, parseWeight,
  formatKg, restRemainingSec, formatClock, workingVolume, formatSetShort, formatSetLine,
} from './progression'

describe('epley1RM', () => {
  it('computes', () => {
    expect(epley1RM(100, 10)).toBe(133.3)
    expect(epley1RM(100, 1)).toBe(100)
    expect(epley1RM(100, 0)).toBe(0)
    expect(epley1RM(0, 5)).toBe(0)
  })
})

describe('suggestProgression', () => {
  const s = (w: number, r: number) => ({ weight: w, reps: r })
  it('increases when all at max', () => {
    expect(suggestProgression([s(35, 12), s(35, 12), s(35, 12)], 8, 12, 2.5))
      .toEqual({ kind: 'increase', weight: 37.5, fromWeight: 35, repsLow: 8, repsHigh: 10 })
  })
  it('adds a rep', () => {
    expect(suggestProgression([s(35, 12), s(35, 10), s(35, 9)], 8, 12, 2.5))
      .toEqual({ kind: 'reps', weight: 35, reps: 10 })
  })
  it('below range goes to repsMin', () => {
    expect(suggestProgression([s(35, 7), s(35, 12)], 8, 12, 2.5))
      .toEqual({ kind: 'reps', weight: 35, reps: 8 })
  })
  it('empty is none', () => {
    expect(suggestProgression([], 8, 12, 2.5)).toEqual({ kind: 'none' })
  })
})

describe('progressionText', () => {
  it('formats', () => {
    expect(progressionText({ kind: 'increase', weight: 37.5, fromWeight: 35, repsLow: 8, repsHigh: 10 }))
      .toBe('Spróbuj 37,5 kg × 8–10 (ostatnio pełny zakres przy 35 kg)')
    expect(progressionText({ kind: 'increase', weight: 102.5, fromWeight: 100, repsLow: 5, repsHigh: 5 }))
      .toBe('Spróbuj 102,5 kg × 5 (ostatnio pełny zakres przy 100 kg)')
    expect(progressionText({ kind: 'reps', weight: 35, reps: 9 }))
      .toBe('Ten sam ciężar 35 kg, spróbuj 9 powt.')
    expect(progressionText({ kind: 'none' })).toBe('')
  })
})

describe('buildPrefill', () => {
  it('copies last working, repeating the last', () => {
    const last = [
      { weight: 30, reps: 10, warmup: false },
      { weight: 32.5, reps: 9, warmup: false },
    ]
    const r = buildPrefill(last, 0, 3, 8)
    expect(r).toHaveLength(3)
    expect(r[2]).toEqual({ weight: 32.5, reps: 9, warmup: false })
  })
  it('copies warm-ups first', () => {
    const last = [
      { weight: 20, reps: 10, warmup: true },
      { weight: 30, reps: 10, warmup: false },
    ]
    const r = buildPrefill(last, 2, 1, 8)
    expect(r.map((x) => x.warmup)).toEqual([true, true, false])
    expect(r[1].weight).toBe(20)
  })
  it('empty history gives zeros', () => {
    expect(buildPrefill([], 1, 2, 8)).toEqual([
      { weight: 0, reps: 8, warmup: true },
      { weight: 0, reps: 8, warmup: false },
      { weight: 0, reps: 8, warmup: false },
    ])
  })
})

describe('parseWeight', () => {
  it('parses', () => {
    expect(parseWeight('37,5')).toBe(37.5)
    expect(parseWeight(' 40 ')).toBe(40)
    expect(parseWeight('abc')).toBeNull()
    expect(parseWeight('')).toBeNull()
    expect(parseWeight('-5')).toBeNull()
  })
})

describe('time helpers', () => {
  it('restRemainingSec', () => {
    expect(restRemainingSec(10000, 2500)).toBe(8)
    expect(restRemainingSec(1000, 5000)).toBe(0)
    expect(restRemainingSec(undefined, 5000)).toBe(0)
  })
  it('formatClock', () => {
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(3725)).toBe('1:02:05')
    expect(formatClock(-4)).toBe('0:00')
  })
})

describe('workingVolume / formatKg', () => {
  it('excludes warm-ups', () => {
    expect(workingVolume([
      { weight: 20, reps: 10, warmup: true },
      { weight: 30, reps: 10, warmup: false },
      { weight: 30, reps: 8, warmup: false },
    ])).toBe(540)
  })
  it('formatKg', () => {
    expect(formatKg(37.5)).toBe('37,5')
    expect(formatKg(40)).toBe('40')
    expect(formatKg(1.25)).toBe('1,25')
  })
})

describe('suggestProgression: rep range from the plan item', () => {
  const sets = (w: number, ...reps: number[]) => reps.map((r) => ({ weight: w, reps: r }))

  it('owner example: 6–10, 30×10 ×3 → 32,5 × 6–8', () => {
    const s = suggestProgression(sets(30, 10, 10, 10), 6, 10, 2.5)
    expect(s).toEqual({ kind: 'increase', weight: 32.5, fromWeight: 30, repsLow: 6, repsHigh: 8 })
    expect(progressionText(s)).toBe('Spróbuj 32,5 kg × 6–8 (ostatnio pełny zakres przy 30 kg)')
  })

  it('heavy 6–8: all at 8 → +step × 6–8; one at 7 → same weight, 8 reps', () => {
    expect(suggestProgression(sets(100, 8, 8, 8), 6, 8, 2.5))
      .toEqual({ kind: 'increase', weight: 102.5, fromWeight: 100, repsLow: 6, repsHigh: 8 })
    expect(suggestProgression(sets(100, 8, 8, 7), 6, 8, 2.5)).toEqual({ kind: 'reps', weight: 100, reps: 8 })
  })

  it('isolation 10–12: 12 is the top, 11 is not', () => {
    expect(suggestProgression(sets(12.5, 12, 12, 12), 10, 12, 1.25))
      .toEqual({ kind: 'increase', weight: 13.75, fromWeight: 12.5, repsLow: 10, repsHigh: 12 })
    expect(suggestProgression(sets(12.5, 12, 11, 12), 10, 12, 1.25)).toEqual({ kind: 'reps', weight: 12.5, reps: 12 })
  })

  it('same sets judged by different ranges', () => {
    // 10 reps is the top of 6–10 but not of 10–12
    expect(suggestProgression(sets(30, 10, 10, 10), 6, 10, 2.5).kind).toBe('increase')
    expect(suggestProgression(sets(30, 10, 10, 10), 10, 12, 2.5)).toEqual({ kind: 'reps', weight: 30, reps: 11 })
  })

  it('mixed weights 35×8, 35×6, 30×5 (6–8) → no increase, same 35 kg, reps target', () => {
    expect(suggestProgression([{ weight: 35, reps: 8 }, { weight: 35, reps: 6 }, { weight: 30, reps: 5 }], 6, 8, 2.5))
      .toEqual({ kind: 'reps', weight: 35, reps: 7 })
  })
})

describe('formatSetShort: time and distance sets', () => {
  it('reps sets keep the old format', () => {
    expect(formatSetShort({ weight: 30, reps: 10 })).toBe('30×10')
    expect(formatSetShort({ weight: 30, reps: 10, rir: 2 })).toBe('30×10 (RPE 8)')
  })
  it('time and distance', () => {
    expect(formatSetShort({ weight: 20, reps: 0, durationSec: 45 })).toBe('20 kg · 0:45')
    expect(formatSetShort({ weight: 0, reps: 0, durationSec: 45 })).toBe('0:45')
    expect(formatSetShort({ weight: 0, reps: 0, distanceM: 40 })).toBe('40 m')
    expect(formatSetShort({ weight: 25, reps: 0, distanceM: 40 })).toBe('25 kg · 40 m')
    expect(formatSetShort({ weight: 0, reps: 0, durationSec: 1500, distanceM: 5000 })).toBe('25:00 · 5 km')
  })
  it('formatSetLine', () => {
    expect(formatSetLine({ weight: 30, reps: 10 })).toBe('30 kg × 10 powt.')
    expect(formatSetLine({ weight: 0, reps: 0, durationSec: 90 })).toBe('1:30')
  })
})
