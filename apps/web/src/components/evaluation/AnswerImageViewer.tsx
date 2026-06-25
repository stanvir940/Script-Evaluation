import { useState, useRef, useCallback } from 'react';

interface Props {
  src: string;
  alt: string;
  candidateId: string;
  pageNumber: number;
}

export function AnswerImageViewer({ src, alt, candidateId, pageNumber }: Props) {
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const zoomIn = () => setZoom((z) => Math.min(z + 25, 300));
  const zoomOut = () => setZoom((z) => Math.max(z - 25, 50));
  const rotate = () => setRotation((r) => (r + 90) % 360);
  const fitWidth = () => setZoom(100);

  const imageUrl = src.startsWith('http') ? src : src;

  const viewer = (
    <div className={`flex flex-col h-full ${fullscreen ? 'fixed inset-0 z-[500] bg-surface' : ''}`}>
      <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-border shrink-0">
        <button type="button" onClick={zoomOut} className="btn-secondary min-w-touch" aria-label="Zoom out">
          −
        </button>
        <span className="text-sm text-text-secondary min-w-[60px] text-center">{zoom}%</span>
        <button type="button" onClick={zoomIn} className="btn-secondary min-w-touch" aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={fitWidth} className="btn-secondary text-sm">
          Fit
        </button>
        <button type="button" onClick={rotate} className="btn-secondary text-sm">
          Rotate 90°
        </button>
        <button
          type="button"
          onClick={() => setFullscreen(!fullscreen)}
          className="btn-secondary text-sm ml-auto"
        >
          {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-surface flex items-start justify-center p-4"
      >
        <img
          src={imageUrl}
          alt={alt}
          style={{
            transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
            transformOrigin: 'top center',
            maxWidth: '100%',
          }}
          className="border border-border bg-white"
          draggable={false}
        />
      </div>

      <div className="px-4 py-2 text-sm text-text-muted bg-white border-t border-border shrink-0">
        Script: {candidateId} · Page {pageNumber}
      </div>
    </div>
  );

  return viewer;
}

export function useImageViewerShortcuts(handlers: {
  zoomIn: () => void;
  zoomOut: () => void;
  toggleFullscreen: () => void;
}) {
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'z' || e.key === 'Z') {
        handlers.zoomIn();
      }
      if (e.key === '+' || e.key === '=') handlers.zoomIn();
      if (e.key === '-') handlers.zoomOut();
      if (e.key === 'f' || e.key === 'F') handlers.toggleFullscreen();
    },
    [handlers]
  );

  return handleKey;
}
