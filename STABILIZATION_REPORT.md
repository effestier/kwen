# KWEN STABILIZATION AUDIT — FULL FAILURE REPORT
**Date:** 2026-05-24
**Surfaces Audited:** 8 (Auth, Stories, Messaging, Feed, Explore, Profile, UI/Design, Mobile/APK)
**Total Failures:** 116

---

## CRITICAL (Product-Breaking) — 14 failures

### C1. Voice recorder completely broken on APK — missing RECORD_AUDIO permission
- **File:** `android/app/src/main/AndroidManifest.xml`
- **Bug:** `android.permission.RECORD_AUDIO` not declared. `getUserMedia({ audio: true })` fails immediately in Android WebView.
- **Also:** No `@capacitor/microphone` plugin installed. No runtime permission request flow.
- **Root cause:** Permission was never added when voice recorder was built.
- **Confidence:** 99%

### C2. Explore cursor pagination completely broken — RPC parameter name mismatch
- **File:** `src/app/explore/page.tsx:87` vs `supabase/migrations/042_feed_explore_rebuild.sql:202`
- **Bug:** Client sends `p_cursor_at`, DB expects `p_cursor_time`. PostgREST ignores unknown params, uses default NULL. Every infinite scroll page returns the same 30 posts.
- **Confidence:** 100%

### C3. Explore post search returns empty — results silently discarded
- **File:** `src/app/explore/page.tsx:171-189`
- **Bug:** When `searchMode === 'posts'`, results from `search_explore` RPC are fetched then immediately thrown away (`setSearchResults([])`). Missing `else if` branch.
- **Confidence:** 100%

### C4. Explore tag links all 404 — missing route page
- **File:** No file at `src/app/explore/tags/[tag]/page.tsx`
- **Bug:** Trending tags, tag search results, and post hashtags all link to `/explore/tags/{tag}` which doesn't exist.
- **Confidence:** 100%

### C5. Feed has zero error handling — skeleton forever on failure
- **File:** `src/app/feed/page.tsx:100-192`
- **Bug:** `loadData()` has no try/catch. Any Supabase failure leaves `loading=true` permanently. No error state, no retry.
- **Confidence:** 100%

### C6. Feed pagination cursor broken for Trending/Discovery tiers
- **File:** `supabase/migrations/042_feed_explore_rebuild.sql:107,134,161`
- **Bug:** Cursor `(created_at, id)` doesn't match ORDER BY for Tier 2 (engagement_score DESC) or Tier 3 (random()). Posts silently dropped on page 2+.
- **Confidence:** 100%

### C7. Unsend doesn't reflect in realtime on receiver
- **File:** `src/app/messages/page.tsx:341-352`
- **Bug:** Realtime UPDATE handler only processes `delivered_at`/`seen_at`. Content/type/media changes ignored. Receiver sees old message until reload.
- **Confidence:** HIGH

### C8. Reaction swap (UPDATE) not handled in realtime
- **File:** `src/app/messages/page.tsx:449-474`
- **Bug:** Reactions realtime handler processes INSERT and DELETE but not UPDATE. Swapped emoji doesn't reflect for other user.
- **Confidence:** HIGH

### C9. New conversations from realtime silently dropped
- **File:** `src/app/messages/page.tsx:263-284`
- **Bug:** If message arrives for conversation not in list, it's ignored. New conversations never appear until reload.
- **Confidence:** HIGH

### C10. Story swipe-up reply gesture completely dead
- **File:** `src/components/story/story-viewer.tsx:539-557`
- **Bug:** Upward swipe check (`dy < -80`) is nested inside `if (isVertical && dy > 0)` block. Condition can never be true. Reply-by-swipe-up is impossible.
- **Confidence:** 100%

### C11. Story draft restore produces non-postable state
- **File:** `src/app/stories/create/page.tsx:93-117`
- **Bug:** Draft saves preview URL to localStorage but `File` objects can't serialize. Restored draft has no `mediaFile` → `handlePost` silently returns.
- **Confidence:** HIGH

### C12. Story share link route doesn't exist — 404
- **File:** `src/components/story/share-story-modal.tsx:84`
- **Bug:** Share URL points to `/stories/view/{id}` which has no route page.
- **Confidence:** 100%

### C13. Middleware never validates sessions — expired/tampered JWTs pass through
- **File:** `src/middleware.ts:58-68`
- **Bug:** Only checks cookie existence (`request.cookies.has`), never calls `supabase.auth.getUser()`. Expired tokens pass. Cookie names `sb-access-token`/`sb-refresh-token` are dead code (actual names are project-ref based).
- **Confidence:** HIGH

### C14. Profile infinite loading skeleton on any error
- **File:** `src/components/profile/profile-client.tsx:76-222`
- **Bug:** `loadData()` has no try/catch. Any Supabase failure leaves skeleton forever.
- **Confidence:** 99%

---

## HIGH (UX-Breaking) — 38 failures

### Feed
- **H1.** Double-tap broken on video posts — `stopPropagation` in VideoPlayer kills event chain (`video-player.tsx:50`)
- **H2.** Like and Save mutually exclusive — shared `loading` flag (`post-card.tsx:68,83,111`)
- **H3.** `handleDelete` ignores API result, leaks timeout, Undo doesn't clear timer (`post-card.tsx:129-137`)
- **H4.** `isPlaying` desynced when `video.play()` rejects (`video-player.tsx:28-30`)
- **H5.** HeartAnimation particles re-randomize on re-render — jitter (`heart-animation.tsx:59-61`)
- **H6.** Comment like rollback doesn't revert replies (`comments-modal.tsx:171-215`)
- **H7.** Share as DM navigates before share count increments (`share-modal.tsx:38-43`)
- **H8.** Cross-slide double-tap false positives in carousel (`media-carousel.tsx:21-37`)
- **H9.** `get_discovery_feed` returns cross-tier duplicate posts (migration 042)

### Messaging
- **H10.** Auto-scroll hijacks position on every message change (`page.tsx:493`)
- **H11.** Image blob URL not revoked on send failure (`page.tsx:883,932-937`)
- **H12.** Voice blob URL not revoked on send failure (`page.tsx:987-993,1010-1013`)
- **H13.** Lightbox uses expired signed URLs — no refresh (`page.tsx:1208`)
- **H14.** Voice speed control undiscoverable — button hidden at speed=1 (`voice-message.tsx:124-130`)
- **H15.** Conversations hard-capped at 20, no pagination (`page.tsx:203`)
- **H16.** Messages hard-capped at 200, no pagination (`services/messages.ts:223`)
- **H17.** No date separators in message list

### Stories
- **H18.** Double-fire `goToNext()` from rAF + video `onEnded` race (`story-viewer.tsx:404-439`)
- **H19.** Direct mutation of story prop for music data (`story-viewer.tsx:204-211`)
- **H20.** Blur/warmth filters missing from video FFmpeg pipeline (`story-composer.ts:529-535`)
- **H21.** Interactive sticker creation errors silently swallowed (`create/page.tsx:333-345`)
- **H22.** Stories sorted newest-first but viewer expects chronological (`stories.tsx:69-75`)
- **H23.** Video audio bleeds through transitions — not paused (`story-viewer.tsx:312-332`)
- **H24.** Archive viewer navigation fires on touchStart, breaks long-press (`archive-viewer.tsx:82-93`)
- **H25.** Highlight viewer video duration hardcoded to 15s (`highlight-viewer.tsx:54`)
- **H26.** Archive viewer video has no onEnded — never auto-advances (`archive-viewer.tsx:187-195`)
- **H27.** Archive grid fetches all 200 stories per month click (`archive-grid.tsx:44`)
- **H28.** Poll options 3-4 silently dropped on save (`create/page.tsx:334-338`)

### Explore
- **H29.** Cursor column doesn't match ORDER BY — posts dropped on page 2+ (migration 042:249,257)
- **H30.** User search bypasses `search_explore` RPC — no blocked/muted filtering (`page.tsx:163-169`)
- **H31.** `search_explore` doesn't filter muted users (migration 042:388)
- **H32.** Click-outside handler broken on mobile — ref overwritten (`page.tsx:248,328`)

### UI/Design
- **H33.** Shadow CSS vars `--shadow-sm/md/lg/xl` never defined — silent no-op (`globals.css:264-267`)
- **H34.** Poll sticker entirely hardcoded light-only colors (`poll-sticker.tsx`)
- **H35.** Question sticker hardcoded purple/pink, no theme tokens (`question-sticker.tsx`)
- **H36.** Brand config still has `#0095f6` blue in 3 properties (`brand/config.ts:38-40`)
- **H37.** Light theme CSS vars use Instagram blue (`globals.css:26-27,39`)
- **H38.** Light theme JS tokens use Instagram blue (`themes.ts:79-80,87`)

### Mobile/APK
- **H39.** Story video recording uses unsupported WebM format on Android (`media-picker.tsx:158-162`)
- **H40.** No `overscroll-behavior: contain` — bounce conflicts with gestures
- **H41.** Messages keyboard resize + dvh causes scroll jumps (`page.tsx:1038`)

---

## MEDIUM (Edge Cases / Degraded UX) — 42 failures

### Messaging
- **M1.** Reaction DELETE likely broken without REPLICA IDENTITY FULL (`page.tsx:460-473`)
- **M2.** Global reactions channel — not filtered by conversation (`page.tsx:439`)
- **M3.** Unbounded last-message query — fetches ALL messages (`page.tsx:225-229`)
- **M4.** Voice recorder slide-cancel + lock creates broken state (`voice-recorder.tsx:258-283`)
- **M5.** Conversation preview stale on unsend (`page.tsx:263-284`)
- **M6.** TOCTOU race in conversation creation (`services/messages.ts:158-193`)
- **M7.** Failed message delete leaks blob URLs (`page.tsx:725-728`)
- **M8.** No voice duration cap (Instagram = 1 min)
- **M9.** Duplicate stale `app/actions/messages.ts` (609 lines dead code)
- **M10.** `message-repo.ts` uses `deleted_at` column that's never set
- **M11.** `handleSaveMedia` signed URL expiry without refresh in some paths

### Stories
- **M12.** Drawing tool saveState has stale historyIndex closure (`drawing-tool.tsx:59-73`)
- **M13.** Share message insert bypasses DM service — missing sender_id (`share-story-modal.tsx:86-93`)
- **M14.** Camera recording WebM → compositing expects MP4 metadata issues
- **M15.** Sticker picker emoji search is a no-op (`sticker-picker.tsx:137-139`)
- **M16.** Highlight viewer setInterval drifts over time (`highlight-viewer.tsx:94-108`)
- **M17.** Viewer boundary swipe eats tap gesture (`story-viewer.tsx:560-568`)
- **M18.** Story create processingMessage not cleared on error (`create/page.tsx:240-378`)

### Feed
- **M19.** `toggleLike`/`toggleSave` TOCTOU race condition (`services/posts.ts:11-28,34-63`)
- **M20.** `handleCopyLink` no error handling for clipboard API (`share-modal.tsx:16-25`)
- **M21.** VideoPlayer overlay timer not cleaned on unmount (`video-player.tsx:17,45-46`)

### Explore
- **M22.** Category filter client-side only — sparse grids (`page.tsx:65-79`)
- **M23.** `get_explore_feed` returns columns client ignores — wasted DB compute (`page.tsx:18-30`)
- **M24.** `get_suggested_users` sorts by reason string over strength (migration 042:354)

### Auth
- **M25.** Login/register ignore `redirect` query param (`password-login-form.tsx:45,119`)
- **M26.** Password reset `redirectTo` hardcoded to production URL (`auth.ts:326`)
- **M27.** `useAuth` double-initialization race — two parallel profile fetches (`use-auth.ts:55-87`)
- **M28.** Sign-out races with AuthGuard redirect (`sidebar.tsx:411-414`)
- **M29.** Rate limit errors hidden on password reset (`auth.ts:320-323`)

### Profile
- **M30.** Race condition — no cleanup in useEffect (`profile-client.tsx:76-222`)
- **M31.** Follow toggle closure staleness on rapid clicks (`profile-client.tsx:224-243`)
- **M32.** No error state for partial data failure (`profile-client.tsx:152-218`)
- **M33.** Nonexistent profile redirects to own profile instead of showing 404 (`profile-client.tsx:84-98`)

### UI/Design
- **M34.** Canvas editor hardcoded gray-300/gray-500/black (`canvas-editor.tsx:326,333`)
- **M35.** Font family mismatch between globals.css (SF Pro) and themes.ts (Segoe/Roboto)
- **M36.** `--radius-sm` CSS var referenced but never defined (`globals.css:333`)
- **M37.** Mobile nav active profile uses hardcoded bg-white text-black (`mobile-nav.tsx:168`)
- **M38.** `--text-link: #e0f1ff` is blue-tinted, not monochrome (`globals.css:76,132`)
- **M39.** Service worker in Capacitor causes stale asset cache (`layout.tsx:106`)

### Mobile/APK
- **M40.** No native camera integration — bare HTML file inputs
- **M41.** Story gesture detection ambiguous on diagonal swipes (`story-viewer.tsx:506-571`)
- **M42.** Mic stream leak on cancel during async getUserMedia (`voice-recorder.tsx:192-208`)
- **M43.** Main content clipped behind gesture bar — no safe-area-inset-bottom (`main-layout.tsx:22`)
- **M44.** No push notification infrastructure
- **M45.** Keyboard resize mode (Ionic) wrong for Next.js (`capacitor.ts:21`)

---

## LOW (Polish / Non-Critical) — 16 failures

- **L1.** OTP aria-label says "8" instead of "6" (`password-login-form.tsx:367`)
- **L2.** `reportMessage` is a no-op stub that shows success (`services/messages.ts:584-586`)
- **L3.** No ordering guarantee for realtime message inserts (`page.tsx:397`)
- **L4.** Inconsistent signed URL auth pattern (`services/messages.ts:278-285`)
- **L5.** Drawing canvas sizing vs Capacitor status bar (`drawing-tool.tsx:42-52`)
- **L6.** Story reply input hidden when keyboard opens (`story-viewer.tsx:997-1029`)
- **L7.** Music picker trim allows 60s but story limit is 15s (`music-picker.tsx:270-277`)
- **L8.** Camera timer `startTimer` captures `capturePhoto` via stale closure (`media-picker.tsx:97-115`)
- **L9.** No Capacitor deep link handling for auth flows
- **L10.** Avatar fallback colors include blue-adjacent tones (cyan, indigo) (`avatar.tsx:28-38`)
- **L11.** Duplicate `bg-teal-600` in avatar colors (`avatar.tsx:29,37`)
- **L12.** Sticky cookie names `sb-access-token`/`sb-refresh-token` are dead code (`middleware.ts`)
- **L13.** `sendOTP` silently swallows non-rate-limit errors as success (`auth.ts:64-70`)
- **L14.** No Capacitor back button edge-swipe exclusion in story viewer
- **L15.** Voice recorder cleanup race with getUserMedia promise (`voice-recorder.tsx:192-208`)
- **L16.** `cleanup_expired_stories` deletes without archiving (migration 007:88-111)

---

## FIX ORDER (Phase 3)

### Tier 1 — Critical Product-Breaking (fix first)
1. C1. Add RECORD_AUDIO permission + Capacitor microphone plugin
2. C2. Fix explore RPC parameter name mismatch
3. C3. Fix explore post search result handling
4. C4. Create `/explore/tags/[tag]` route page
5. C5. Add try/catch to feed loadData
6. C6. Fix feed pagination cursor for trending/discovery tiers
7. C7. Handle message content UPDATE in realtime
8. C8. Handle reaction UPDATE in realtime
9. C9. Handle new conversations from realtime
10. C10. Fix story swipe-up reply gesture logic
11. C11. Fix story draft restore (File serialization)
12. C12. Fix story share link route
13. C13. Implement proper Supabase SSR middleware
14. C14. Add try/catch to profile loadData

### Tier 2 — High UX-Breaking (fix after Tier 1)
All H1-H41 items, prioritized by user-facing impact.

### Tier 3 — Medium (fix during stabilization)
All M1-M45 items.

### Tier 4 — Low (polish pass)
All L1-L16 items.

---

## VERIFICATION MATRIX (Phase 4)

Every fix requires:
1. Exact reproduction of the bug before fix
2. Implementation of architectural fix (no hacks, no timers, no "probably fixed")
3. Exact verification of fix on: desktop browser, mobile Chrome, Android APK
4. Test matrix documented with actual results
