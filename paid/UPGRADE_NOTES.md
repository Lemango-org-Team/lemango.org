# Kmoon Start Page — Upgrade Notes

## Major Changes

### 1. Google OAuth Implementation ✨

**Added:**
- **Google Identity Services (gsi) integration** — loads official Google Sign-In library
- **Automatic JWT parsing** — extracts user profile (name, email, picture) from credentials
- **Real sign-in/sign-out** — actual Google authentication, not mocked
- **Profile avatar** — displays user's Google profile picture
- **OAuth setup instructions** in Settings panel

**How it works:**
```javascript
// User clicks "Setup Google Sign-In"
initGoogleSignIn()
  → Google renders official sign-in button
  → User clicks and authenticates
  → handleGoogleSignIn() callback fires
  → JWT is parsed to extract: name, email, picture
  → Profile is saved to localStorage
  → Avatar and name update in sidebar
```

**Files changed:**
- `index.html` — Added `<script src="https://accounts.google.com/gsi/client"></script>`
- `app.js` — Added `initGoogleSignIn()` and `handleGoogleSignIn(response)`

---

### 2. Media Persistence with IndexedDB 🎵🖼️

**Problem:** Background images and music were lost on page reload because they were only in memory

**Solution:** Use IndexedDB (browser database) for file storage

**Added functions:**
```javascript
db()              // Opens IndexedDB connection
putMedia()        // Saves file to IndexedDB
getMedia()        // Retrieves file from IndexedDB
deleteMedia()     // Removes file from IndexedDB
loadBackgroundFile() // Loads background on startup (NEW)
```

**New startup sequence:**
```
Page loads
  → load localStorage settings
  → render UI
  → loadBackgroundFile() — checks IndexedDB for saved background
  → display background if found
  → load weather, clock, apps, etc.
```

**Files changed:**
- `app.js` — Added `loadBackgroundFile()` and `initialize()` function

---

### 3. Improved State Management

**Before:**
```javascript
state={
  backgroundFile: null,  // Lost on reload
  currentSong: null      // Lost on reload
};
```

**After:**
```javascript
state={
  backgroundFile: null,     // Can be loaded from IndexedDB
  currentSong: null,        // Tracked during session
  profile: {...},           // Persisted to localStorage
  playlist: [...]           // Persisted to localStorage
};
```

**Key change:** Added `state.backgroundFile` to hold the blob when background is active

---

### 4. Better Error Handling & Logging

**Added:**
- Try/catch around IndexedDB operations
- Console logs for debugging
- Graceful fallbacks if IndexedDB fails
- Better error messages in UI

---

## Code Structure

### New Functions

#### `initGoogleSignIn()`
Initializes Google Sign-In button with user's Client ID. Checks if Client ID exists, renders button, sets up callback.

#### `handleGoogleSignIn(response)`
Receives JWT from Google, parses it (uses atob + JSON.parse), extracts name/email/picture, saves to state and localStorage.

#### `loadBackgroundFile()`
On page load, checks if "background" exists in IndexedDB. If found, sets state.backgroundFile and applies it immediately.

#### `initialize()`
New startup function that runs initialization in the correct order:
1. Render apps grid
2. Render profile
3. Apply theme
4. Load background from IndexedDB
5. Show clock
6. Fetch weather
7. Setup Google Sign-In
8. Start repeating timers

### Modified Functions

#### `applyCustomBackground()`
Now checks `state.backgroundFile` (blob from IndexedDB) in addition to URL

#### `setBackgroundFile(file)`
Now saves to IndexedDB with `await putMedia()` and sets `state.backgroundFile`

#### `clearBackground()`
Now deletes from IndexedDB with `await deleteMedia()`

#### `playSong(i)`
Uses `URL.createObjectURL()` to play blob files from IndexedDB

#### `addMusic(file)`
Already used IndexedDB, no changes needed

---

## Storage Comparison

### localStorage (5MB limit, fast, for small data)
✓ App list and order
✓ Theme preferences
✓ Settings
✓ Notes
✓ Playlist metadata (names, URLs)
✓ Profile info (text only)

### IndexedDB (Larger, for binary data)
✓ Background images/videos (blobs)
✓ Music files (audio blobs)
✗ Profile pictures are loaded from Google's CDN (not stored locally)

---

## How to Test Persistence

### Background Test
1. Settings → Custom Background
2. Upload an image
3. Verify it shows
4. Refresh page (F5 or Cmd+R)
5. Background should still show
6. Upload a video
7. Refresh page
8. Video should still play

### Music Test
1. Music panel
2. Upload a .mp3 file
3. See it in playlist
4. Refresh page
5. Song should still be in playlist
6. Click play — should play from IndexedDB blob

### Settings Test
1. Settings → change weather location
2. Settings → change search engine
3. Add an app
4. Refresh page
5. All should persist

### Profile Test
1. Add Google Client ID in Settings
2. Click "Setup Google Sign-In"
3. Click Google button and sign in
4. Verify name/email/avatar appear
5. Refresh page
6. Profile should still show
7. Click sign out
8. Refresh page
9. Should show "Guest"

---

## Security Notes

### Google OAuth
- Uses official Google Identity Services library
- JWT is decoded locally (never sent to server)
- User can see what's extracted: name, email, picture
- No API tokens are stored (only profile info)
- Sign-out clears profile from localStorage

### IndexedDB
- Data stored in browser only (not uploaded to any server)
- Isolated per domain/browser/profile
- Cleared when browser cache is cleared
- Users can manually clear with "Reset All Data" button

### Credentials
- Google Client ID should be public (it's only for client-side auth)
- Dropbox App Key should NOT be public (store server-side if used)
- No sensitive data is stored in this app

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| IndexedDB | ✓ | ✓ | ✓ | ✓ |
| Google GSI | ✓ | ✓ | ✓ | ✓ |
| localStorage | ✓ | ✓ | ✓ | ✓ |
| Blob URLs | ✓ | ✓ | ✓ | ✓ |
| Audio Player | ✓ | ✓ | ✓ | ✓ |

---

## Potential Issues & Solutions

### Issue: "Uncaught ReferenceError: google is not defined"
**Cause:** Google script tag failed to load  
**Fix:** Check internet connection, clear browser cache, try incognito mode

### Issue: Background doesn't load after refresh
**Cause:** IndexedDB wasn't used, or quota exceeded  
**Fix:** Open DevTools → Application → IndexedDB → kmoon_media → check if "background" object exists

### Issue: Music files play but are cut off
**Cause:** File wasn't fully written to IndexedDB  
**Fix:** Re-upload the file, check file size, try different audio format

### Issue: Google Sign-In button doesn't appear
**Cause:** Client ID is empty or invalid  
**Fix:** Paste valid Client ID in Settings, wait 1-2 seconds for button to render

### Issue: Profile picture doesn't load
**Cause:** Google's CDN is blocked or image is removed  
**Fix:** Normal — just use fallback initial (first letter of name)

---

## Performance Considerations

### File Size Impact
- Google GSI library: ~40KB (gzipped, loaded from CDN)
- IndexedDB: No additional JS code required (native browser API)
- Total size increase: Minimal

### Memory Usage
- Each blob in IndexedDB uses storage quota (typically 50MB-1GB per domain)
- Blob URLs stay in memory only while tab is open
- Closing tab frees all memory

### Network Impact
- Google profile pictures load from Google's CDN
- Background URLs load from their source
- No data is sent to any server

---

## Future Enhancements

### Easy to Add:
- [ ] Clear individual media files
- [ ] Edit uploaded file metadata
- [ ] Export/import all data as JSON
- [ ] Multiple background profiles
- [ ] Scheduled background changes
- [ ] Last played song resume

### More Complex:
- [ ] Cloud sync via Dropbox API
- [ ] Google Drive integration
- [ ] Spotify playlist embed
- [ ] Custom CSS editor
- [ ] Plugin system

---

## Debugging Tips

### View IndexedDB in DevTools
1. Open DevTools (F12)
2. Go to "Application" tab
3. Left sidebar → "IndexedDB"
4. Click "kmoon_media"
5. See stored media objects

### View localStorage in DevTools
1. Open DevTools (F12)
2. Go to "Application" tab
3. Left sidebar → "Local Storage"
4. Click your domain
5. See all k_* entries

### Check console for errors
1. Open DevTools (F12)
2. Go to "Console" tab
3. Look for any red errors
4. Check if Google script loaded

### Simulate slow network
1. DevTools → Network tab
2. Set throttle to "Slow 3G"
3. Upload file and refresh
4. See loading behavior

---

## Version History

### v2.0 (Current) — Sept 2026
- ✨ Real Google OAuth with gsi/client library
- ✨ IndexedDB persistence for media
- ✨ Improved startup sequence
- ✨ Better error handling
- 🐛 Fixed background not persisting across reloads
- 🐛 Fixed music files disappearing after refresh

### v1.0 — Original
- Basic start page with apps
- Settings and themes
- IndexedDB (unused for backgrounds)
- Placeholder OAuth buttons

---

## Questions?

**For Google OAuth help:**  
Check: https://developers.google.com/identity/gsi/web

**For IndexedDB help:**  
Check: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API

**For this app:**  
Review the code comments in app.js, they explain the logic
