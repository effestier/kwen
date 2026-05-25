'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { hapticLight } from '@/lib/haptics';

interface DrawingToolProps {
  onSave: (dataUrl: string) => void;
  onClear: () => void;
  onClose: () => void;
}

const BRUSHES = [
  { name: 'Pen', type: 'pen' as const },
  { name: 'Marker', type: 'marker' as const },
  { name: 'Neon', type: 'neon' as const },
  { name: 'Eraser', type: 'eraser' as const },
];

const COLORS = [
  '#FFFFFF', '#000000', '#FF3B30', '#FF9500', '#FFCC00',
  '#34C759', '#AF52DE', '#FF2D55', '#FF6B6B',
  '#A0522D', '#808080', '#00CED1', '#9370DB',
  '#FF1493', '#00FF7F', '#FF6347', '#7B68EE', '#F5DEB3', '#DEB887',
];

export function DrawingTool({ onSave, onClear, onClose }: DrawingToolProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [brushIndex, setBrushIndex] = useState(0);
  const [color, setColor] = useState('#FFFFFF');
  const [brushSize, setBrushSize] = useState(4);
  const [opacity, setOpacity] = useState(100);
  const [glowIntensity, setGlowIntensity] = useState(15);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  // M12: Use ref to track current historyIndex — avoids stale closure in saveState
  const historyIndexRef = useRef(-1);
  const [showToolbar, setShowToolbar] = useState(true);
  const [showSizeSlider, setShowSizeSlider] = useState(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size to story aspect ratio (9:16)
    const maxH = window.innerHeight;
    const w = Math.min(window.innerWidth, maxH * 9 / 16);
    const h = w * 16 / 9;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    saveState();
  }, []);

  // M12: Use ref to avoid stale closure — read historyIndexRef.current instead of captured state
  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    setHistory(prev => {
      const idx = historyIndexRef.current;
      const newHistory = prev.slice(0, idx + 1);
      newHistory.push(imageData);
      if (newHistory.length > 30) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => {
      const next = Math.min(prev + 1, 29);
      historyIndexRef.current = next;
      return next;
    });
  }, []);

  const getPos = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }, []);

  const startDrawing = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e);
    const brush = BRUSHES[brushIndex];

    setIsDrawing(true);
    lastPosRef.current = pos;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);

    if (brush.type === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = opacity / 100;
      ctx.strokeStyle = color;
    }

    ctx.lineWidth = brush.type === 'marker' ? brushSize * 3 : brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (brush.type === 'neon') {
      ctx.shadowBlur = glowIntensity;
      ctx.shadowColor = color;
    } else {
      ctx.shadowBlur = 0;
    }

    // Draw a dot for single taps
    ctx.lineTo(pos.x + 0.1, pos.y + 0.1);
    ctx.stroke();
  }, [brushIndex, color, brushSize, opacity, glowIntensity, getPos]);

  const draw = useCallback((e: React.PointerEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e);

    // Quadratic bezier for smooth curves
    if (lastPosRef.current) {
      const midX = (lastPosRef.current.x + pos.x) / 2;
      const midY = (lastPosRef.current.y + pos.y) / 2;
      ctx.quadraticCurveTo(lastPosRef.current.x, lastPosRef.current.y, midX, midY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(midX, midY);
    }

    lastPosRef.current = pos;
  }, [isDrawing, getPos]);

  const stopDrawing = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false);
      lastPosRef.current = null;
      saveState();
    }
  }, [isDrawing, saveState]);

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const newIndex = historyIndex - 1;
    ctx.putImageData(history[newIndex], 0, 0);
    setHistoryIndex(newIndex);
    historyIndexRef.current = newIndex;
    hapticLight();
  }, [historyIndex, history]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    const newIndex = historyIndex + 1;
    ctx.putImageData(history[newIndex], 0, 0);
    setHistoryIndex(newIndex);
    historyIndexRef.current = newIndex;
    hapticLight();
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
    hapticLight();
  };

  const brush = BRUSHES[brushIndex];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      {/* Fullscreen canvas */}
      <canvas
        ref={canvasRef}
        className="touch-none"
        style={{ touchAction: 'none' }}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerLeave={stopDrawing}
        onClick={() => setShowToolbar(!showToolbar)}
      />

      {/* Top bar */}
      {showToolbar && (
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-10" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
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
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3 z-10" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          {/* Size/opacity/glow slider */}
          {showSizeSlider && (
            <div className="bg-black/60 rounded-xl p-3 backdrop-blur-sm space-y-2">
              {/* Brush size */}
              <div className="flex items-center gap-3">
                <span className="text-white/50 text-xs w-10">Size</span>
                <input
                  type="range"
                  min={1}
                  max={50}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="flex-1 accent-white"
                />
                <span className="text-white/50 text-xs w-6 text-right">{brushSize}</span>
              </div>
              {/* Opacity */}
              {brush.type !== 'eraser' && (
                <div className="flex items-center gap-3">
                  <span className="text-white/50 text-xs w-10">Alpha</span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="flex-1 accent-white"
                  />
                  <span className="text-white/50 text-xs w-6 text-right">{opacity}%</span>
                </div>
              )}
              {/* Glow for neon */}
              {brush.type === 'neon' && (
                <div className="flex items-center gap-3">
                  <span className="text-white/50 text-xs w-10">Glow</span>
                  <input
                    type="range"
                    min={5}
                    max={40}
                    value={glowIntensity}
                    onChange={(e) => setGlowIntensity(Number(e.target.value))}
                    className="flex-1 accent-white"
                  />
                  <span className="text-white/50 text-xs w-6 text-right">{glowIntensity}</span>
                </div>
              )}
            </div>
          )}

          {/* Color preview + size toggle */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => { setShowSizeSlider(!showSizeSlider); hapticLight(); }}
              className="flex items-center gap-2 px-3 py-2 bg-black/40 rounded-full backdrop-blur-sm"
            >
              <div
                className="rounded-full"
                style={{
                  width: `${Math.max(8, Math.min(brushSize, 30))}px`,
                  height: `${Math.max(8, Math.min(brushSize, 30))}px`,
                  backgroundColor: brush.type === 'eraser' ? '#666' : color,
                  opacity: brush.type === 'eraser' ? 1 : opacity / 100,
                  boxShadow: brush.type === 'neon' ? `0 0 ${glowIntensity}px ${color}` : undefined,
                }}
              />
              <span className="text-white/70 text-xs">{brushSize}px</span>
            </button>
          </div>

          {/* Colors */}
          <div className="flex gap-2 justify-center flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => { setColor(c); hapticLight(); }}
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
                onClick={() => { setBrushIndex(i); hapticLight(); }}
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
