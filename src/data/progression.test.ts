import { describe, it, expect } from 'vitest'
import {
  epley1RM, suggestProgression, progressionText, buildPrefill, parseWeight,
  formatKg, restRemainingSec, formatClock, workingVolume,
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
      .toEqual({ kind: 'increase', weight: 37.5, fromWeight: 35 })
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
    expect(progressionText({ kind: 'increase', weight: 37.5, fromWeight: 35 }))
      .toBe('Spróbuj 37,5 kg (ostatnio pełny zakres przy 35 kg)')
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
