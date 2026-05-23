'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { MainLayout } from '@/components/layout/main-layout';
import { createClient } from '@/lib/supabase/client';
import { MediaPicker } from '@/components/story/creator/media-picker';
import { TextTool } from '@/components/story/creator/text-tool';
import { DrawingTool } from '@/components/story/creator/drawing-tool';
import { FiltersPanel } from '@/components/story/creator/filters-panel';
import { CropPanel } from '@/components/story/creator/crop-panel';
import { AudienceSelector } from '@/components/story/creator/audience-selector';
import { uploadMedia, RateLimitError } from '@/lib/media';
import { createPoll, createQuestion, createCountdown } from '@/services/stickers';

const StoryPreview = dynamic(() => import('@/components/story/creator/story-preview').then(mod => ({ default: mod.StoryPreview })), {
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

interface Overlay {
  id: string;
  type: 'text' | 'sticker' | 'drawing' | 'gif' | 'poll' | 'question' | 'countdown';
  x: number;
  y: number;
  scale: number;
  rotation: number;
  data: {
    content?: string;
    color?: string;
    backgroundColor?: string;
    fontSize?: number;
    fontFamily?: string;
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
    // Sticker data
    stickerType?: string;
    text?: string;
    question?: string;
    options?: string[];
    title?: string;
    endTime?: string;
    // GIF data
    gifUrl?: string;
  };
}

interface FilterSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  grayscale: boolean;
  warmth: number;
}

export default function CreateStoryPage() {
  const router = useRouter();
  const supabase = createClient();

  // State
  const [media, setMedia] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [activeTool, setActiveTool] = useState<'none' | 'text' | 'drawing' | 'filters' | 'crop'>('none');
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
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<{ name: string; artist: string; previewUrl: string; coverUrl: string } | null>(null);
  const [showAudienceSelector, setShowAudienceSelector] = useState(false);
  const [toast, setToast] = useState<{ message: string; countdown: number } | null>(null);

  // Countdown toast timer
  const toastTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRef = useRef<HTMLVideoElement>(null);

  // Handle media selected
  const handleMediaSelected = useCallback((file: File, previewUrl: string, type: 'image' | 'video') => {
    setMediaFile(file);
    setMedia({ url: previewUrl, type });
    setOverlays([]);
    setDrawingData(null);
    setFilters({
      brightness: 100,
      contrast: 100,
      saturation: 100,
      blur: 0,
      grayscale: false,
      warmth: 0,
    });
  }, []);

  // Handle text overlay added
  const handleAddText = useCallback((textData: {
    content: string;
    color: string;
    backgroundColor: string;
    fontSize: number;
    fontFamily: string;
    align: 'left' | 'center' | 'right';
  }) => {
    const newOverlay: Overlay = {
      id: `text-${Date.now()}`,
      type: 'text',
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
      data: textData,
    };
    setOverlays(prev => [...prev, newOverlay]);
    setSelectedOverlayId(newOverlay.id);
    setActiveTool('text');
  }, []);

  // Handle overlay update
  const handleUpdateOverlay = useCallback((id: string, updates: Partial<Overlay>) => {
    setOverlays(prev =>
      prev.map(o => (o.id === id ? { ...o, ...updates } : o))
    );
  }, []);

  // Handle overlay delete
  const handleDeleteOverlay = useCallback((id: string) => {
    setOverlays(prev => prev.filter(o => o.id !== id));
    if (selectedOverlayId === id) {
      setSelectedOverlayId(null);
    }
  }, [selectedOverlayId]);

  // Handle drawing save
  const handleDrawingSave = useCallback((dataUrl: string) => {
    setDrawingData(dataUrl);
  }, []);

  // Handle GIF selected
  const handleGifSelected = useCallback((gifUrl: string) => {
    const newOverlay: Overlay = {
      id: `gif-${Date.now()}`,
      type: 'gif',
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
      data: { gifUrl },
    };
    setOverlays(prev => [...prev, newOverlay]);
    setSelectedOverlayId(newOverlay.id);
    setShowGifPicker(false);
  }, []);

  // Handle sticker added
  const handleStickerAdded = useCallback((stickerType: string, data: any) => {
    const newOverlay: Overlay = {
      id: `sticker-${Date.now()}`,
      type: 'sticker',
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
      data: { stickerType, ...data },
    };
    setOverlays(prev => [...prev, newOverlay]);
    setSelectedOverlayId(newOverlay.id);
    setShowStickerPicker(false);
  }, []);

  // Handle music selected
  const handleMusicSelected = useCallback((track: { name: string; artist: string; previewUrl: string; coverUrl: string }) => {
    setSelectedMusic(track);
    setShowMusicPicker(false);
  }, []);

  // Handle post story
  const handlePost = async () => {
    if (!media || !mediaFile) return;

    setIsUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please sign in to post a story');
        return;
      }

      // Upload media with compression
      const uploadResult = await uploadMedia(mediaFile, undefined, 'story');

      // Determine media type
      const mediaType = uploadResult.duration ? 'video' : 'image';

      // Insert story - build payload dynamically to handle missing columns
      const storyPayload: Record<string, any> = {
        user_id: user.id,
        media_url: uploadResult.url,
        media_type: mediaType,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      // Try with visibility first, fallback without if column missing
      let story: { id: string } | null = null;

      const { data: insertedStory, error: storyError } = await supabase
        .from('stories')
        .insert({
          ...storyPayload,
          visibility: visibility,
        })
        .select()
        .single();

      if (storyError) {

        // If visibility column doesn't exist (code 42703), retry without it
        if (storyError.code === '42703' || storyError.message?.includes('visibility')) {
          const retryResult = await supabase
            .from('stories')
            .insert(storyPayload)
            .select()
            .single();

          if (retryResult.error) {
            alert(`Failed to create story: ${retryResult.error.message}`);
            return;
          }
          story = retryResult.data;
        } else {
          alert(`Failed to create story: ${storyError.message}`);
          return;
        }
      } else {
        story = insertedStory;
      }

      if (!story) {
        alert('Failed to create story: no story returned');
        return;
      }

      // Save overlays and interactive stickers
      if (overlays.length > 0) {
        const overlayRecords: any[] = [];
        let zIndex = 0;

        for (const o of overlays) {
          // Handle interactive stickers separately
          if (o.type === 'poll' && o.data.question && o.data.options) {
            await createPoll(story.id, o.data.question, o.data.options[0], o.data.options[1]);
          } else if (o.type === 'question' && o.data.question) {
            await createQuestion(story.id, o.data.question);
          } else if (o.type === 'countdown' && o.data.title) {
            // For countdown, we need end_time - default to 24 hours from now if not provided
            const endTime = o.data.endTime || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            await createCountdown(story.id, o.data.title, endTime);
          } else {
            // Regular overlay
            overlayRecords.push({
              story_id: story.id,
              overlay_type: o.type,
              payload: JSON.stringify(o.data),
              z_index: zIndex++,
            });
          }
        }

        if (overlayRecords.length > 0) {
          const { error: overlayError } = await supabase
            .from('story_overlays')
            .insert(overlayRecords);

          if (overlayError) {
          }
        }
      }

      // Save drawing as overlay if exists
      if (drawingData) {
        await supabase.from('story_overlays').insert({
          story_id: story.id,
          overlay_type: 'drawing',
          payload: JSON.stringify({ data: drawingData }),
          z_index: 999,
        });
      }

      // Save music if selected
      if (selectedMusic) {
        await supabase.from('story_music').insert({
          story_id: story.id,
          track_name: selectedMusic.name,
          artist: selectedMusic.artist,
          preview_url: selectedMusic.previewUrl,
          cover_url: selectedMusic.coverUrl,
          start_time: 0,
          duration: 15,
        });
      }

      router.push('/feed');
    } catch (err: any) {
      if (err instanceof RateLimitError) {
        showToast(`Upload limit reached. Try again in ${err.retryAfterSec}s`, err.retryAfterSec);
      } else {
        const message = err?.message || 'Failed to post story';
        alert(message);
        console.error('[StoryPost]', err);
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Handle save draft
  const handleSaveDraft = async () => {
    if (!media) return;

    setIsSavingDraft(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('Please sign in to save draft');
        return;
      }

      let mediaUrl = media.url;

      // If it's a local preview, we need to upload first
      if (mediaFile && media.url.startsWith('blob:')) {
        const fileExt = mediaFile.name.split('.').pop();
        const fileName = `drafts/${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('story-drafts')
          .upload(fileName, mediaFile);

        if (uploadError) {
        } else {
          const { data: urlData } = supabase.storage
            .from('story-drafts')
            .getPublicUrl(fileName);
          mediaUrl = urlData.publicUrl;
        }
      }

      // Save draft
      const { error: draftError } = await supabase
        .from('story_drafts')
        .upsert({
          user_id: user.id,
          media_url: mediaUrl,
          media_type: media?.type,
          visibility,
          overlays: JSON.stringify(overlays),
          drawing_data: drawingData ? JSON.stringify({ data: drawingData }) : null,
          filters: JSON.stringify(filters),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (draftError) {
        alert('Failed to save draft');
      } else {
        alert('Draft saved!');
        router.push('/feed');
      }
    } catch (err) {
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (media) {
      if (confirm('Discard this story?')) {
        router.push('/feed');
      }
    } else {
      router.push('/feed');
    }
  };

  // If no media selected, show media picker
  if (!media) {
    return (
      <MainLayout>
        <MediaPicker onMediaSelected={handleMediaSelected} onCancel={() => router.push('/feed')} />
      </MainLayout>
    );
  }

  // Render editor
  return (
    <MainLayout>
      <div className="min-h-screen bg-black flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border-subtle)]">
          <button onClick={handleCancel} className="text-white hover:text-[var(--text-muted)]">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" /><path d="m6 6 12 12" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            {/* Tool buttons */}
            <button
              onClick={() => setActiveTool(activeTool === 'text' ? 'none' : 'text')}
              className={`p-2 rounded-full ${activeTool === 'text' ? 'bg-[var(--accent-primary)]' : 'hover:bg-[var(--bg-secondary)]'}`}
              title="Text"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="4 7 4 4 20 4 20 7" /><line x1="9" x2="15" y1="20" y2="20" /><line x1="12" x2="12" y1="4" y2="20" />
              </svg>
            </button>

            <button
              onClick={() => setActiveTool(activeTool === 'drawing' ? 'none' : 'drawing')}
              className={`p-2 rounded-full ${activeTool === 'drawing' ? 'bg-[var(--accent-primary)]' : 'hover:bg-[var(--bg-secondary)]'}`}
              title="Draw"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" />
              </svg>
            </button>

            <button
              onClick={() => setActiveTool(activeTool === 'filters' ? 'none' : 'filters')}
              className={`p-2 rounded-full ${activeTool === 'filters' ? 'bg-[var(--accent-primary)]' : 'hover:bg-[var(--bg-secondary)]'}`}
              title="Filters"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="m2 12 5.25 5 2.625-2.625L15 12l5.25-5-2.625-2.625L18 7l-5.25 5-2.625-2.625L4 12l5.25 5z" />
              </svg>
            </button>

            <button
              onClick={() => setActiveTool(activeTool === 'crop' ? 'none' : 'crop')}
              className={`p-2 rounded-full ${activeTool === 'crop' ? 'bg-[var(--accent-primary)]' : 'hover:bg-[var(--bg-secondary)]'}`}
              title="Crop"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6.13 1L6 16a2 2 0 0 0 2 2h15" /><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15" />
              </svg>
            </button>

            <button
              onClick={() => setShowGifPicker(true)}
              className="p-2 rounded-full hover:bg-[var(--bg-secondary)]"
              title="GIF"
            >
              <span className="text-lg">GIF</span>
            </button>

            <button
              onClick={() => setShowStickerPicker(true)}
              className="p-2 rounded-full hover:bg-[var(--bg-secondary)]"
              title="Stickers"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
                <path d="M12 12 12 2" />
                <path d="M12 12 2 12" />
                <path d="M12 12 22 12" />
                <path d="M12 12 12 22" />
              </svg>
            </button>

            <button
              onClick={() => setShowMusicPicker(true)}
              className={`p-2 rounded-full hover:bg-[var(--bg-secondary)] ${selectedMusic ? 'text-[var(--accent-primary)]' : ''}`}
              title="Music"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAudienceSelector(!showAudienceSelector)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-white rounded-full border border-white/20"
            >
              <span>{visibility === 'public' ? '🌍' : visibility === 'followers' ? '👥' : '⭐'}</span>
              <span>{visibility === 'public' ? 'Public' : visibility === 'followers' ? 'Followers' : 'Close Friends'}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            <button
              onClick={handleSaveDraft}
              disabled={isSavingDraft}
              className="px-3 py-1.5 text-sm text-[var(--text-muted)] hover:text-white"
            >
              {isSavingDraft ? 'Saving...' : 'Save draft'}
            </button>
            <button
              onClick={handlePost}
              disabled={isUploading}
              className="px-4 py-1.5 rounded-full bg-[var(--accent-primary)] text-[var(--text-inverse)] text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {isUploading ? 'Posting...' : 'Share'}
            </button>
          </div>
        </div>

        {/* Preview */}
        <div className="flex-1 relative">
          <StoryPreview
            media={media}
            filters={filters}
            overlays={overlays}
            selectedOverlayId={selectedOverlayId}
            onSelectOverlay={setSelectedOverlayId}
            onUpdateOverlay={handleUpdateOverlay}
            onDeleteOverlay={handleDeleteOverlay}
            drawingData={drawingData}
            onAddText={handleAddText}
          />

          {/* Tool panels */}
          {activeTool === 'text' && (
            <TextTool
              overlay={overlays.find(o => o.id === selectedOverlayId)}
              onUpdate={(data) => selectedOverlayId && handleUpdateOverlay(selectedOverlayId, { data })}
              onDelete={() => selectedOverlayId && handleDeleteOverlay(selectedOverlayId)}
              onAddNew={handleAddText}
              onClose={() => setActiveTool('none')}
            />
          )}

          {activeTool === 'drawing' && (
            <DrawingTool
              onSave={handleDrawingSave}
              onClear={() => setDrawingData(null)}
              onClose={() => setActiveTool('none')}
            />
          )}

          {activeTool === 'filters' && (
            <div className="absolute bottom-0 left-0 right-0">
              <FiltersPanel filters={filters} onChange={setFilters} previewUrl={media.url} />
            </div>
          )}

          {/* GIF Picker */}
          {showGifPicker && (
            <GifPicker
              onSelect={handleGifSelected}
              onClose={() => setShowGifPicker(false)}
            />
          )}

          {/* Sticker Picker */}
          {showStickerPicker && (
            <StickerPicker
              onAddSticker={handleStickerAdded}
              onClose={() => setShowStickerPicker(false)}
            />
          )}

          {showMusicPicker && (
            <MusicPicker
              onSelect={handleMusicSelected}
              onClose={() => setShowMusicPicker(false)}
            />
          )}

          {/* Audience Selector */}
          {showAudienceSelector && (
            <div className="absolute bottom-0 left-0 right-0">
              <AudienceSelector
                value={visibility}
                onChange={(v) => {
                  setVisibility(v);
                  setShowAudienceSelector(false);
                }}
              />
            </div>
          )}
        </div>

        {/* Hidden canvas for export */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Rate limit toast with countdown */}
        {toast && (
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-3 max-w-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
            </svg>
            <span className="text-sm font-medium">
              {toast.message} ({toast.countdown}s)
            </span>
          </div>
        )}
      </div>
    </MainLayout>
  );
}