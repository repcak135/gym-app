import { describe, it, expect } from 'vitest';
import { routePayload } from './payloadRouter';
import { shareUrl } from './planShare';
import { exercisesShareUrl } from './exerciseShare';

describe('routePayload', () => {
  it('routes a plan link', () => {
    const r = routePayload(shareUrl('AbC+-$_.', 'https://x.test/app/'));
    expect(r).toEqual({ kind: 'plan', data: 'AbC+-$_.', path: '/plan?d=AbC+-$_.' });
  });

  it('routes an exercises link, also inside a longer message', () => {
    const r = routePayload(`Zobacz: ${exercisesShareUrl('XyZ', 'https://x.test/app/')} :)`);
    expect(r).toEqual({ kind: 'exercises', data: 'XyZ', path: '/cwiczenia/import?d=XyZ' });
  });

  it('treats anything else as unknown', () => {
    expect(routePayload('')).toEqual({ kind: 'unknown' });
    expect(routePayload('https://example.com/?q=1')).toEqual({ kind: 'unknown' });
    expect(routePayload('https://example.com/?d=abc')).toEqual({ kind: 'unknown' });
    expect(routePayload('WIFI:S:x;T:WPA;P:y;;')).toEqual({ kind: 'unknown' });
  });
});
