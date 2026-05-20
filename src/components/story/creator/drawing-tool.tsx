'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface DrawingToolProps {
  onSave: (dataUrl: string) => void;
  onClear: () => void;
  onClose: () => void;
}

const BRUSHES = [
  { name: 'Pen', size: 3, icon: '✏️' },
  { name: 'Marker', size: 10, icon: '🖊️' },
  { name: 'Neon', size: 8, icon: '✨' },
  { name: 'Eraser', size: 24, icon: '◻️' },
];

const COLORS = [
  '#FFFFFF', '#000000', '#FF3B30', '#FF9500', '#FFCC00',
  '#4CD964', '#5AC8FA', '#007AFF', '#5856D6', '#FF2D55',
];

export function DrawingTool({ onSave, onClear, onClose }: DrawingToolProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushIndex, setBrushIndex] = useState(0);
  const [color, setColor] = useState('#FFFFFF');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showToolbar, setShowToolbar] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveState();
  }, []);

  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL();
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(dataUrl);
      return newHistory;
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e);
    const brush = BRUSHES[brushIndex];

    setIsDrawing(true);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);

    if (brush.name === 'Eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
    }

    ctx.lineWidth = brush.size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (brush.name === 'Neon') {
      ctx.shadowBlur = 15;
      ctx.shadowColor = color;
    } else {
      ctx.shadowBlur = 0;
    }
  }, [brushIndex, color, getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e);

    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, [isDrawing, getPos]);

  const stopDrawing = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false);
      saveState();
    }
  }, [isDrawing, saveState]);

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const newIndex = historyIndex - 1;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = history[newIndex];
    setHistoryIndex(newIndex);
  }, [historyIndex, history]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const newIndex = historyIndex + 1;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = history[newIndex];
    setHistoryIndex(newIndex);
  }, [historyIndex, history]);

  const handleDone = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL());
    onClose();
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    onClear();
    saveState();
  };

  return (
    <div className="fixed inset-0 z-[60]">
      {/* Fullscreen canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full touch-none"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        onClick={() => setShowToolbar(!showToolbar)}
      />

      {/* Top bar */}
      {showToolbar && (
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10">
          <button onClick={onClose} className="text-white p-2 bg-black/40 rounded-full backdrop-blur-sm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>
          <div className="flex gap-2">
            <button onClick={handleUndo} disabled={historyIndex <= 0} className="text-white p-2 bg-black/40 rounded-full backdrop-blur-sm disabled:opacity-30">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
              </svg>
            </button>
            <button onClick={handleRedo} disabled={historyIndex >= history.length - 1} className="text-white p-2 bg-black/40 rounded-full backdrop-blur-sm disabled:opacity-30">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
              </svg>
            </button>
            <button onClick={handleClear} className="text-white p-2 bg-black/40 rounded-full backdrop-blur-sm">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Bottom toolbar */}
      {showToolbar && (
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3 z-10">
          {/* Colors */}
          <div className="flex gap-2 justify-center">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  'w-7 h-7 rounded-full border-2 transition-all',
                  color === c ? 'border-white scale-125' : 'border-white/30'
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          {/* Brushes */}
          <div className="flex gap-2 justify-center">
            {BRUSHES.map((b, i) => (
              <button
                key={b.name}
                onClick={() => setBrushIndex(i)}
                className={cn(
                  'px-4 py-2 rounded-full text-sm font-medium transition-all',
                  brushIndex === i
                    ? 'bg-white text-black'
                    : 'bg-black/40 text-white backdrop-blur-sm'
                )}
              >
                {b.name}
              </button>
            ))}
          </div>

          {/* Done */}
          <button
            onClick={handleDone}
            className="w-full py-3 bg-white text-black rounded-xl text-sm font-semibold"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
