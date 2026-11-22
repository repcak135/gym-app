export type SetValue = { weight: number; reps: number }
type FullSet = SetValue & { warmup: boolean }

export type Suggestion =
  | { kind: 'increase'; weight: number; fromWeight: number; repsLow: number; repsHigh: number }
  | { kind: 'reps'; weight: number; reps: number }
  | { kind: 'none' }

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

export function epley1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0
  if (reps === 1) return weight
  return round1(weight * (1 + reps / 30))
}

export function suggestProgression(
  lastWorking: SetValue[],
  repsMin: number,
  repsMax: number,
  step: number,
): Suggestion {
  if (lastWorking.length === 0) return { kind: 'none' }
  const ref = Math.max(...lastWorking.map((s) => s.weight))
  if (lastWorking.every((s) => s.reps >= repsMax)) {
    // New weight: start at the bottom of the range again (owner: 30×10 ×3 in 6–10 → 32,5 × 6–8).
    return {
      kind: 'increase',
      weight: round2(ref + step),
      fromWeight: ref,
      repsLow: repsMin,
      repsHigh: Math.min(repsMax, repsMin + 2),
    }
  }
  const atRef = lastWorking.filter((s) => s.weight === ref)
  const minReps = Math.min(...atRef.map((s) => s.reps))
  const reps = atRef.some((s) => s.reps < repsMin) ? repsMin : Math.min(repsMax, minReps + 1)
  return { kind: 'reps', weight: ref, reps }
}

export function formatKg(n: number): string {
  return String(round2(n)).replace('.', ',')
}

export function progressionText(s: Suggestion): string {
  if (s.kind === 'increase') {
    const reps = s.repsLow === s.repsHigh ? `${s.repsLow}` : `${s.repsLow}–${s.repsHigh}`
    return `Spróbuj ${formatKg(s.weight)} kg × ${reps} (ostatnio pełny zakres przy ${formatKg(s.fromWeight)} kg)`
  }
  if (s.kind === 'reps') return `Ten sam ciężar ${formatKg(s.weight)} kg, spróbuj ${s.reps} powt.`
  return ''
}

export function buildPrefill(
  lastSets: FullSet[],
  warmupCount: number,
  workingCount: number,
  repsMin: number,
): FullSet[] {
  const warm = lastSets.filter((s) => s.warmup)
  const work = lastSets.filter((s) => !s.warmup)
  const pick = (src: FullSet[], i: number, warmup: boolean): FullSet => {
    const from = src.length ? src[Math.min(i, src.length - 1)] : undefined
    return from
      ? { weight: from.weight, reps: from.reps, warmup }
      : { weight: 0, reps: repsMin, warmup }
  }
  const out: FullSet[] = []
  for (let i = 0; i < warmupCount; i++) out.push(pick(warm, i, true))
  for (let i = 0; i < workingCount; i++) out.push(pick(work, i, false))
  return out
}

/** RIR as shown to the user: 5 means 5 or more. */
export function formatRir(rir: number): string {
  return rir >= 5 ? '5+' : String(rir)
}

/** "30×10" or "30×10 (RIR 1)". */
export function formatSetShort(s: SetValue & { rir?: number }): string {
  return `${formatKg(s.weight)}×${s.reps}${s.rir !== undefined ? ` (RIR ${formatRir(s.rir)})` : ''}`
}

export function parseWeight(text: string): number | null {
  const t = text.trim()
  if (!/^\d+([.,]\d+)?$/.test(t)) return null
  const n = Number(t.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  return round2(n)
}

export function restRemainingSec(restEndsAt: number | undefined, now: number): number {
  if (restEndsAt === undefined) return 0
  return Math.max(0, Math.ceil((restEndsAt - now) / 1000))
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  if (h === 0) return `${m}:${ss}`
  return `${h}:${String(m).padStart(2, '0')}:${ss}`
}

export function workingVolume(sets: FullSet[]): number {
  return sets.filter((s) => !s.warmup).reduce((sum, s) => sum + s.weight * s.reps, 0)
}
