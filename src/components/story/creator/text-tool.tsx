'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface TextToolProps {
  overlay?: { id: string; data: any };
  onUpdate: (data: any) => void;
  onDelete: () => void;
  onAddNew: (data: any) => void;
}

const FONTS = [
  { name: 'Modern', value: 'sans-serif' },
  { name: 'Classic', value: 'serif' },
  { name: 'Bold', value: 'Impact, sans-serif' },
  { name: 'Neon', value: 'cursive' },
  { name: 'Typewriter', value: 'monospace' },
];

const COLORS = [
  '#FFFFFF', '#000000', '#FF3B30', '#FF9500', '#FFCC00',
  '#4CD964', '#5AC8FA', '#007AFF', '#5856D6', '#FF2D55',
];

const BG_COLORS = [
  'transparent', '#FFFFFF', '#000000', '#FF3B30', '#FF9500',
  '#FFCC00', '#4CD964', '#5AC8FA', '#007AFF', '#5856D6',
];

export function TextTool({ overlay, onUpdate, onDelete, onAddNew }: TextToolProps) {
  const [text, setText] = useState('');
  const [color, setColor] = useState('#FFFFFF');
  const [bgColor, setBgColor] = useState('transparent');
  const [fontSize, setFontSize] = useState(24);
  const [fontFamily, setFontFamily] = useState('sans-serif');
  const [align, setAlign] = useState<'left' | 'center' | 'right'>('center');
  const [bold, setBold] = useState(false);

  useEffect(() => {
    if (overlay?.data) {
      setText(overlay.data.content || '');
      setColor(overlay.data.color || '#FFFFFF');
      setBgColor(overlay.data.backgroundColor || 'transparent');
      setFontSize(overlay.data.fontSize || 24);
      setFontFamily(overlay.data.fontFamily || 'sans-serif');
      setAlign(overlay.data.align || 'center');
      setBold(overlay.data.bold || false);
    }
  }, [overlay]);

  const handleApply = () => {
    if (!text.trim()) return;

    const data = {
      content: text,
      color,
      backgroundColor: bgColor,
      fontSize,
      fontFamily,
      align,
      bold,
    };

    if (overlay) {
      onUpdate(data);
    } else {
      onAddNew(data);
    }
    setText('');
  };

  return (
    <div className="bg-black/90 backdrop-blur-xl p-4">
      {/* Text input */}
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter text..."
        className="w-full bg-transparent border-b border-[var(--border-subtle)] text-white text-center py-2 mb-4 focus:outline-none"
      />

      {/* Quick add buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => { setText('New'); handleApply(); }}
          className="flex-1 py-2 bg-[var(--bg-secondary)] rounded-lg text-white text-sm"
        >
          + Classic
        </button>
        <button
          onClick={() => { setText('NEW'); setBold(true); handleApply(); }}
          className="flex-1 py-2 bg-[var(--bg-secondary)] rounded-lg text-white text-sm font-bold"
        >
          + Bold
        </button>
        <button
          onClick={() => { setText('Type something...'); setFontFamily('monospace'); handleApply(); }}
          className="flex-1 py-2 bg-[var(--bg-secondary)] rounded-lg text-white text-sm"
        >
          + Typewriter
        </button>
      </div>

      {/* Controls */}
      <div className="space-y-4">
        {/* Font size */}
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-muted)] text-xs w-12">Size</span>
          <input
            type="range"
            min="12"
            max="72"
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-white text-xs w-8">{fontSize}</span>
        </div>

        {/* Colors */}
        <div>
          <p className="text-[var(--text-muted)] text-xs mb-2">Text Color</p>
          <div className="flex gap-1 flex-wrap">
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
        </div>

        <div>
          <p className="text-[var(--text-muted)] text-xs mb-2">Background</p>
          <div className="flex gap-1 flex-wrap">
            {BG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setBgColor(c)}
                className={cn(
                  'w-6 h-6 rounded-full border-2',
                  c === 'transparent' ? 'border-[var(--border-soft)] bg-black' : '',
                  bgColor === c ? 'border-white' : 'border-transparent'
                )}
                style={{ backgroundColor: c === 'transparent' ? 'transparent' : c }}
              />
            ))}
          </div>
        </div>

        {/* Font family */}
        <div>
          <p className="text-[var(--text-muted)] text-xs mb-2">Font</p>
          <div className="flex gap-1">
            {FONTS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFontFamily(f.value)}
                className={cn(
                  'px-2 py-1 rounded text-xs',
                  fontFamily === f.value
                    ? 'bg-[var(--accent-primary)] text-white'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
                )}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* Align */}
        <div className="flex gap-1">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAlign(a)}
              className={cn(
                'flex-1 py-1 rounded flex items-center justify-center',
                align === a
                  ? 'bg-[var(--accent-primary)] text-white'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
              )}
            >
              {a === 'left' && (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" x2="21" y1="6" y2="6" /><line x1="3" x2="15" y1="12" y2="12" /><line x1="3" x2="18" y1="18" y2="18" />
                </svg>
              )}
              {a === 'center' && (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" x2="21" y1="6" y2="6" /><line x1="6" x2="18" y1="12" y2="12" /><line x1="4" x2="20" y1="18" y2="18" />
                </svg>
              )}
              {a === 'right' && (
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" x2="21" y1="6" y2="6" /><line x1="9" x2="21" y1="12" y2="12" /><line x1="6" x2="21" y1="18" y2="18" />
                </svg>
              )}
            </button>
          ))}
        </div>

        {/* Bold toggle */}
        <button
          onClick={() => setBold(!bold)}
          className={cn(
            'w-full py-2 rounded font-bold',
            bold ? 'bg-white text-black' : 'bg-[var(--bg-secondary)] text-white'
          )}
        >
          Bold
        </button>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleApply}
            disabled={!text.trim()}
            className="flex-1 py-2 bg-[var(--accent-primary)] text-white rounded font-medium disabled:opacity-50"
          >
            {overlay ? 'Update' : 'Add Text'}
          </button>
          {overlay && (
            <button
              onClick={onDelete}
              className="px-4 py-2 bg-red-600 text-white rounded"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}