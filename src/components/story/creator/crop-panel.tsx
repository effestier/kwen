'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface CropPanelProps {
  onCrop?: (aspectRatio: number) => void;
}

const ASPECTS = [
  { name: 'Original', value: 0 },
  { name: '1:1', value: 1 },
  { name: '4:5', value: 4 / 5 },
  { name: '9:16', value: 9 / 16 },
];

export function CropPanel({ onCrop }: CropPanelProps) {
  const [aspect, setAspect] = useState(0);

  return (
    <div className="bg-black/90 backdrop-blur-xl p-4">
      <p className="text-white text-sm mb-3">Aspect Ratio</p>

      <div className="grid grid-cols-4 gap-2">
        {ASPECTS.map((a) => (
          <button
            key={a.name}
            onClick={() => {
              setAspect(a.value);
              onCrop?.(a.value);
            }}
            className={cn(
              'py-2 rounded text-xs',
              aspect === a.value
                ? 'bg-[var(--accent-primary)] text-white'
                : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]'
            )}
          >
            {a.name}
          </button>
        ))}
      </div>

      <p className="text-[var(--text-muted)] text-xs mt-4 text-center">
        Pinch to zoom on mobile • Drag to reposition
      </p>
    </div>
  );
}