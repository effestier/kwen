'use client'

import { useRef, useState, useCallback, useEffect } from 'react'

export type CropRatio = 'original' | '1:1' | '4:5' | '16:9'

interface CropState {
  scale: number
  offsetX: number
  offsetY: number
}

interface ImageCropperProps {
  src: string
  ratio: CropRatio
  onRatioChange: (ratio: CropRatio) => void
  onCrop: (blob: Blob, width: number, height: number) => void
  onSkip: () => void
}

const RATIOS: { label: string; value: CropRatio; aspect?: number }[] = [
  { label: 'Original', value: 'original' },
  { label: '1:1', value: '1:1', aspect: 1 },
  { label: '4:5', value: '4:5', aspect: 4 / 5 },
  { label: '16:9', value: '16:9', aspect: 16 / 9 },
]

export function ImageCropper({ src, ratio, onRatioChange, onCrop, onSkip }: ImageCropperProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 })
  const [crop, setCrop] = useState<CropState>({ scale: 1, offsetX: 0, offsetY: 0 })
  const dragRef = useRef<{ startX: number; startY: number; startOffX: number; startOffY: number } | null>(null)
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null)

  const aspect = RATIOS.find(r => r.value === ratio)?.aspect

  const handleImageLoad = useCallback(() => {
    const img = imgRef.current
    if (!img) return
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight })
    setImgLoaded(true)
    // Reset crop when image loads
    setCrop({ scale: 1, offsetX: 0, offsetY: 0 })
  }, [])

  // Reset crop when ratio changes
  useEffect(() => {
    setCrop({ scale: 1, offsetX: 0, offsetY: 0 })
  }, [ratio])

  // Mouse / touch drag
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffX: crop.offsetX,
      startOffY: crop.offsetY,
    }
  }, [crop.offsetX, crop.offsetY])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setCrop(prev => ({
      ...prev,
      offsetX: dragRef.current!.startOffX + dx,
      offsetY: dragRef.current!.startOffY + dy,
    }))
  }, [])

  const handlePointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  // Pinch zoom
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault()
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      pinchRef.current = { startDist: dist, startScale: crop.scale }
    }
  }, [crop.scale])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault()
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const newScale = Math.max(1, Math.min(5, pinchRef.current.startScale * (dist / pinchRef.current.startDist)))
      setCrop(prev => ({ ...prev, scale: newScale }))
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    pinchRef.current = null
  }, [])

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    setCrop(prev => ({ ...prev, scale: Math.max(1, Math.min(5, prev.scale + delta)) }))
  }, [])

  // Generate cropped image
  const handleApplyCrop = useCallback(async () => {
    const img = imgRef.current
    const container = containerRef.current
    if (!img || !container) return

    const containerRect = container.getBoundingClientRect()
    const contW = containerRect.width
    const contH = containerRect.height

    // Image display size (object-contain within container)
    const imgRatio = imgSize.w / imgSize.h
    const contRatio = contW / contH
    let displayW: number, displayH: number
    if (imgRatio > contRatio) {
      displayW = contW
      displayH = contW / imgRatio
    } else {
      displayH = contH
      displayW = contH * imgRatio
    }

    // Scaled display size
    const scaledW = displayW * crop.scale
    const scaledH = displayH * crop.scale

    // Image position (centered + offset)
    const imgX = (contW - scaledW) / 2 + crop.offsetX
    const imgY = (contH - scaledH) / 2 + crop.offsetY

    // Determine crop rect in container coords
    let cropX: number, cropY: number, cropW: number, cropH: number
    if (aspect) {
      // Fit aspect ratio within container
      if (contW / contH > aspect) {
        cropH = contH
        cropW = contH * aspect
      } else {
        cropW = contW
        cropH = contW / aspect
      }
      cropX = (contW - cropW) / 2
      cropY = (contH - cropH) / 2
    } else {
      cropX = 0; cropY = 0; cropW = contW; cropH = contH
    }

    // Convert crop rect to image pixel coords
    const scaleX = imgSize.w / scaledW
    const scaleY = imgSize.h / scaledH

    const srcX = Math.max(0, (cropX - imgX) * scaleX)
    const srcY = Math.max(0, (cropY - imgY) * scaleY)
    const srcW = Math.min(imgSize.w - srcX, cropW * scaleX)
    const srcH = Math.min(imgSize.h - srcY, cropH * scaleY)

    // Output canvas
    const outW = Math.round(Math.min(srcW, 1920))
    const outH = Math.round(Math.min(srcH, 1920))

    const canvas = document.createElement('canvas')
    canvas.width = outW
    canvas.height = outH
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH)

    canvas.toBlob((blob) => {
      if (blob) onCrop(blob, outW, outH)
    }, 'image/webp', 0.92)
  }, [imgSize, crop, aspect, onCrop])

  return (
    <div className="flex-1 flex flex-col">
      {/* Image preview area */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden bg-black touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        {/* Crop overlay */}
        {aspect && imgLoaded && (
          <div className="absolute inset-0 z-10 pointer-events-none">
            {/* Dark overlay outside crop area */}
            <div className="absolute inset-0 bg-black/50" style={{
              clipPath: `polygon(
                0% 0%, 100% 0%, 100% 100%, 0% 100%,
                0% ${50 - (aspect < 1 ? 50 : 50 / aspect)}%,
                ${50 - (aspect > 1 ? 50 : 50 * aspect)}% ${50 - (aspect < 1 ? 50 : 50 / aspect)}%,
                ${50 - (aspect > 1 ? 50 : 50 * aspect)}% ${50 + (aspect < 1 ? 50 : 50 / aspect)}%,
                0% ${50 + (aspect < 1 ? 50 : 50 / aspect)}%
              )`
            }} />
            {/* Crop border */}
            <div className="absolute border-2 border-white/80" style={{
              top: `${50 - (aspect < 1 ? 50 : 50 / aspect)}%`,
              left: `${50 - (aspect > 1 ? 50 : 50 * aspect)}%`,
              width: `${aspect > 1 ? 100 : 100 * aspect}%`,
              height: `${aspect < 1 ? 100 : 100 / aspect}%`,
            }}>
              {/* Grid lines */}
              <div className="absolute inset-0">
                <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/20" />
                <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/20" />
                <div className="absolute top-1/3 left-0 right-0 h-px bg-white/20" />
                <div className="absolute top-2/3 left-0 right-0 h-px bg-white/20" />
              </div>
            </div>
          </div>
        )}

        {/* Image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt=""
          className="absolute top-1/2 left-1/2 max-w-none"
          style={{
            transform: `translate(-50%, -50%) translate(${crop.offsetX}px, ${crop.offsetY}px) scale(${crop.scale})`,
            maxWidth: 'none',
            objectFit: 'contain',
            width: '100%',
            height: '100%',
          }}
          onLoad={handleImageLoad}
          draggable={false}
        />
      </div>

      {/* Ratio buttons */}
      <div className="flex items-center justify-center gap-2 py-3 px-4 bg-[var(--bg-secondary)]">
        {RATIOS.map((r) => (
          <button
            key={r.value}
            onClick={() => onRatioChange(r.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              ratio === r.value
                ? 'bg-[var(--accent-primary)] text-[var(--text-inverse)]'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={onSkip}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          Skip
        </button>
        <button
          onClick={handleApplyCrop}
          className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-[var(--text-inverse)] bg-[var(--accent-primary)] hover:opacity-90 transition-opacity"
        >
          Apply Crop
        </button>
      </div>
    </div>
  )
}
