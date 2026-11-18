'use client';

import {useEffect, useRef} from 'react';

const FORWARD_KEYS = new Set([
  'ArrowRight', 'ArrowLeft', ' ', 'PageDown', 'PageUp',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'f', 'F', 'n', 'N',
]);

export default function DemoViewer() {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!FORWARD_KEYS.has(event.key)) return;
      event.preventDefault();
      frame.current?.contentWindow?.postMessage(
        {type: 'deck-key', key: event.key},
        window.location.origin,
      );
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <iframe
      ref={frame}
      src="/demo-deck/index.html"
      title="BYU Calendar Interactive Presentation"
      allowFullScreen
      onLoad={() => frame.current?.focus()}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        border: 0,
        background: '#fff',
      }}
    />
  );
}
