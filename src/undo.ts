import { useSyncExternalStore } from 'react';

/** One toast at a time at the bottom of the screen; "Cofnij" restores what was just deleted. */
export interface Toast {
  id: number;
  message: string;
  undo?: () => Promise<void>;
}

export const TOAST_MS = 5000;

let current: Toast | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function showUndo(message: string, undo?: () => Promise<void>): void {
  clearTimeout(timer);
  current = { id: nextId++, message, undo };
  timer = setTimeout(hideToast, TOAST_MS);
  emit();
}

export function hideToast(): void {
  clearTimeout(timer);
  if (current === null) return;
  current = null;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useToast(): Toast | null {
  return useSyncExternalStore(subscribe, () => current);
}
