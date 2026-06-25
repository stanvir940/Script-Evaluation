import { useState, useEffect, useCallback } from 'react';
import { Stage, Layer, Line, Rect, Circle, Arrow, Image as KonvaImage } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { AnnotationAction, AnnotationTool } from '@dasems/shared-types';

interface Props {
  imageUrl: string;
  annotations: AnnotationAction[];
  onChange: (actions: AnnotationAction[]) => void;
  readOnly?: boolean;
}

const COLOR_CLASSES: Record<string, string> = {
  '#B91C1C': 'bg-[#B91C1C]',
  '#1B3A6B': 'bg-[#1B3A6B]',
  '#2D6A4F': 'bg-[#2D6A4F]',
  '#B45309': 'bg-[#B45309]',
  '#000000': 'bg-black',
};

export function AnnotationCanvas({ imageUrl, annotations, onChange, readOnly }: Props) {
  const [tool, setTool] = useState<AnnotationTool>('pen');
  const [color, setColor] = useState('#B91C1C');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<number[]>([]);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [history, setHistory] = useState<AnnotationAction[][]>([annotations]);
  const [historyIndex, setHistoryIndex] = useState(0);

  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = imageUrl;
    img.onload = () => setImage(img);
  }, [imageUrl]);

  useEffect(() => {
    setHistory([annotations]);
    setHistoryIndex(0);
  }, [imageUrl]);

  const pushHistory = useCallback(
    (next: AnnotationAction[]) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(next);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
      onChange(next);
    },
    [history, historyIndex, onChange]
  );

  const undo = () => {
    if (historyIndex > 0) {
      const idx = historyIndex - 1;
      setHistoryIndex(idx);
      onChange(history[idx]);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const idx = historyIndex + 1;
      setHistoryIndex(idx);
      onChange(history[idx]);
    }
  };

  const getPointer = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = e.target.getStage();
    return stage?.getPointerPosition() ?? null;
  };

  const handleMouseDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (readOnly) return;
    const pos = getPointer(e);
    if (!pos) return;
    setIsDrawing(true);
    setCurrentPoints([pos.x, pos.y]);
  };

  const handleMouseMove = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (!isDrawing || readOnly) return;
    const pos = getPointer(e);
    if (!pos) return;
    if (tool === 'pen' || tool === 'highlighter') {
      setCurrentPoints((pts) => [...pts, pos.x, pos.y]);
    } else {
      setCurrentPoints((pts) => [pts[0], pts[1], pos.x, pos.y]);
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || readOnly) return;
    setIsDrawing(false);
    if (currentPoints.length < 4 && tool !== 'text') {
      setCurrentPoints([]);
      return;
    }
    const action: AnnotationAction = {
      id: crypto.randomUUID(),
      tool,
      points: [...currentPoints],
      color: tool === 'highlighter' ? `${color}88` : color,
      strokeWidth: tool === 'highlighter' ? strokeWidth * 3 : strokeWidth,
      timestamp: new Date().toISOString(),
    };
    pushHistory([...annotations, action]);
    setCurrentPoints([]);
  };

  const tools: { id: AnnotationTool; label: string }[] = [
    { id: 'pen', label: 'Pen' },
    { id: 'highlighter', label: 'Highlight' },
    { id: 'rectangle', label: 'Rect' },
    { id: 'circle', label: 'Circle' },
    { id: 'arrow', label: 'Arrow' },
  ];

  return (
    <div className="flex flex-col h-full">
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-white border-b border-border shrink-0">
          {tools.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTool(t.id)}
              className={tool === t.id ? 'btn-primary text-sm py-1' : 'btn-secondary text-sm py-1'}
            >
              {t.label}
            </button>
          ))}
          <div className="flex gap-1 ml-2">
            {Object.entries(COLOR_CLASSES).map(([hex, cls]) => (
              <button
                key={hex}
                type="button"
                className={`w-6 h-6 border-2 ${cls} ${color === hex ? 'border-primary' : 'border-border'}`}
                onClick={() => setColor(hex)}
                aria-label={`Color ${hex}`}
              />
            ))}
          </div>
          <input
            type="range"
            min={1}
            max={8}
            value={strokeWidth}
            onChange={(e) => setStrokeWidth(Number(e.target.value))}
            className="w-20"
          />
          <button type="button" onClick={undo} className="btn-secondary text-sm py-1">Undo</button>
          <button type="button" onClick={redo} className="btn-secondary text-sm py-1">Redo</button>
        </div>
      )}

      <div className="flex-1 overflow-auto bg-surface flex items-start justify-center p-4">
        <Stage
          width={800}
          height={500}
          onMouseDown={handleMouseDown}
          onMousemove={handleMouseMove}
          onMouseup={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
          className="border border-border bg-white"
        >
          <Layer>
            {image && <KonvaImage image={image} width={800} height={500} />}
            {annotations.map((a) => {
              if (a.tool === 'pen' || a.tool === 'highlighter') {
                return (
                  <Line
                    key={a.id}
                    points={a.points}
                    stroke={a.color}
                    strokeWidth={a.strokeWidth}
                    tension={0.5}
                    lineCap="round"
                    lineJoin="round"
                    globalCompositeOperation={a.tool === 'highlighter' ? 'multiply' : 'source-over'}
                  />
                );
              }
              if (a.tool === 'rectangle') {
                const [x1, y1, x2, y2] = a.points;
                return (
                  <Rect
                    key={a.id}
                    x={Math.min(x1, x2)}
                    y={Math.min(y1, y2)}
                    width={Math.abs(x2 - x1)}
                    height={Math.abs(y2 - y1)}
                    stroke={a.color}
                    strokeWidth={a.strokeWidth}
                  />
                );
              }
              if (a.tool === 'circle') {
                const [x1, y1, x2, y2] = a.points;
                const r = Math.hypot(x2 - x1, y2 - y1);
                return <Circle key={a.id} x={x1} y={y1} radius={r} stroke={a.color} strokeWidth={a.strokeWidth} />;
              }
              if (a.tool === 'arrow') {
                return <Arrow key={a.id} points={a.points} stroke={a.color} strokeWidth={a.strokeWidth} fill={a.color} />;
              }
              return null;
            })}
            {currentPoints.length > 0 && (tool === 'pen' || tool === 'highlighter') && (
              <Line
                points={currentPoints}
                stroke={tool === 'highlighter' ? `${color}88` : color}
                strokeWidth={tool === 'highlighter' ? strokeWidth * 3 : strokeWidth}
                tension={0.5}
                lineCap="round"
              />
            )}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
