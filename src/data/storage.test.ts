import { describe, it, expect, afterEach, vi } from 'vitest';
import { requestPersistentStorage } from './storage';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('storage', () => {
  it('zwraca true i wywołuje persist gdy storage nie jest trwały', async () => {
    const persistMock = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', {
      storage: {
        persisted: vi.fn().mockResolvedValue(false),
        persist: persistMock,
      },
    });

    const result = await requestPersistentStorage();
    expect(result).toBe(true);
    expect(persistMock).toHaveBeenCalledOnce();
  });

  it('nie wywołuje persist gdy storage jest już trwały', async () => {
    const persistMock = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', {
      storage: {
        persisted: vi.fn().mockResolvedValue(true),
        persist: persistMock,
      },
    });

    const result = await requestPersistentStorage();
    expect(result).toBe(true);
    expect(persistMock).not.toHaveBeenCalled();
  });

  it('zwraca false gdy navigator.storage jest niedostępny', async () => {
    vi.stubGlobal('navigator', {});

    const result = await requestPersistentStorage();
    expect(result).toBe(false);
  });
});
