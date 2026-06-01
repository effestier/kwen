'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { hapticLight } from '@/lib/haptics';

interface TextToolProps {
  overlay?: { id: string; data: Record<string, unknown> };
  onUpdate: (data: Record<string, unknown>) => void;
  onDelete: () => void;
  onAddNew: (data: Record<string, unknown>) => void;
  onClose: () => void;
}

const FONTS = [
  { name: 'Modern', value: 'sans-serif', weight: 'normal', style: 'normal' },
  { name: 'Classic', value: 'Georgia, serif', weight: 'normal', style: 'normal' },
  { name: 'Strong', value: 'Arial Black, Impact, sans-serif', weight: 'bold', style: 'normal' },
  { name: 'Neon', value: 'cursive', weight: 'normal', style: 'normal' },
  { name: 'Typewriter', value: 'monospace', weight: 'normal', style: 'normal' },
  { name: 'Elegant', value: 'Georgia, serif', weight: 'normal', style: 'italic' },
];

const COLORS = [
  '#FFFFFF', '#000000', '#FF3B30', '#FF9500', '#FFCC00',
  '#34C759', '#AF52DE', '#FF2D55', '#FF6B6B',
  '#A0522D', '#808080', '#FFD700',
];

const BG_STYLES = [
  { name: 'None', value: 'transparent', bg: 'transparent' },
  { name: 'Dark', value: '#000000CC', bg: '#000000CC' },
  { name: 'Light', value: '#FFFFFFCC', bg: '#FFFFFFCC' },
  { name: 'Red', value: '#FF3B30CC', bg: '#FF3B30CC' },
  { name: 'Blue', value: '#5856D6CC', bg: '#5856D6CC' },
  { name: 'Green', value: '#34C759CC', bg: '#34C759CC' },
  { name: 'Pill', value: 'pill', bg: '#000000CC' },
];

const PRESETS = [
  { content: 'Good morning ☀️', color: '#FFFFFF', bg: 'transparent', neon: false, bold: false, font: 0 },
  { content: 'Q&A', color: '#FFFFFF', bg: '#FF3B30CC', neon: false, bold: true, font: 2 },
  { content: 'AMA', color: '#FFFFFF', bg: '#5856D6CC', neon: false, bold: true, font: 2 },
  { content: 'Swipe up ↑', color: '#FFFFFF', bg: 'transparent', neon: false, bold: false, font: 0 },
  { content: 'New post 🔥', color: '#FFFFFF', bg: '#000000CC', neon: false, bold: true, font: 2 },
  { content: '✨', color: '#FFCC00', bg: 'transparent', neon: true, bold: false, font: 3 },
];

export function TextTool({ overlay, onUpdate, onDelete, onAddNew, onClose }: TextToolProps) {
  const [text, setText] = useState((overlay?.data?.content as string) || '');
  const [color, setColor] = useState((overlay?.data?.color as string) || '#FFFFFF');
  const [bgIndex, setBgIndex] = useState(() => {
    const bg = overlay?.data?.backgroundColor as string;
    if (!bg || bg === 'transparent') return 0;
    const idx = BG_STYLES.findIndex(s => s.value === bg);
    return idx >= 0 ? idx : 1;
  });
  const [fontIndex, setFontIndex] = useState(() => {
    if (!overlay?.data?.fontFamily) return 0;
    const idx = FONTS.findIndex(f => f.value === overlay.data.fontFamily);
    return idx >= 0 ? idx : 0;
  });
  const [fontSize, setFontSize] = useState((overlay?.data?.fontSize as number) || 24);
  const [align, setAlign] = useState<'left' | 'center' | 'right'>((overlay?.data?.align as 'left' | 'center' | 'right') || 'center');
  const [bold, setBold] = useState(!!overlay?.data?.bold);
  const [neon, setNeon] = useState(!!overlay?.data?.neon);
  const [showPresets, setShowPresets] = useState(!overlay);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!showPresets) {
      inputRef.current?.focus();
    }
  }, [showPresets]);

  const handleDone = useCallback(() => {
    if (!text.trim()) {
      onClose();
      return;
    }

    const bgStyle = BG_STYLES[bgIndex];
    const data: Record<string, unknown> = {
      content: text,
      color,
      backgroundColor: bgStyle.value === 'pill' ? bgStyle.bg : bgStyle.value,
      bgStyle: bgStyle.value === 'pill' ? 'pill' : undefined,
      fontSize,
      fontFamily: FONTS[fontIndex].value,
      align,
      bold,
      neon,
    };

    if (overlay) {
      onUpdate(data);
    } else {
      onAddNew(data);
    }
    onClose();
  }, [text, color, bgIndex, fontSize, fontIndex, align, bold, neon, overlay, onUpdate, onAddNew, onClose]);

  const applyPreset = useCallback((preset: typeof PRESETS[0]) => {
    setText(preset.content);
    setColor(preset.color);
    setBold(preset.bold);
    setNeon(preset.neon);
    setFontIndex(preset.font);
    const bgIdx = BG_STYLES.findIndex(s => s.value === preset.bg);
    setBgIndex(bgIdx >= 0 ? bgIdx : 0);
    setShowPresets(false);
    hapticLight();
  }, []);

  const bgStyle = BG_STYLES[bgIndex];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/80 backdrop-blur-sm">
      {/* Presets view */}
      {showPresets ? (
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3">
            <button onClick={onClose} className="text-white/70 hover:text-white p-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
            <span className="text-white/50 text-sm">Text Style</span>
            <div className="w-10" />
          </div>

          <div className="flex-1 flex items-center justify-center px-8">
            <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
              {PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => applyPreset(preset)}
                  className="p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-center"
                >
                  <span
                    className="text-lg font-medium"
                    style={{
                      color: preset.color,
                      fontFamily: FONTS[preset.font].value,
                      fontWeight: preset.bold ? 'bold' : 'normal',
                      textShadow: preset.neon ? `0 0 10px ${preset.color}, 0 0 20px ${preset.color}` : undefined,
                    }}
                  >
                    {preset.content}
                  </span>
                </button>
              ))}
              <button
                onClick={() => setShowPresets(false)}
                className="p-4 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-center col-span-2"
              >
                <span className="text-white font-medium">Custom text</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Editing view */
        <>
          {/* Fullscreen text area */}
          <div
            className="flex-1 flex items-center justify-center p-8 cursor-pointer"
            onClick={() => setShowColorPicker(false)}
          >
            <div
              className="w-full max-w-lg"
              style={{
                backgroundColor: bgStyle.value === 'pill' ? bgStyle.bg : (bgStyle.value !== 'transparent' ? bgStyle.value : undefined),
                textAlign: align,
                padding: bgStyle.value !== 'transparent' ? (bgStyle.value === 'pill' ? '6px 16px' : '12px 16px') : 0,
                borderRadius: bgStyle.value === 'pill' ? '9999px' : bgStyle.value !== 'transparent' ? '8px' : undefined,
              }}
            >
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type something..."
                className="w-full bg-transparent resize-none focus:outline-none"
                style={{
                  color,
                  fontFamily: FONTS[fontIndex].value,
                  fontWeight: bold ? 'bold' : 'normal',
                  fontStyle: FONTS[fontIndex].style === 'italic' ? 'italic' : 'normal',
                  textAlign: align,
                  fontSize: `${fontSize}px`,
                  minHeight: '60px',
                  textShadow: neon ? `0 0 10px ${color}, 0 0 20px ${color}, 0 0 40px ${color}` : undefined,
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
          <div className="p-4 space-y-3" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
            {/* Font selector — horizontal scroll */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {FONTS.map((font, idx) => (
                <button
                  key={font.name}
                  onClick={() => { setFontIndex(idx); hapticLight(); }}
                  className={cn(
                    'flex-shrink-0 px-4 py-2 rounded-full text-xs font-medium transition-all',
                    fontIndex === idx ? 'bg-white text-black' : 'bg-white/10 text-white/70'
                  )}
                  style={{ fontFamily: font.value, fontWeight: font.weight === 'bold' ? 'bold' : 'normal', fontStyle: font.style === 'italic' ? 'italic' : 'normal' }}
                >
                  {font.name}
                </button>
              ))}
            </div>

            {/* Font size slider */}
            <div className="flex items-center gap-3">
              <span className="text-white/50 text-xs w-8">A</span>
              <input
                type="range"
                min={14}
                max={64}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="flex-1 accent-white"
              />
              <span className="text-white/50 text-xs w-8 text-right">{fontSize}</span>
            </div>

            {/* Style toggles + color */}
            <div className="flex items-center justify-between">
              {/* Color */}
              <button
                onClick={(e) => { e.stopPropagation(); setShowColorPicker(!showColorPicker); }}
                className="w-8 h-8 rounded-full border-2 border-white"
                style={{ backgroundColor: color }}
              />

              {/* Bold toggle */}
              <button
                onClick={() => { setBold(!bold); hapticLight(); }}
                className={cn(
                  'px-3 py-1.5 rounded text-xs font-bold',
                  bold ? 'bg-white text-black' : 'bg-white/10 text-white/70'
                )}
              >
                B
              </button>

              {/* Neon toggle */}
              <button
                onClick={() => { setNeon(!neon); hapticLight(); }}
                className={cn(
                  'px-3 py-1.5 rounded text-xs',
                  neon ? 'bg-white text-black' : 'bg-white/10 text-white/70'
                )}
              >
                ✨
              </button>

              {/* Alignment */}
              <button
                onClick={() => {
                  const order: ('left' | 'center' | 'right')[] = ['left', 'center', 'right'];
                  const idx = order.indexOf(align);
                  setAlign(order[(idx + 1) % order.length]);
                  hapticLight();
                }}
                className="text-white/70 p-2"
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

              {/* Background toggle */}
              <button
                onClick={() => {
                  setBgIndex((bgIndex + 1) % BG_STYLES.length);
                  hapticLight();
                }}
                className={cn(
                  'px-3 py-1.5 rounded text-xs font-medium',
                  bgIndex === 0 ? 'bg-white/10 text-white/70' : 'bg-white text-black'
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
                    onClick={() => { setColor(c); hapticLight(); }}
                    className={cn(
                      'w-7 h-7 rounded-full border-2 transition-transform',
                      color === c ? 'border-white scale-110' : 'border-transparent'
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}

            {/* Done / Delete */}
            <div className="flex gap-2">
              {overlay && (
                <button
                  onClick={() => { onDelete(); onClose(); }}
                  className="px-4 py-3 bg-[var(--destructive)] text-white rounded-xl text-sm font-medium"
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
        </>
      )}
    </div>
  );
}
