'use client'

import { useState, useCallback, useRef } from 'react'
import Cropper from 'react-easy-crop'
import { hapticLight, hapticMedium } from '@/lib/haptics'

export type CropRatio = '4:5'

/** Only ratio allowed — 4:5 for all posts */
export const DEFAULT_RATIO: CropRatio = '4:5'
export const FIXED_ASPECT = 4 / 5

interface CropState {
  crop: { x: number; y: number }
  zoom: number
  croppedAreaPixels: { x: number; y: number; width: number; height: number } | null
}

interface ImageCropperProps {
  src: string
  ratio: CropRatio
  onRatioChange: (ratio: CropRatio) => void
  onCrop: (blob: Blob, width: number, height: number) => void
  onSkip: () => void
  imageIndex?: number
  totalImages?: number
}

const RATIOS: { label: string; value: CropRatio; aspect?: number }[] = [
  { label: '4:5', value: '4:5', aspect: FIXED_ASPECT },
]

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: { x: number; y: number; width: number; height: number }
): Promise<{ blob: Blob; width: number; height: number }> {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  // Cap output at 1920px
  const maxDim = 1920
  let outW = Math.round(pixelCrop.width)
  let outH = Math.round(pixelCrop.height)
  if (outW > maxDim || outH > maxDim) {
    const scale = maxDim / Math.max(outW, outH)
    outW = Math.round(outW * scale)
    outH = Math.round(outH * scale)
  }

  canvas.width = outW
  canvas.height = outH

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outW,
    outH
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve({ blob, width: outW, height: outH })
        else reject(new Error('Canvas toBlob failed'))
      },
      'image/webp',
      0.92
    )
  })
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (error) => reject(error))
    image.setAttribute('crossOrigin', 'anonymous')
    image.src = url
  })
}

export function ImageCropper({ src, ratio, onRatioChange, onCrop, onSkip, imageIndex, totalImages }: ImageCropperProps) {
  const [cropState, setCropState] = useState<CropState>({
    crop: { x: 0, y: 0 },
    zoom: 1,
    croppedAreaPixels: null,
  })
  const [processing, setProcessing] = useState(false)
  const lastTapRef = useRef(0)

  const aspect = FIXED_ASPECT // Always 4:5 — no other ratios allowed

  const onCropChange = useCallback((crop: { x: number; y: number }) => {
    setCropState(prev => ({ ...prev, crop }))
  }, [])

  const onZoomChange = useCallback((zoom: number) => {
    setCropState(prev => ({ ...prev, zoom }))
  }, [])

  const onCropComplete = useCallback(
    (_croppedArea: unknown, croppedAreaPixels: { x: number; y: number; width: number; height: number }) => {
      setCropState(prev => ({ ...prev, croppedAreaPixels }))
    },
    []
  )

  const handleApplyCrop = useCallback(async () => {
    if (!cropState.croppedAreaPixels) return
    setProcessing(true)
    try {
      const { blob, width, height } = await getCroppedImg(src, cropState.croppedAreaPixels)
      hapticMedium()
      onCrop(blob, width, height)
    } catch {
      // fallback — skip
      onSkip()
    } finally {
      setProcessing(false)
    }
  }, [cropState.croppedAreaPixels, src, onCrop, onSkip])

  const handleRatioChange = useCallback((r: CropRatio) => {
    hapticLight()
    onRatioChange(r)
    // Reset zoom when changing ratio
    setCropState(prev => ({ ...prev, zoom: 1, crop: { x: 0, y: 0 } }))
  }, [onRatioChange])

  const handleReset = useCallback(() => {
    hapticLight()
    setCropState(prev => ({ ...prev, zoom: 1, crop: { x: 0, y: 0 } }))
  }, [])

  const handleContainerClick = useCallback(() => {
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      // Double tap — toggle zoom
      hapticLight()
      setCropState(prev => ({
        ...prev,
        zoom: prev.zoom > 1.2 ? 1 : 2,
        crop: prev.zoom > 1.2 ? { x: 0, y: 0 } : prev.crop,
      }))
    }
    lastTapRef.current = now
  }, [])

  return (
    <div className="flex-1 flex flex-col">
      {/* Image counter */}
      {totalImages && totalImages > 1 && imageIndex !== undefined && (
        <div className="flex items-center justify-center py-2 bg-black">
          <span className="text-xs font-medium text-white/60">
            {imageIndex + 1} of {totalImages}
          </span>
        </div>
      )}
      {/* Image crop area */}
      <div className="flex-1 relative bg-black" onClick={handleContainerClick}>
        <Cropper
          image={src}
          crop={cropState.crop}
          zoom={cropState.zoom}
          aspect={aspect}
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={onCropComplete}
          cropShape="rect"
          objectFit="contain"
          showGrid={false}
          style={{
            containerStyle: { borderRadius: 0 },
            cropAreaStyle: {
              border: '2px solid rgba(255,255,255,0.8)',
              borderRadius: '0',
            },
            mediaStyle: { transition: 'transform 0.15s ease-out' },
          }}
        />
        {/* Rule of thirds grid overlay */}
        {cropState.croppedAreaPixels && (
          <div className="absolute inset-0 pointer-events-none z-10" style={{
            // Position grid over the crop area using CSS
          }}>
            <div className="absolute border-2 border-white/80" style={{
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: aspect ? `${Math.min(100, 100 * (aspect || 1))}%` : '100%',
              height: aspect ? `${Math.min(100, 100 / (aspect || 1))}%` : '100%',
              display: 'none', // react-easy-crop handles the visible border
            }}>
              <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/15" />
              <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/15" />
              <div className="absolute top-1/3 left-0 right-0 h-px bg-white/15" />
              <div className="absolute top-2/3 left-0 right-0 h-px bg-white/15" />
            </div>
          </div>
        )}
      </div>

      {/* Zoom slider */}
      <div className="flex items-center gap-3 px-4 py-2 bg-[var(--bg-secondary)]">
        <button
          onClick={() => {
            hapticLight()
            setCropState(prev => ({ ...prev, zoom: Math.max(1, prev.zoom - 0.2) }))
          }}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] active:scale-90 transition-transform"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
        <input
          type="range"
          min={1}
          max={5}
          step={0.05}
          value={cropState.zoom}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          className="flex-1 h-1 accent-white cursor-pointer"
        />
        <button
          onClick={() => {
            hapticLight()
            setCropState(prev => ({ ...prev, zoom: Math.min(5, prev.zoom + 0.2) }))
          }}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] active:scale-90 transition-transform"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        </button>
      </div>

      {/* Ratio fixed at 4:5 — no other options allowed */}
      <div className="flex items-center justify-center py-2 bg-[var(--bg-secondary)]">
        {cropState.zoom > 1.1 && (
          <button
            onClick={handleReset}
            className="px-2.5 py-1.5 rounded-full text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={onSkip}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] transition-colors active:scale-[0.98]"
        >
          Skip
        </button>
        <button
          onClick={handleApplyCrop}
          disabled={processing}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-[var(--text-inverse)] bg-white text-black hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {processing ? 'Applying...' : 'Apply Crop'}
        </button>
      </div>
    </div>
  )
}
