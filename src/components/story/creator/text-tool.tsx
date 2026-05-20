'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface TextToolProps {
  overlay?: { id: string; data: any };
  onUpdate: (data: any) => void;
  onDelete: () => void;
  onAddNew: (data: any) => void;
  onClose: () => void;
}

const FONTS = [
  { name: 'Modern', value: 'sans-serif', weight: 'normal' },
  { name: 'Classic', value: 'Georgia, serif', weight: 'normal' },
  { name: 'Bold', value: 'Impact, sans-serif', weight: 'bold' },
  { name: 'Neon', value: 'cursive', weight: 'normal' },
  { name: 'Typewriter', value: 'monospace', weight: 'normal' },
];

const COLORS = [
  '#FFFFFF', '#000000', '#FF3B30', '#FF9500', '#FFCC00',
  '#4CD964', '#5AC8FA', '#007AFF', '#5856D6', '#FF2D55',
];

const BG_COLORS = [
  'transparent', '#000000CC', '#FFFFFF', '#FF3B30', '#FF9500',
  '#FFCC00', '#4CD964', '#5AC8FA', '#007AFF', '#5856D6',
];

export function TextTool({ overlay, onUpdate, onDelete, onAddNew, onClose }: TextToolProps) {
  const [text, setText] = useState(overlay?.data?.content || '');
  const [color, setColor] = useState(overlay?.data?.color || '#FFFFFF');
  const [bgColor, setBgColor] = useState(overlay?.data?.backgroundColor || 'transparent');
  const [fontIndex, setFontIndex] = useState(() => {
    if (!overlay?.data?.fontFamily) return 0;
    const idx = FONTS.findIndex(f => f.value === overlay.data.fontFamily);
    return idx >= 0 ? idx : 0;
  });
  const [align, setAlign] = useState<'left' | 'center' | 'right'>(overlay?.data?.align || 'center');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleDone = () => {
    if (!text.trim()) {
      onClose();
      return;
    }

    const data = {
      content: text,
      color,
      backgroundColor: bgColor,
      fontSize: 24,
      fontFamily: FONTS[fontIndex].value,
      align,
      bold: fontIndex === 1,
    };

    if (overlay) {
      onUpdate(data);
    } else {
      onAddNew(data);
    }
    onClose();
  };

  const cycleFont = () => {
    setFontIndex((fontIndex + 1) % FONTS.length);
  };

  const cycleAlign = () => {
    const order: ('left' | 'center' | 'right')[] = ['left', 'center', 'right'];
    const idx = order.indexOf(align);
    setAlign(order[(idx + 1) % order.length]);
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/80 backdrop-blur-sm">
      {/* Fullscreen text area */}
      <div
        className="flex-1 flex items-center justify-center p-8 cursor-pointer"
        onClick={cycleFont}
      >
        <div
          className="w-full max-w-lg"
          style={{
            backgroundColor: bgColor,
            textAlign: align,
            padding: bgColor !== 'transparent' ? '12px 16px' : 0,
            borderRadius: bgColor !== 'transparent' ? '8px' : 0,
          }}
        >
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type something..."
            className="w-full bg-transparent text-2xl resize-none focus:outline-none text-center"
            style={{
              color,
              fontFamily: FONTS[fontIndex].value,
              fontWeight: FONTS[fontIndex].weight === 'bold' ? 'bold' : 'normal',
              textAlign: align,
              minHeight: '60px',
            }}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleDone();
              }
            }}
          />
        </div>
      </div>

      {/* Bottom controls */}
      <div className="p-4 space-y-4">
        {/* Font name indicator */}
        <p className="text-white/50 text-xs text-center">
          Tap text to change font • {FONTS[fontIndex].name}
        </p>

        {/* Color row */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="w-8 h-8 rounded-full border-2 border-white"
            style={{ backgroundColor: color }}
          />
          <button
            onClick={cycleAlign}
            className="text-white p-2"
          >
            {align === 'left' && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" x2="21" y1="6" y2="6" /><line x1="3" x2="15" y1="12" y2="12" /><line x1="3" x2="18" y1="18" y2="18" />
              </svg>
            )}
            {align === 'center' && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" x2="21" y1="6" y2="6" /><line x1="6" x2="18" y1="12" y2="12" /><line x1="4" x2="20" y1="18" y2="18" />
              </svg>
            )}
            {align === 'right' && (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" x2="21" y1="6" y2="6" /><line x1="9" x2="21" y1="12" y2="12" /><line x1="6" x2="21" y1="18" y2="18" />
              </svg>
            )}
          </button>
          <button
            onClick={() => setBgColor(bgColor === 'transparent' ? '#000000CC' : 'transparent')}
            className={cn(
              'px-3 py-1.5 rounded text-xs font-medium',
              bgColor !== 'transparent' ? 'bg-white text-black' : 'bg-white/20 text-white'
            )}
          >
            A
          </button>
        </div>

        {/* Color picker */}
        {showColorPicker && (
          <div className="flex gap-2 justify-center flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  'w-7 h-7 rounded-full border-2 transition-transform',
                  color === c ? 'border-white scale-110' : 'border-transparent'
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}

        {/* BG Color picker */}
        {showColorPicker && (
          <div className="flex gap-2 justify-center flex-wrap">
            {BG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setBgColor(c)}
                className={cn(
                  'w-7 h-7 rounded-full border-2',
                  c === 'transparent' ? 'border-white/30 bg-black/50' : '',
                  bgColor === c ? 'border-white scale-110' : 'border-transparent'
                )}
                style={{ backgroundColor: c === 'transparent' ? 'transparent' : c }}
              />
            ))}
          </div>
        )}

        {/* Done / Delete */}
        <div className="flex gap-2">
          {overlay && (
            <button
              onClick={() => { onDelete(); onClose(); }}
              className="px-4 py-3 bg-red-600 text-white rounded-xl text-sm font-medium"
            >
              Delete
            </button>
          )}
          <button
            onClick={handleDone}
            className="flex-1 py-3 bg-white text-black rounded-xl text-sm font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
