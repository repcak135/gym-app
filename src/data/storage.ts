export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage) return false;
    const alreadyPersisted = await navigator.storage.persisted();
    if (alreadyPersisted) return true;
    const granted = await navigator.storage.persist?.();
    return granted ?? false;
  } catch {
    return false;
  }
}
