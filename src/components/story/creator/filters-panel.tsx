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
}

export function FiltersPanel({ filters, onChange }: FiltersPanelProps) {
  const presetFilters = [
    { name: 'Normal', values: { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: false, warmth: 0 } },
    { name: 'Warm', values: { brightness: 100, contrast: 110, saturation: 110, blur: 0, grayscale: false, warmth: 20 } },
    { name: 'Cool', values: { brightness: 100, contrast: 100, saturation: 90, blur: 0, grayscale: false, warmth: -20 } },
    { name: 'Fade', values: { brightness: 110, contrast: 90, saturation: 80, blur: 0, grayscale: false, warmth: 0 } },
    { name: 'B&W', values: { brightness: 100, contrast: 120, saturation: 0, blur: 0, grayscale: true, warmth: 0 } },
    { name: 'Vintage', values: { brightness: 90, contrast: 90, saturation: 70, blur: 1, grayscale: false, warmth: 30 } },
  ];

  const applyPreset = (preset: typeof presetFilters[0]) => {
    onChange(preset.values);
  };

  const updateFilter = (key: keyof FilterSettings, value: number | boolean) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="bg-black/90 backdrop-blur-xl p-4">
      {/* Presets */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {presetFilters.map((preset) => (
          <button
            key={preset.name}
            onClick={() => applyPreset(preset)}
            className="flex-shrink-0 px-3 py-1.5 bg-[var(--bg-secondary)] rounded text-xs text-white"
          >
            {preset.name}
          </button>
        ))}
      </div>

      {/* Manual controls */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-[var(--text-muted)] text-xs w-16">Brightness</span>
          <input
            type="range"
            min="50"
            max="150"
            value={filters.brightness}
            onChange={(e) => updateFilter('brightness', Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-white text-xs w-8">{filters.brightness}%</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[var(--text-muted)] text-xs w-16">Contrast</span>
          <input
            type="range"
            min="50"
            max="150"
            value={filters.contrast}
            onChange={(e) => updateFilter('contrast', Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-white text-xs w-8">{filters.contrast}%</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[var(--text-muted)] text-xs w-16">Saturation</span>
          <input
            type="range"
            min="0"
            max="200"
            value={filters.saturation}
            onChange={(e) => updateFilter('saturation', Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-white text-xs w-8">{filters.saturation}%</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[var(--text-muted)] text-xs w-16">Blur</span>
          <input
            type="range"
            min="0"
            max="10"
            value={filters.blur}
            onChange={(e) => updateFilter('blur', Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-white text-xs w-8">{filters.blur}</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[var(--text-muted)] text-xs w-16">Warmth</span>
          <input
            type="range"
            min="-50"
            max="50"
            value={filters.warmth}
            onChange={(e) => updateFilter('warmth', Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-white text-xs w-8">{filters.warmth > 0 ? `+${filters.warmth}` : filters.warmth}</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[var(--text-muted)] text-xs w-16">Grayscale</span>
          <button
            onClick={() => updateFilter('grayscale', !filters.grayscale)}
            className={cn(
              'w-12 h-6 rounded-full transition-colors',
              filters.grayscale ? 'bg-[var(--accent-primary)]' : 'bg-[var(--bg-secondary)]'
            )}
          >
            <div
              className={cn(
                'w-5 h-5 rounded-full bg-white transform transition-transform',
                filters.grayscale ? 'translate-x-6' : 'translate-x-0.5'
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
}