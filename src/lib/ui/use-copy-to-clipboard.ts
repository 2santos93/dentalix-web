'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Copies text to the clipboard and exposes a transient `copied` flag for the
 * "¡Copiado!" UI feedback (invitation link buttons, etc). Fails soft: if the
 * Clipboard API isn't available (older browser, non-HTTPS context) or
 * `writeText` rejects (permission denied), `copied` just stays `false` — the
 * caller's text is still selectable by hand, so there's nothing to throw for.
 */
export function useCopyToClipboard(): { copied: boolean; copy: (text: string) => Promise<void> } {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const copy = useCallback(async (text: string) => {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    setCopied(true);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 2000);
  }, []);

  return { copied, copy };
}
