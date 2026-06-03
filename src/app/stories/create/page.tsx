'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { ConfirmationDialog } from '@/components/design-system/modal';
import { MediaPicker } from '@/components/story/creator/media-picker';
import { CanvasEditor } from '@/components/story/creator/canvas-editor';
import type { Overlay, FilterSettings } from '@/components/story/creator/canvas-editor';
import { TextTool } from '@/components/story/creator/text-tool';
import { DrawingTool } from '@/components/story/creator/drawing-tool';
import { AudienceSelector } from '@/components/story/creator/audience-selector';
import { uploadMedia, RateLimitError } from '@/lib/media';
import { composeStoryMedia } from '@/lib/media/story-composer';
import type { CropState } from '@/lib/media/story-composer';
import { createPoll, createQuestion, createCountdown } from '@/services/stickers';

const FiltersPanel = dynamic(() => import('@/components/story/creator/filters-panel').then(mod => ({ default: mod.FiltersPanel })), {
  loading: () => null,
  ssr: false,
});

const GifPicker = dynamic(() => import('@/components/story/creator/gif-picker').then(mod => ({ default: mod.GifPicker })), {
  loading: () => null,
  ssr: false,
});

const StickerPicker = dynamic(() => import('@/components/story/creator/sticker-picker').then(mod => ({ default: mod.StickerPicker })), {
  loading: () => null,
  ssr: false,
});

const MusicPicker = dynamic(() => import('@/components/story/creator/music-picker').then(mod => ({ default: mod.MusicPicker })), {
  loading: () => null,
  ssr: false,
});

const CropPanel = dynamic(() => import('@/components/story/creator/crop-panel').then(mod => ({ default: mod.CropPanel })), {
  loading: () => null,
  ssr: false,
});


export default function CreateStoryPage() {
  const router = useRouter();
  const supabase = createClient();

  // Core state
  const [media, setMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [drawingData, setDrawingData] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterSettings>({
    brightness: 100,
    contrast: 100,
    saturation: 100,
    blur: 0,
    grayscale: false,
    warmth: 0,
  });
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'close_friends'>('public');
  const [selectedMusic, setSelectedMusic] = useState<{ name: string; artist: string; previewUrl: string; coverUrl: string; startTime: number; duration: number } | null>(null);
  const [cropState, setCropState] = useState<CropState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [processingMessage, setProcessingMessage] = useState<string>('');

  // UI state
  const [activeTool, setActiveTool] = useState<'none' | 'text' | 'draw' | 'filters' | 'stickers' | 'music' | 'audience' | 'crop' | 'gif'>('none');
  const [isUploading, setIsUploading] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [toast, setToast] = useState<{ message: string; countdown: number } | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Show toast with countdown
  const showToast = useCallback((message: string, countdownSec: number) => {
    setToast({ message, countdown: countdownSec });
    if (toastTimerRef.current) clearInterval(toastTimerRef.current);
    toastTimerRef.current = setInterval(() => {
      setToast(prev => {
        if (!prev || prev.countdown <= 1) {
          if (toastTimerRef.current) clearInterval(toastTimerRef.current);
          return null;
        }
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);
  }, []);

  // Restore draft overlays/filters from localStorage on mount (media file cannot be restored)
  useEffect(() => {
    try {
      const saved = localStorage.getItem('kw-story-draft');
      if (saved) {
        const draft = JSON.parse(saved);
        if (Date.now() - draft.timestamp < 24 * 60 * 60 * 1000) {
          // Restore overlay/filters/music only — media file can't be serialized
          if (draft.overlays?.length || draft.drawingData || draft.selectedMusic) {
            setOverlays(draft.overlays || []);
            setDrawingData(draft.drawingData || null);
            setFilters(draft.filters || { brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: false, warmth: 0 });
            setVisibility(draft.visibility || 'public');
            setSelectedMusic(draft.selectedMusic || null);
            // Media file can't be restored from localStorage — user must re-select
          }
        }
        localStorage.removeItem('kw-story-draft');
      }
    } catch {
      localStorage.removeItem('kw-story-draft');
    }
  }, []);

  // Autosave draft every 30s
  useEffect(() => {
    if (!media) return;
    const interval = setInterval(() => {
      try {
        localStorage.setItem('kw-story-draft', JSON.stringify({
          media,
          overlays,
          drawingData,
          filters,
          visibility,
          selectedMusic,
          timestamp: Date.now(),
        }));
      } catch {
        // ignore
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [media, overlays, drawingData, filters, visibility, selectedMusic]);

  // ---- Handlers ----

  const MAX_VIDEO_STORY_DURATION = 15; // seconds

  const handleMediaSelected = useCallback((file: File, previewUrl: string, type: 'image' | 'video') => {
    if (type === 'video') {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.src = previewUrl;

      const cleanup = () => {
        video.onloadedmetadata = null;
        video.onerror = null;
        video.removeAttribute('src');
        video.load();
      };

      video.onloadedmetadata = () => {
        try {
          if (video.duration > MAX_VIDEO_STORY_DURATION) {
            showToast(`Video must be ${MAX_VIDEO_STORY_DURATION}s or shorter. Yours is ${Math.round(video.duration)}s.`, 5);
            URL.revokeObjectURL(previewUrl);
            return;
          }
          setVideoDuration(video.duration);
          setMediaFile(file);
          setMedia({ url: previewUrl, type: 'video' });
          setOverlays([]);
          setDrawingData(null);
          setFilters({ brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: false, warmth: 0 });
          setSelectedMusic(null);
        } finally {
          cleanup();
        }
      };
      video.onerror = () => {
        showToast('Could not read video file', 5);
        URL.revokeObjectURL(previewUrl);
        cleanup();
      };
      return;
    }

    setMediaFile(file);
    setMedia({ url: previewUrl, type });
    setOverlays([]);
    setDrawingData(null);
    setFilters({ brightness: 100, contrast: 100, saturation: 100, blur: 0, grayscale: false, warmth: 0 });
    setSelectedMusic(null);
  }, []);

  const handleUpdateOverlay = useCallback((id: string, updates: Partial<Overlay>) => {
    setOverlays(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
  }, []);

  const handleDeleteOverlay = useCallback((id: string) => {
    setOverlays(prev => prev.filter(o => o.id !== id));
    if (selectedOverlayId === id) setSelectedOverlayId(null);
  }, [selectedOverlayId]);

  const handleAddOverlay = useCallback((type: Overlay['type'], data: Record<string, unknown>) => {
    const newOverlay: Overlay = {
      id: `${type}-${Date.now()}`,
      type,
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
      data,
    };
    setOverlays(prev => [...prev, newOverlay]);
    setSelectedOverlayId(newOverlay.id);
  }, []);

  const handleTextAddNew = useCallback((data: Record<string, unknown>) => {
    handleAddOverlay('text', data);
  }, [handleAddOverlay]);

  const handleStickerAdded = useCallback((type: string, data: Record<string, unknown>) => {
    // Interactive stickers (poll/question/countdown) use type 'sticker' with stickerType in data
    // Simple stickers (emoji/time/date) use their own type
    const simpleTypes = ['emoji', 'time', 'date', 'mention', 'hashtag', 'link', 'location'];
    if (simpleTypes.includes(type)) {
      handleAddOverlay(type as Overlay['type'], data);
    } else {
      handleAddOverlay('sticker', { stickerType: type, ...data });
    }
    setActiveTool('none');
  }, [handleAddOverlay]);

  const handleGifSelected = useCallback((gifUrl: string) => {
    handleAddOverlay('gif', { gifUrl });
    setActiveTool('none');
  }, [handleAddOverlay]);

  const handleMusicSelected = useCallback((track: { name: string; artist: string; previewUrl: string; coverUrl: string; startTime: number; duration: number }) => {
    setSelectedMusic(track);
    handleAddOverlay('music', { trackName: track.name, artist: track.artist });
    setActiveTool('none');
  }, [handleAddOverlay]);

  const handleDrawingSave = useCallback((dataUrl: string) => {
    setDrawingData(dataUrl);
    setActiveTool('none');
  }, []);

  const handleCropApply = useCallback((transform: { scale: number; offsetX: number; offsetY: number }) => {
    setCropState({ scale: transform.scale, offsetX: transform.offsetX, offsetY: transform.offsetY });
    setActiveTool('none');
  }, []);

  // ---- Post story ----

  const handlePost = async () => {
    if (!media || !mediaFile) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showToast('Please sign in to post a story', 5);
        return;
      }

      // 1. COMPOSE final media (burn overlays, crop, filters into single asset)
      const hasEdits = overlays.some(o => o.type !== 'sticker') || drawingData || cropState.scale !== 1 || cropState.offsetX !== 0 || cropState.offsetY !== 0 || filters.brightness !== 100 || filters.contrast !== 100 || filters.saturation !== 100 || filters.blur > 0 || filters.grayscale || filters.warmth !== 0;

      if (media.type === 'video' && hasEdits) {
        setProcessingMessage('Processing video — this may take 30–60 seconds...');
      } else {
        setProcessingMessage('Preparing story...');
      }

      setUploadProgress(5);
      const composeStart = Date.now();
      const compositedFile = await composeStoryMedia({
        mediaUrl: media.url,
        mediaType: media.type,
        overlays: overlays as any[],
        drawingData,
        filters,
        crop: cropState,
        onProgress: (p) => setUploadProgress(Math.round(5 + p * 0.35)), // 5-40%
      });
      const composeDuration = Date.now() - composeStart;
      setUploadProgress(40);

      // Telemetry: log processing time
      console.info(`[StoryCompose] ${media.type} ${hasEdits ? 'with edits' : 'no edits'} — ${composeDuration}ms (${(compositedFile.size / 1024 / 1024).toFixed(1)}MB)`);
      if (media.type === 'video' && composeDuration > 30000) {
        console.warn(`[StoryCompose] Slow video compositing: ${composeDuration}ms for ${videoDuration}s video`);
      }

      // 2. Upload composited file (skip re-compression — already composited)
      const uploadResult = await uploadMedia(compositedFile, (p) => {
        if (p.stage === 'uploading') setUploadProgress(40 + Math.round(p.percent * 0.4)); // 40-80%
      }, 'story', true);
      setUploadProgress(80);

      const mediaType = media.type === 'video' ? 'video' : 'image';

      // 3. Insert story
      const storyPayload: Record<string, unknown> = {
        user_id: user.id,
        media_url: uploadResult.url,
        media_type: mediaType,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        visibility,
      };

      const { data: story, error: storyError } = await supabase
        .from('stories')
        .insert(storyPayload)
        .select()
        .single();

      let storyData = story;

      if (storyError) {
        if (storyError.code === '42703' || storyError.message?.includes('visibility')) {
          const { data: retryStory, error: retryErr } = await supabase.from('stories').insert({
            user_id: user.id,
            media_url: uploadResult.url,
            media_type: mediaType,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          }).select().single();

          if (retryErr) {
            showToast(`Failed to create story: ${retryErr.message}`, 10);
            return;
          }
          storyData = retryStory;
        } else {
          showToast(`Failed to create story: ${storyError.message}`, 10);
          return;
        }
      }

      if (!storyData) {
        showToast('Failed to create story', 10);
        return;
      }

      setUploadProgress(90);

      // 4. Save ONLY interactive stickers to DB (poll, question, countdown)
      // Text, drawing, gif, emoji, etc. are burned into the composited media
      // H21: Catch and report sticker errors instead of silently swallowing
      const stickerErrors: string[] = [];
      for (const o of overlays) {
        try {
          if (o.type === 'sticker' && o.data.stickerType === 'poll' && o.data.question) {
            const opts = o.data.options as string[];
            if (opts && opts.length >= 2) {
              const result = await createPoll(story.id, o.data.question as string, opts[0], opts[1]);
              if (result.error) stickerErrors.push(`Poll: ${result.error}`);
            }
          } else if (o.type === 'sticker' && o.data.stickerType === 'question' && o.data.question) {
            const result = await createQuestion(story.id, o.data.question as string);
            if (result.error) stickerErrors.push(`Question: ${result.error}`);
          } else if (o.type === 'sticker' && o.data.stickerType === 'countdown' && o.data.title) {
            const endTime = (o.data.endTime as string) || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            const result = await createCountdown(story.id, o.data.title as string, endTime);
            if (result.error) stickerErrors.push(`Countdown: ${result.error}`);
          }
        } catch (err) {
          stickerErrors.push(`Sticker save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
      if (stickerErrors.length > 0) {
        console.error('[Story] Sticker save errors:', stickerErrors);
        showToast(`Story saved, but ${stickerErrors.length} sticker(s) failed`, 5);
      }

      // 5. Save music metadata to DB (viewer needs it for playback)
      if (selectedMusic) {
        await supabase.from('story_music').insert({
          story_id: story.id,
          track_name: selectedMusic.name,
          artist: selectedMusic.artist,
          preview_url: selectedMusic.previewUrl,
          cover_url: selectedMusic.coverUrl,
          start_time: selectedMusic.startTime || 0,
          duration: selectedMusic.duration || 15,
        });
      }

      setUploadProgress(100);

      // Clear draft
      localStorage.removeItem('kw-story-draft');

      router.push('/feed');
    } catch (err: unknown) {
      if (err instanceof RateLimitError) {
        showToast(`Upload limit reached. Try again in ${err.retryAfterSec}s`, err.retryAfterSec);
      } else {
        const message = err instanceof Error ? err.message : 'Failed to post story';
        showToast(message, 10);
        console.error('[StoryPost]', err);
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      setProcessingMessage(''); // M18: Clear processing message on error
    }
  };

  // ---- Cancel ----

  const handleCancel = useCallback(() => {
    if (media) {
      setShowDiscard(true);
    } else {
      router.push('/feed');
    }
  }, [media, router]);

  const confirmDiscard = useCallback(() => {
    localStorage.removeItem('kw-story-draft');
    setShowDiscard(false);
    router.push('/feed');
  }, [router]);

  // ---- No media: show picker ----

  if (!media) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[var(--bg-primary)]" style={{ height: '100dvh' }}>
        <MediaPicker onMediaSelected={handleMediaSelected} onCancel={() => router.push('/feed')} />
      </div>
    );
  }

  // ---- Render editor ----

  return (
    <>
      <CanvasEditor
        media={media}
        filters={filters}
        overlays={overlays}
        selectedOverlayId={selectedOverlayId}
        onSelectOverlay={setSelectedOverlayId}
        onUpdateOverlay={handleUpdateOverlay}
        onDeleteOverlay={handleDeleteOverlay}
        drawingData={drawingData}
        onOpenText={() => setActiveTool('text')}
        onOpenDraw={() => setActiveTool('draw')}
        onOpenStickers={() => setActiveTool('stickers')}
        onOpenFilters={() => setActiveTool('filters')}
        onOpenMusic={() => setActiveTool('music')}
        onOpenAudience={() => setActiveTool('audience')}
        onClose={handleCancel}
        onPost={handlePost}
        isPosting={isUploading}
      >
        {/* Upload progress bar */}
        {isUploading && (
          <div className="px-4 pb-2">
            <div className="h-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-white rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-white/50 text-xs text-center mt-1">
              {uploadProgress < 40
                ? processingMessage
                : uploadProgress < 80
                  ? 'Uploading...'
                  : 'Posting...'}
            </p>
          </div>
        )}

        {/* Post button row */}
        <div className="flex items-center justify-between px-4 py-2">
          <button
            onClick={() => setActiveTool('crop')}
            className="text-white/60 text-xs hover:text-white"
          >
            Crop
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTool('audience')}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-white/60 hover:text-white rounded-full border border-white/15"
            >
              <span>{visibility === 'public' ? '🌍' : visibility === 'followers' ? '👥' : '⭐'}</span>
              <span>{visibility === 'public' ? 'Public' : visibility === 'followers' ? 'Followers' : 'Close Friends'}</span>
            </button>
            <button
              onClick={handlePost}
              disabled={isUploading || !media}
              className="px-5 py-2 rounded-full bg-white text-black text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {isUploading ? 'Posting...' : 'Share'}
            </button>
          </div>
        </div>
      </CanvasEditor>

      {/* Tool overlays — rendered on top of canvas editor */}

      {activeTool === 'text' && (
        <TextTool
          overlay={selectedOverlayId ? overlays.find(o => o.id === selectedOverlayId) as any : undefined}
          onUpdate={(data) => selectedOverlayId && handleUpdateOverlay(selectedOverlayId, { data })}
          onDelete={() => { selectedOverlayId && handleDeleteOverlay(selectedOverlayId); setActiveTool('none'); }}
          onAddNew={handleTextAddNew}
          onClose={() => setActiveTool('none')}
        />
      )}

      {activeTool === 'draw' && (
        <DrawingTool
          onSave={handleDrawingSave}
          onClear={() => setDrawingData(null)}
          onClose={() => setActiveTool('none')}
        />
      )}

      {activeTool === 'filters' && (
        <div className="fixed bottom-0 left-0 right-0 z-[55]">
          <FiltersPanel filters={filters} onChange={setFilters} previewUrl={media.url} />
        </div>
      )}

      {activeTool === 'stickers' && (
        <StickerPicker
          onAddSticker={handleStickerAdded}
          onClose={() => setActiveTool('none')}
        />
      )}

      {activeTool === 'gif' && (
        <GifPicker
          onSelect={handleGifSelected}
          onClose={() => setActiveTool('none')}
        />
      )}

      {activeTool === 'music' && (
        <MusicPicker
          onSelect={handleMusicSelected}
          onClose={() => setActiveTool('none')}
        />
      )}

      {activeTool === 'audience' && (
        <div className="fixed bottom-0 left-0 right-0 z-[55]">
          <AudienceSelector
            value={visibility}
            onChange={(v) => { setVisibility(v); setActiveTool('none'); }}
          />
        </div>
      )}

      {activeTool === 'crop' && (
        <CropPanel
          mediaUrl={media.url}
          mediaType={media.type}
          onCrop={handleCropApply}
          onClose={() => setActiveTool('none')}
        />
      )}

      {/* Rate limit toast — top safe area */}
      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 z-[70] bg-[var(--destructive)] text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 max-w-sm" style={{ top: 'max(env(safe-area-inset-top), 12px)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
          <span className="text-sm font-medium">{toast.message} ({toast.countdown}s)</span>
        </div>
      )}

      <ConfirmationDialog
        isOpen={showDiscard}
        onClose={() => setShowDiscard(false)}
        onConfirm={confirmDiscard}
        title="Discard story?"
        message="Your story will be lost if you leave."
        confirmText="Discard"
        cancelText="Keep editing"
        variant="destructive"
      />
    </>
  );
}
