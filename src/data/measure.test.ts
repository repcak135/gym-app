import { describe, expect, it } from 'vitest';
import { MEASURE_OPTIONS, formatDistance, formatDuration, measureOf, parseDuration } from './measure';

describe('measure', () => {
  it('measureOf: override beats measure, default is reps', () => {
    expect(measureOf(undefined)).toBe('reps');
    expect(measureOf({})).toBe('reps');
    expect(measureOf({ measure: 'time' })).toBe('time');
    expect(measureOf({ measure: 'time', measureOverride: 'reps' })).toBe('reps');
  });
  it('formatDuration', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(45)).toBe('0:45');
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
  it('formatDistance', () => {
    expect(formatDistance(40, 'distance')).toBe('40 m');
    expect(formatDistance(2500, 'distance')).toBe('2500 m');
    expect(formatDistance(2500, 'timeDistance')).toBe('2,5 km');
    expect(formatDistance(5000, 'timeDistance')).toBe('5 km');
    expect(formatDistance(800, 'timeDistance')).toBe('800 m');
  });
  it('parseDuration', () => {
    expect(parseDuration('45')).toBe(45);
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('1:02:05')).toBe(3725);
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('1:75')).toBeNull();
  });
  it('options cover every measure', () => {
    expect(MEASURE_OPTIONS.map((o) => o.value)).toEqual(['reps', 'time', 'distance', 'timeDistance']);
  });
});
