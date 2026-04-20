"use client";

import { useEffect } from "react";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export interface ShortcutMap {
  [key: string]: (event: KeyboardEvent) => void;
}

/**
 * Attach a global keydown handler that calls one of the provided callbacks
 * when the corresponding key is pressed, while **no text input is focused**.
 *
 * Keys are compared case-insensitively against the keys of `map`. Use "?"
 * or "Escape" directly. Pass `enabled=false` to short-circuit.
 */
export function useShortcuts(map: ShortcutMap, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      // Allow Escape even when an input is focused — it's the universal "cancel".
      if (event.key !== "Escape" && isEditableTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const callback = map[event.key] ?? map[event.key.toLowerCase()];
      if (!callback) return;
      event.preventDefault();
      callback(event);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [map, enabled]);
}
