/**
 * Story Compositing Engine
 * Renders all overlays, drawings, crop, and filters into a single final media asset
 * before upload. This ensures WYSIWYG: editor preview == uploaded story == viewer display.
 */

import type { FilterSettings } from '@/components/story/creator/canvas-editor'

// ---- Types ----

export interface CompositeOverlay {
  type: string
  x: number       // percentage 0-100
  y: number       // percentage 0-100
  scale: number   // 0.2-3.0
  rotation: number // degrees
  data: Record<string, unknown>
  created_at?: string
}

export interface CropState {
  scale: number
  offsetX: number  // percentage -100 to 100
  offsetY: number
}

export interface CompositeOptions {
  mediaUrl: string
  mediaType: 'image' | 'video'
  overlays: CompositeOverlay[]
  drawingData: string | null
  filters: FilterSettings
  crop: CropState
  onProgress?: (percent: number) => void
}

// Story output dimensions (9:16)
const STORY_WIDTH = 1080
const STORY_HEIGHT = 1920

// ---- Helpers ----

function buildFilterString(filters: FilterSettings): string {
  const parts: string[] = []
  if (filters.brightness !== 100) parts.push(`brightness(${filters.brightness}%)`)
  if (filters.contrast !== 100) parts.push(`contrast(${filters.contrast}%)`)
  if (filters.saturation !== 100) parts.push(`saturate(${filters.saturation}%)`)
  if (filters.blur > 0) parts.push(`blur(${filters.blur}px)`)
  if (filters.grayscale) parts.push('grayscale(100%)')
  if (filters.warmth !== 0) {
    parts.push(`sepia(${Math.abs(filters.warmth) / 100})`)
    parts.push(`hue-rotate(${filters.warmth > 0 ? -10 : 10}deg)`)
  }
  return parts.length > 0 ? parts.join(' ') : 'none'
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const metrics = ctx.measureText(testLine)
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }
  if (currentLine) lines.push(currentLine)
  return lines
}

// ---- Font mapping (CSS → Canvas) ----

const FONT_MAP: Record<string, string> = {
  'sans-serif': 'system-ui, -apple-system, sans-serif',
  'Georgia, serif': 'Georgia, serif',
  'Arial Black, Impact, sans-serif': 'Arial Black, Impact, sans-serif',
  'cursive': 'cursive',
  'monospace': 'monospace',
}

function resolveFont(fontFamily?: string): string {
  if (!fontFamily) return 'system-ui, -apple-system, sans-serif'
  return FONT_MAP[fontFamily] || fontFamily
}

// ---- Overlay rendering to canvas ----

export function renderOverlayToCanvas(
  ctx: CanvasRenderingContext2D,
  overlay: CompositeOverlay,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const px = (overlay.x / 100) * canvasWidth
  const py = (overlay.y / 100) * canvasHeight
  const scale = overlay.scale || 1
  const rotation = (overlay.rotation || 0) * Math.PI / 180

  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(rotation)
  ctx.scale(scale, scale)

  switch (overlay.type) {
    case 'text':
      renderTextOverlay(ctx, overlay.data)
      break
    case 'drawing':
      // Drawing is handled separately (full-canvas layer)
      break
    case 'gif':
      // GIF rendered as static image (first frame)
      break
    case 'emoji':
      renderEmojiOverlay(ctx, overlay.data)
      break
    case 'time':
      renderTimeOverlay(ctx, overlay.data, overlay.created_at)
      break
    case 'date':
      renderDateOverlay(ctx, overlay.data, overlay.created_at)
      break
    case 'music':
      renderMusicOverlay(ctx, overlay.data)
      break
    case 'mention':
    case 'hashtag':
    case 'link':
    case 'location':
      renderTextBubbleOverlay(ctx, overlay.data)
      break
  }

  ctx.restore()
}

function renderTextOverlay(ctx: CanvasRenderingContext2D, data: Record<string, unknown>) {
  const content = (data.content as string) || 'Text'
  const color = (data.color as string) || '#FFFFFF'
  const fontSize = (data.fontSize as number) || 24
  const fontFamily = resolveFont(data.fontFamily as string)
  const bold = !!data.bold
  const neon = !!data.neon
  const align = (data.align as 'left' | 'center' | 'right') || 'center'
  const bg = data.backgroundColor as string
  const bgStyle = data.bgStyle as string

  // Scale font size relative to canvas (editor uses viewport-relative sizes)
  const scaledSize = Math.round(fontSize * (STORY_WIDTH / 400))

  ctx.font = `${bold ? 'bold ' : ''}${scaledSize}px ${fontFamily}`
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color

  // Neon glow
  if (neon) {
    ctx.shadowColor = color
    ctx.shadowBlur = scaledSize * 0.8
  }

  // Background
  const maxWidth = STORY_WIDTH * 0.6
  const lines = wrapText(ctx, content, maxWidth)
  const lineHeight = scaledSize * 1.3
  const totalHeight = lines.length * lineHeight
  const maxWidthLine = Math.max(...lines.map(l => ctx.measureText(l).width))

  if (bg && bg !== 'transparent') {
    ctx.shadowBlur = 0
    ctx.fillStyle = bg
    const padX = scaledSize * 0.6
    const padY = scaledSize * 0.4
    const rectX = align === 'center' ? -maxWidthLine / 2 - padX : align === 'right' ? -maxWidthLine - padX : -padX
    const rectY = -totalHeight / 2 - padY
    const rectW = maxWidthLine + padX * 2
    const rectH = totalHeight + padY * 2
    const radius = bgStyle === 'pill' ? rectH / 2 : scaledSize * 0.3

    drawRoundedRect(ctx, rectX, rectY, rectW, rectH, radius)
    ctx.fill()

    // Reset fill for text
    ctx.fillStyle = color
    if (neon) {
      ctx.shadowColor = color
      ctx.shadowBlur = scaledSize * 0.8
    }
  }

  // Draw text lines
  const startY = -totalHeight / 2 + lineHeight / 2
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 0, startY + i * lineHeight)
  }

  ctx.shadowBlur = 0
}

function renderEmojiOverlay(ctx: CanvasRenderingContext2D, data: Record<string, unknown>) {
  const emoji = (data.emoji as string) || '😀'
  ctx.font = `${STORY_WIDTH * 0.12}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, 0, 0)
}

function renderTimeOverlay(ctx: CanvasRenderingContext2D, _data: Record<string, unknown>, createdAt?: string) {
  const time = new Date(createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const fontSize = STORY_WIDTH * 0.035
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`
  const w = ctx.measureText(time).width + fontSize * 1.5
  const h = fontSize * 2

  // Background pill
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  drawRoundedRect(ctx, -w / 2, -h / 2, w, h, h / 2)
  ctx.fill()

  // Text
  ctx.fillStyle = '#000000'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(time, 0, 0)
}

function renderDateOverlay(ctx: CanvasRenderingContext2D, _data: Record<string, unknown>, createdAt?: string) {
  const date = new Date(createdAt || Date.now()).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  const fontSize = STORY_WIDTH * 0.035
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`
  const w = ctx.measureText(date).width + fontSize * 1.5
  const h = fontSize * 2

  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  drawRoundedRect(ctx, -w / 2, -h / 2, w, h, h / 2)
  ctx.fill()

  ctx.fillStyle = '#000000'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(date, 0, 0)
}

function renderMusicOverlay(ctx: CanvasRenderingContext2D, data: Record<string, unknown>) {
  const trackName = (data.trackName as string) || 'Music'
  const fontSize = STORY_WIDTH * 0.03
  ctx.font = `500 ${fontSize}px system-ui, sans-serif`
  const icon = '🎵 '
  const text = `${icon}${trackName}`
  const w = ctx.measureText(text).width + fontSize * 1.5
  const h = fontSize * 2

  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  drawRoundedRect(ctx, -w / 2, -h / 2, w, h, h / 2)
  ctx.fill()

  ctx.fillStyle = '#000000'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 0)
}

function renderTextBubbleOverlay(ctx: CanvasRenderingContext2D, data: Record<string, unknown>) {
  const text = (data.text as string) || ''
  const fontSize = STORY_WIDTH * 0.035
  ctx.font = `500 ${fontSize}px system-ui, sans-serif`
  const w = ctx.measureText(text).width + fontSize * 1.5
  const h = fontSize * 2

  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  drawRoundedRect(ctx, -w / 2, -h / 2, w, h, h / 2)
  ctx.fill()

  ctx.fillStyle = '#000000'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 0, 0)
}

// ---- IMAGE COMPOSITING ----

export async function compositeImageStory(options: CompositeOptions): Promise<File> {
  const { mediaUrl, overlays, drawingData, filters, crop, onProgress } = options

  onProgress?.(5)

  // 1. Load base image
  const bitmap = await createImageBitmap(await loadImage(mediaUrl))
  onProgress?.(15)

  // 2. Create output canvas
  const canvas = document.createElement('canvas')
  canvas.width = STORY_WIDTH
  canvas.height = STORY_HEIGHT
  const ctx = canvas.getContext('2d')!

  // 3. Black background
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT)

  // 4. Apply crop transform + draw base image
  ctx.save()
  ctx.translate(STORY_WIDTH / 2, STORY_HEIGHT / 2)
  ctx.scale(crop.scale, crop.scale)
  ctx.translate(
    (crop.offsetX / 100) * STORY_WIDTH,
    (crop.offsetY / 100) * STORY_HEIGHT,
  )

  // Apply CSS filters
  ctx.filter = buildFilterString(filters)

  // Scale image to fill canvas (object-fit: cover)
  const imgAspect = bitmap.width / bitmap.height
  const canvasAspect = STORY_WIDTH / STORY_HEIGHT
  let drawW: number, drawH: number
  if (imgAspect > canvasAspect) {
    drawH = STORY_HEIGHT
    drawW = drawH * imgAspect
  } else {
    drawW = STORY_WIDTH
    drawH = drawW / imgAspect
  }
  ctx.drawImage(bitmap, -drawW / 2, -drawH / 2, drawW, drawH)
  ctx.restore()
  onProgress?.(30)

  // 5. Draw drawing layer
  if (drawingData) {
    try {
      const drawImg = await loadImage(drawingData)
      ctx.drawImage(drawImg, 0, 0, STORY_WIDTH, STORY_HEIGHT)
    } catch {
      // Drawing load failed, skip
    }
  }
  onProgress?.(40)

  // 6. Draw each overlay
  for (const overlay of overlays) {
    // Skip drawing type (handled above) and interactive stickers
    if (overlay.type === 'drawing') continue
    if (overlay.type === 'sticker') continue // poll/question/countdown — saved to DB, not composited

    // Handle GIF overlays — load and draw the image
    if (overlay.type === 'gif' && overlay.data.gifUrl) {
      try {
        const gifImg = await loadImage(overlay.data.gifUrl as string)
        const px = (overlay.x / 100) * STORY_WIDTH
        const py = (overlay.y / 100) * STORY_HEIGHT
        const scale = overlay.scale || 1
        const rotation = (overlay.rotation || 0) * Math.PI / 180

        ctx.save()
        ctx.translate(px, py)
        ctx.rotate(rotation)
        ctx.scale(scale, scale)
        const gifSize = STORY_WIDTH * 0.3
        ctx.drawImage(gifImg, -gifSize / 2, -gifSize / 2, gifSize, gifSize)
        ctx.restore()
      } catch {
        // GIF load failed, skip
      }
      continue
    }

    renderOverlayToCanvas(ctx, overlay, STORY_WIDTH, STORY_HEIGHT)
  }
  onProgress?.(70)

  // 7. Export as WebP
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error('Canvas export failed')),
      'image/webp',
      0.92,
    )
  })
  onProgress?.(90)

  // 8. Wrap as File
  const file = new File([blob], 'story.webp', { type: 'image/webp' })
  onProgress?.(100)
  return file
}

// ---- VIDEO COMPOSITING ----

export async function compositeVideoStory(options: CompositeOptions): Promise<File> {
  const { mediaUrl, overlays, drawingData, filters, crop, onProgress } = options

  // Check if we have any overlays that need compositing (exclude interactive stickers — they go to DB)
  const hasOverlays = overlays.some(o =>
    o.type !== 'sticker'
  )
  const hasDrawing = !!drawingData
  const hasCrop = crop.scale !== 1 || crop.offsetX !== 0 || crop.offsetY !== 0
  const hasFilters = filters.brightness !== 100 || filters.contrast !== 100 ||
    filters.saturation !== 100 || filters.blur > 0 || filters.grayscale || filters.warmth !== 0

  // If nothing to composite, return raw video
  if (!hasOverlays && !hasDrawing && !hasCrop && !hasFilters) {
    const response = await fetch(mediaUrl)
    const blob = await response.blob()
    return new File([blob], 'story.mp4', { type: 'video/mp4' })
  }

  onProgress?.(5)

  // Reuse shared FFmpeg singleton (loads WASM once, caches for subsequent calls)
  const { loadFFmpeg } = await import('./video-compress')
  const ffmpeg = await loadFFmpeg()
  onProgress?.(15)

  // Write input video to MEMFS
  const videoResponse = await fetch(mediaUrl)
  const videoData = new Uint8Array(await videoResponse.arrayBuffer())
  await ffmpeg.writeFile('input.mp4', videoData)
  onProgress?.(25)

  // Render overlay composite as PNG on transparent background
  const overlayCanvas = document.createElement('canvas')
  overlayCanvas.width = STORY_WIDTH
  overlayCanvas.height = STORY_HEIGHT
  const octx = overlayCanvas.getContext('2d')!

  // Clear (transparent)
  octx.clearRect(0, 0, STORY_WIDTH, STORY_HEIGHT)

  // Draw drawing layer
  if (drawingData) {
    try {
      const drawImg = await loadImage(drawingData)
      octx.drawImage(drawImg, 0, 0, STORY_WIDTH, STORY_HEIGHT)
    } catch { /* skip */ }
  }

  // Draw non-interactive overlays
  for (const overlay of overlays) {
    if (overlay.type === 'drawing') continue
    if (overlay.type === 'sticker') continue

    if (overlay.type === 'gif' && overlay.data.gifUrl) {
      try {
        const gifImg = await loadImage(overlay.data.gifUrl as string)
        const px = (overlay.x / 100) * STORY_WIDTH
        const py = (overlay.y / 100) * STORY_HEIGHT
        const scale = overlay.scale || 1
        const rotation = (overlay.rotation || 0) * Math.PI / 180
        octx.save()
        octx.translate(px, py)
        octx.rotate(rotation)
        octx.scale(scale, scale)
        const gifSize = STORY_WIDTH * 0.3
        octx.drawImage(gifImg, -gifSize / 2, -gifSize / 2, gifSize, gifSize)
        octx.restore()
      } catch { /* skip */ }
      continue
    }

    renderOverlayToCanvas(octx, overlay, STORY_WIDTH, STORY_HEIGHT)
  }

  // Export overlay as PNG
  const overlayBlob = await new Promise<Blob>((resolve, reject) => {
    overlayCanvas.toBlob(
      (b) => b ? resolve(b) : reject(new Error('Overlay export failed')),
      'image/png',
    )
  })
  const overlayData = new Uint8Array(await overlayBlob.arrayBuffer())
  await ffmpeg.writeFile('overlay.png', overlayData)
  onProgress?.(40)

  // Build filter_complex
  const filterParts: string[] = []

  // Crop
  if (hasCrop) {
    const cropW = Math.round(STORY_WIDTH / crop.scale)
    const cropH = Math.round(STORY_HEIGHT / crop.scale)
    const cropX = Math.round(STORY_WIDTH / 2 - cropW / 2 - (crop.offsetX / 100) * STORY_WIDTH)
    const cropY = Math.round(STORY_HEIGHT / 2 - cropH / 2 - (crop.offsetY / 100) * STORY_HEIGHT)
    filterParts.push(`crop=${cropW}:${cropH}:${Math.max(0, cropX)}:${Math.max(0, cropY)}`)
  }

  // Scale to story dimensions
  filterParts.push(`scale=${STORY_WIDTH}:${STORY_HEIGHT}:force_original_aspect_ratio=decrease`)
  filterParts.push(`pad=${STORY_WIDTH}:${STORY_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`)

  // Filters (eq filter for brightness/contrast/saturation + blur + warmth)
  if (hasFilters) {
    const eqParts: string[] = []
    if (filters.brightness !== 100) eqParts.push(`brightness=${(filters.brightness - 100) / 100}`)
    if (filters.contrast !== 100) eqParts.push(`contrast=${filters.contrast / 100}`)
    if (filters.saturation !== 100) eqParts.push(`saturation=${filters.saturation / 100}`)
    if (eqParts.length > 0) filterParts.push(`eq=${eqParts.join(':')}`)
    if (filters.grayscale) filterParts.push('hue=s=0')
    // H20: Blur support via gblur
    if (filters.blur > 0) filterParts.push(`gblur=sigma=${filters.blur}`)
    // H20: Warmth support via colorchannelmixer (sepia-like warm tone)
    if (filters.warmth !== 0) {
      const warmthAbs = Math.abs(filters.warmth) / 100;
      if (filters.warmth > 0) {
        // Warm: boost red, reduce blue
        filterParts.push(`colorchannelmixer=rr=${1 + warmthAbs * 0.3}:bb=${1 - warmthAbs * 0.3}`);
      } else {
        // Cool: boost blue, reduce red
        filterParts.push(`colorchannelmixer=rr=${1 - warmthAbs * 0.3}:bb=${1 + warmthAbs * 0.3}`);
      }
    }
  }

  const videoFilter = filterParts.length > 0 ? filterParts.join(',') : 'null'

  // Build FFmpeg command
  const args = [
    '-i', 'input.mp4',
    '-i', 'overlay.png',
    '-filter_complex',
    `[0:v]${videoFilter}[v];[v][1:v]overlay=0:0[outv]`,
    '-map', '[outv]',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-crf', '23',
    '-preset', 'fast',
    '-c:a', 'aac',
    '-b:a', '64k',
    '-movflags', '+faststart',
    '-y',
    'output.mp4',
  ]

  onProgress?.(50)

  // Execute with timeout + guaranteed cleanup
  const COMPOSITING_TIMEOUT = 90000 // 90 seconds
  let outputBlob: Blob

  try {
    await Promise.race([
      ffmpeg.exec(args),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Video compositing timed out')), COMPOSITING_TIMEOUT)
      ),
    ])

    onProgress?.(85)

    // Read output
    const outputData = await ffmpeg.readFile('output.mp4')
    const outputBytes = outputData instanceof Uint8Array
      ? outputData
      : new TextEncoder().encode(outputData as string)
    outputBlob = new Blob(
      [outputBytes.buffer.slice(0) as ArrayBuffer],
      { type: 'video/mp4' }
    )
  } finally {
    // Always clean up MEMFS regardless of success/failure
    try { await ffmpeg.deleteFile('input.mp4') } catch { /* already gone */ }
    try { await ffmpeg.deleteFile('overlay.png') } catch { /* already gone */ }
    try { await ffmpeg.deleteFile('output.mp4') } catch { /* already gone */ }
  }

  onProgress?.(95)

  const file = new File([outputBlob], 'story.mp4', { type: 'video/mp4' })
  onProgress?.(100)
  return file
}

// ---- MAIN ENTRY POINT ----

export async function composeStoryMedia(options: CompositeOptions): Promise<File> {
  if (options.mediaType === 'video') {
    return compositeVideoStory(options)
  }
  return compositeImageStory(options)
}
