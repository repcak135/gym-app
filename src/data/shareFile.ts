export type SaveResult = 'shared' | 'downloaded' | 'cancelled' | 'needs-tap';

/**
 * iPhone/Android: the share sheet (Messenger, mail, "Zachowaj w Plikach"...).
 * Elsewhere: a normal file download. Nothing is sent anywhere by the app itself.
 */
export async function shareFile(file: File): Promise<SaveResult> {
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (e) {
      const name = (e as Error)?.name;
      if (name === 'AbortError') return 'cancelled';
      // Safari needs a fresh tap when preparing the file took too long.
      if (name === 'NotAllowedError') return 'needs-tap';
      // Anything else: fall back to a download.
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
