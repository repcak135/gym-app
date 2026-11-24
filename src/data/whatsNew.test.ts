import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { CHANGELOG } from './changelog';
import { compareVersions, decideWhatsNew, entriesSince, hasUserData, markVersionSeen } from './whatsNew';
import { createBackup, restoreBackup } from './backup';
import { deleteAllUserData } from './wipe';
import { APP_VERSION } from '../version';

describe('compareVersions', () => {
  it('compares numerically, not as text', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('0.9.0', '0.9.0')).toBe(0);
    expect(compareVersions('0.9.0', '0.9.1')).toBeLessThan(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
  });
});

describe('decideWhatsNew', () => {
  it('brand-new user without data: just store the version', () => {
    expect(decideWhatsNew(undefined, '0.9.0', false)).toBe('store');
  });
  it('existing user from before versions were tracked: show', () => {
    expect(decideWhatsNew(undefined, '0.9.0', true)).toBe('show');
  });
  it('same version: nothing', () => {
    expect(decideWhatsNew('0.9.0', '0.9.0', true)).toBe('none');
  });
  it('older version seen: show', () => {
    expect(decideWhatsNew('0.9.0', '0.9.1', true)).toBe('show');
  });
  it('newer version seen (rollback): store quietly', () => {
    expect(decideWhatsNew('0.10.0', '0.9.0', true)).toBe('store');
  });
});

describe('changelog', () => {
  it('has an entry for the current version, newest first', () => {
    expect(APP_VERSION).toMatch(/^0\.\d+\.\d+$/);
    expect(CHANGELOG[0].version).toBe(APP_VERSION);
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBeGreaterThan(0);
    }
  });
  it('entriesSince returns only newer entries', () => {
    const log = [
      { version: '0.10.0', date: '', items: ['b'] },
      { version: '0.9.1', date: '', items: ['a'] },
      { version: '0.9.0', date: '', items: ['x'] },
    ];
    expect(entriesSince('0.9.0', log).map((e) => e.version)).toEqual(['0.10.0', '0.9.1']);
    expect(entriesSince(undefined, log).map((e) => e.version)).toEqual(['0.10.0']);
  });
});

describe('lastSeenVersion is device-only', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('is not exported, survives restore and wipe', async () => {
    await markVersionSeen('0.9.0');
    const file = await createBackup();
    expect(JSON.stringify(file)).not.toContain('lastSeenVersion');

    await restoreBackup(file);
    expect((await db.settings.get('app'))?.lastSeenVersion).toBe('0.9.0');

    await deleteAllUserData();
    expect((await db.settings.get('app'))?.lastSeenVersion).toBe('0.9.0');
  });

  it('hasUserData sees a plan', async () => {
    expect(await hasUserData()).toBe(false);
    await db.plans.add({ id: 'p1', name: 'P', startDate: '2026-11-24', days: [], createdAt: 0 } as never);
    expect(await hasUserData()).toBe(true);
  });
});
