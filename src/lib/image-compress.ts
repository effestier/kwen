/**
 * Client-side image compression and thumbnail generation.
 * Uses Canvas API — no external dependencies.
 */

export interface CompressedImage {
  file: File;
  width: number;
  height: number;
}

export interface ImageProcessingResult {
  optimized: CompressedImage;
  thumbnail: CompressedImage;
}

const MAX_DIMENSION = 1600;
const THUMBNAIL_WIDTH = 320;
const QUALITY = 0.80;

/**
 * Load an image file into an HTMLImageElement.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    img.src = url;
  });
}

/**
 * Draw an image onto a canvas with given dimensions, returning a Blob.
 */
function canvasToBlob(
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to compress image'));
      },
      'image/webp',
      quality
    );
  });
}

/**
 * Calculate scaled dimensions preserving aspect ratio.
 * Returns [width, height] constrained to maxDim on the longest side.
 */
function scaleDimensions(
  origW: number,
  origH: number,
  maxDim: number
): [number, number] {
  if (origW <= maxDim && origH <= maxDim) {
    return [origW, origH];
  }
  const ratio = origW > origH ? maxDim / origW : maxDim / origH;
  return [Math.round(origW * ratio), Math.round(origH * ratio)];
}

/**
 * Compress an image for messaging:
 * - Convert to WebP
 * - Max dimension 1600px
 * - Quality 0.80
 * - Preserve aspect ratio
 */
export async function compressForMessage(file: File): Promise<CompressedImage> {
  const img = await loadImage(file);
  const [w, h] = scaleDimensions(img.naturalWidth, img.naturalHeight, MAX_DIMENSION);
  const blob = await canvasToBlob(img, w, h, QUALITY);
  const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), {
    type: 'image/webp',
    lastModified: Date.now(),
  });
  return { file: compressedFile, width: w, height: h };
}

/**
 * Generate a thumbnail for fast chat rendering:
 * - Width ~320px (no upscaling if source is smaller)
 * - WebP
 * - Low quality for minimal size
 */
export async function generateThumbnail(file: File): Promise<CompressedImage> {
  const img = await loadImage(file);
  // Don't upscale — if source is smaller than thumbnail target, use original size
  const targetW = Math.min(THUMBNAIL_WIDTH, img.naturalWidth);
  const ratio = targetW / img.naturalWidth;
  const w = targetW;
  const h = Math.round(img.naturalHeight * ratio);
  const blob = await canvasToBlob(img, w, h, 0.60);
  const thumbFile = new File([blob], 'thumb.webp', {
    type: 'image/webp',
    lastModified: Date.now(),
  });
  return { file: thumbFile, width: w, height: h };
}

/**
 * Validate raw file before compression.
 */
export function validateRawFile(file: File): string | null {
  const MAX_RAW_SIZE = 20 * 1024 * 1024; // 20MB raw input
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const BLOCKED_EXTENSIONS = ['svg', 'exe', 'zip', 'pdf', 'bat', 'cmd', 'sh', 'js', 'html'];

  if (file.size === 0) return 'Empty file';
  if (file.size > MAX_RAW_SIZE) return 'File too large (max 20MB)';
  if (!ALLOWED_TYPES.includes(file.type)) return 'Unsupported format. Use JPG, PNG, or WebP';

  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  if (BLOCKED_EXTENSIONS.includes(ext)) return `.${ext} files are not allowed`;

  return null;
}
