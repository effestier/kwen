'use client';

import { cn } from '@/lib/utils';

interface FilterSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  grayscale: boolean;
  warmth: number;
}

interface FiltersPanelProps {
  filters: FilterSettings;
  onChange: (filters: FilterSettings) => void;
  previewUrl?: string;
}

const PRESETS = [
  { name: 'Normal', values: { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: false, warmth: 0 } },
  { name: 'Warm', values: { brightness: 105, contrast: 110, saturation: 120, blur: 0, grayscale: false, warmth: 25 } },
  { name: 'Cool', values: { brightness: 100, contrast: 105, saturation: 85, blur: 0, grayscale: false, warmth: -25 } },
  { name: 'Fade', values: { brightness: 115, contrast: 85, saturation: 75, blur: 0, grayscale: false, warmth: 5 } },
  { name: 'B&W', values: { brightness: 100, contrast: 120, saturation: 0, blur: 0, grayscale: true, warmth: 0 } },
  { name: 'Vintage', values: { brightness: 90, contrast: 85, saturation: 65, blur: 0.5, grayscale: false, warmth: 35 } },
  { name: 'Drama', values: { brightness: 95, contrast: 140, saturation: 110, blur: 0, grayscale: false, warmth: 0 } },
  { name: 'Dream', values: { brightness: 110, contrast: 90, saturation: 130, blur: 1, grayscale: false, warmth: 15 } },
];

export function FiltersPanel({ filters, onChange, previewUrl }: FiltersPanelProps) {
  const getFilterStyle = (f: FilterSettings) => ({
    filter: `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%) blur(${f.blur}px) ${f.grayscale ? 'grayscale(100%)' : ''} ${f.warmth !== 0 ? `sepia(${Math.abs(f.warmth) / 100}) hue-rotate(${f.warmth > 0 ? -10 : 10}deg)` : ''}`.trim(),
  });

  const isActive = (preset: typeof PRESETS[0]) => {
    return Object.keys(preset.values).every(
      key => preset.values[key as keyof FilterSettings] === filters[key as keyof FilterSettings]
    );
  };

  return (
    <div className="bg-black/90 backdrop-blur-xl">
      {/* Preset thumbnails */}
      <div className="flex gap-2 p-3 overflow-x-auto pb-4">
        {PRESETS.map((preset) => (
          <button
            key={preset.name}
            onClick={() => onChange(preset.values)}
            className="flex flex-col items-center gap-1.5 flex-shrink-0"
          >
            <div className={cn(
              'w-16 h-16 rounded-lg overflow-hidden border-2 transition-all',
              isActive(preset) ? 'border-white' : 'border-transparent'
            )}>
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={preset.name}
                  className="w-full h-full object-cover"
                  style={getFilterStyle(preset.values)}
                />
              ) : (
                <div
                  className="w-full h-full bg-gradient-to-br from-gray-500 to-gray-700"
                  style={getFilterStyle(preset.values)}
                />
              )}
            </div>
            <span className={cn(
              'text-[10px]',
              isActive(preset) ? 'text-white font-medium' : 'text-[var(--text-muted)]'
            )}>
              {preset.name}
            </span>
          </button>
        ))}
      </div>

      {/* Manual controls */}
      <div className="px-4 pb-4 space-y-2">
        {[
          { key: 'brightness' as const, label: 'Brightness', min: 50, max: 150 },
          { key: 'contrast' as const, label: 'Contrast', min: 50, max: 150 },
          { key: 'saturation' as const, label: 'Saturation', min: 0, max: 200 },
          { key: 'warmth' as const, label: 'Warmth', min: -50, max: 50 },
        ].map(({ key, label, min, max }) => (
          <div key={key} className="flex items-center gap-3">
            <span className="text-[var(--text-muted)] text-xs w-16">{label}</span>
            <input
              type="range"
              min={min}
              max={max}
              value={filters[key]}
              onChange={(e) => onChange({ ...filters, [key]: Number(e.target.value) })}
              className="flex-1 accent-[var(--accent-primary)]"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
