'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface DrawingToolProps {
  onSave: (dataUrl: string) => void;
  onClear: () => void;
}

const BRUSHES = [
  { name: 'Pen', size: 3 },
  { name: 'Marker', size: 8 },
  { name: 'Neon', size: 12 },
  { name: 'Eraser', size: 20 },
];

const COLORS = [
  '#FFFFFF', '#000000', '#FF3B30', '#FF9500', '#FFCC00',
  '#4CD964', '#5AC8FA', '#007AFF', '#5856D6', '#FF2D55',
];

export function DrawingTool({ onSave, onClear }: DrawingToolProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brush, setBrush] = useState(BRUSHES[0]);
  const [color, setColor] = useState('#FFFFFF');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match container
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    // Fill with transparent
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dataUrl = canvas.toDataURL();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(dataUrl);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);

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
      ctx.shadowBlur = 10;
      ctx.shadowColor = color;
    } else {
      ctx.shadowBlur = 0;
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      saveState();
    }
  };

  const handleUndo = () => {
    if (historyIndex <= 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const newIndex = historyIndex - 1;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = history[newIndex];
    setHistoryIndex(newIndex);
  };

  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const newIndex = historyIndex + 1;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
    };
    img.src = history[newIndex];
    setHistoryIndex(newIndex);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    onSave(canvas.toDataURL());
  };

  return (
    <div className="bg-black/90 backdrop-blur-xl p-4">
      {/* Canvas area - full width overlay */}
      <div className="relative h-40 bg-transparent rounded-lg overflow-hidden mb-4">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
      </div>

      {/* Brush selector */}
      <div className="flex gap-2 mb-3">
        {BRUSHES.map((b) => (
          <button
            key={b.name}
            onClick={() => setBrush(b)}
            className={cn(
              'px-3 py-1.5 rounded text-xs',
              brush.name === b.name
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
            )}
          >
            {b.name}
          </button>
        ))}
      </div>

      {/* Color selector */}
      <div className="flex gap-1 mb-4">
        {COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className={cn(
              'w-6 h-6 rounded-full border-2',
              color === c ? 'border-white' : 'border-transparent'
            )}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleUndo}
          disabled={historyIndex <= 0}
          className="px-3 py-1.5 bg-[var(--bg-secondary)] text-white rounded text-xs disabled:opacity-50"
        >
          Undo
        </button>
        <button
          onClick={handleRedo}
          disabled={historyIndex >= history.length - 1}
          className="px-3 py-1.5 bg-[var(--bg-secondary)] text-white rounded text-xs disabled:opacity-50"
        >
          Redo
        </button>
        <button
          onClick={onClear}
          className="px-3 py-1.5 bg-red-600 text-white rounded text-xs"
        >
          Clear
        </button>
        <button
          onClick={handleSave}
          className="flex-1 px-3 py-1.5 bg-[var(--accent-primary)] text-white rounded text-xs"
        >
          Save Drawing
        </button>
      </div>
    </div>
  );
}