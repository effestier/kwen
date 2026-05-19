'use client';

import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { Avatar } from '@/components/ui/avatar';
import { FileUpload } from '@/components/ui/file-upload';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { createPostWithMedia } from '@/app/actions/media';
import { cn } from '@/lib/utils';

interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export default function CreatePage() {
  const [content, setContent] = useState('');
  const [location, setLocation] = useState('');
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [user, setUser] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    async function loadUser() {
      const { data: { user: authUser } } = await supabase.auth.getUser();

      if (!authUser) {
        router.push('/auth/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .eq('id', authUser.id)
        .single();

      setUser(profile);
    }

    loadUser();
  }, []);

  const handlePost = async () => {
    if ((!content.trim() && mediaUrls.length === 0) || saving) return;

    setSaving(true);

    const formData = new FormData();
    formData.set('content', content);
    formData.set('location', location);
    formData.set('mediaUrls', JSON.stringify(mediaUrls));

    const result = await createPostWithMedia(formData);

    if (result.error) {
      setSaving(false);
      return;
    }

    router.push('/feed');
  };

  const removeMedia = (index: number) => {
    setMediaUrls(mediaUrls.filter((_, i) => i !== index));
  };

  return (
    <MainLayout>
      <div className="min-h-screen">
        <div className="sticky top-0 z-10 bg-black/90 backdrop-blur-xl border-b border-[var(--border-subtle)] px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white">New post</h1>
          <button
            onClick={handlePost}
            disabled={(!content.trim() && mediaUrls.length === 0) || saving}
            className="px-4 py-1.5 rounded-full bg-[var(--accent-primary)] text-white text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {saving ? 'Posting...' : 'Post'}
          </button>
        </div>

        {user && (
          <div className="p-4">
            <div className="flex items-start gap-3">
              <Avatar
                src={user.avatar_url}
                name={user.display_name}
                size="md"
              />
              <div className="flex-1">
                <label htmlFor="post-content" className="sr-only">Post content</label>
                <textarea
                  id="post-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="What's happening?"
                  aria-label="What's happening?"
                  className="w-full bg-transparent resize-none focus:outline-none min-h-[150px] text-[15px] text-[var(--text-secondary)] placeholder:text-[var(--text-muted)]"
                  rows={6}
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-[var(--border-subtle)]">
              <div className="flex items-center gap-1">
                <FileUpload
                  type="post"
                  onUpload={(urls) => setMediaUrls([...mediaUrls, ...urls])}
                  multiple
                  maxFiles={4}
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="inline-block"
                >
                  <div aria-hidden="true" className="flex items-center gap-1 p-2 rounded-full hover:bg-[var(--bg-secondary)] text-[var(--accent-primary)] transition-colors-fast">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                  </div>
                </FileUpload>
                <button aria-label="Add GIF" className="p-2 rounded-full hover:bg-[var(--bg-secondary)] text-[var(--accent-primary)] transition-colors-fast">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" /><text x="7" y="15" fontSize="7" fill="currentColor">GIF</text></svg>
                </button>
                <button aria-label="Create poll" className="p-2 rounded-full hover:bg-[var(--bg-secondary)] text-[var(--accent-primary)] transition-colors-fast">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
                </button>
                <button aria-label="Add emoji" className="p-2 rounded-full hover:bg-[var(--bg-secondary)] text-[var(--accent-primary)] transition-colors-fast">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" x2="9.01" y1="9" y2="9" /><line x1="15" x2="15.01" y1="9" y2="9" /></svg>
                </button>
                <button aria-label="Add location" className="p-2 rounded-full hover:bg-[var(--bg-secondary)] text-[var(--accent-primary)] transition-colors-fast">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                </button>
              </div>
              <span className="text-xs text-[var(--text-muted)]">{280 - content.length}</span>
            </div>

            {mediaUrls.length > 0 && (
              <div className={cn(
                'mt-4 grid gap-2',
                mediaUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
              )}>
                {mediaUrls.map((url, index) => (
                  <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-[var(--bg-secondary)]">
                    <img src={url} alt={`Upload ${index + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeMedia(index)}
                      aria-label={`Remove image ${index + 1}`}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center text-sm hover:bg-black/80"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
}

function CreateIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    image: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>,
    gif: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><text x="7" y="15" fontSize="7" fill="currentColor">GIF</text></svg>,
    poll: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>,
    emoji: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" x2="9.01" y1="9" y2="9" /><line x1="15" x2="15.01" y1="9" y2="9" /></svg>,
    location: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>,
  };
  return icons[name] || null;
}