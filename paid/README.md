# Kmoon Start Page — Upgraded with OAuth & Persistence

## What's New ✨

### Google OAuth Sign-In
- **Real Google Sign-In** via Google Identity Services (gsi/client)
- Automatic profile rendering (name, email, avatar)
- Persistent profile storage across reloads
- One-click sign-out

### Improved Media Persistence
- **IndexedDB** storage for background images/videos (survives reloads)
- **IndexedDB** storage for music files (survives reloads)
- **localStorage** for all settings, apps, notes, and theme preferences
- Automatic media loading on page startup
- Full data reset with single button

## Features
- Real brand logos via Simple Icons CDN with emoji fallbacks
- Left sidebar with profile, Home, My Files, Music, Background and Settings
- **Live Google account profile** with OAuth sign-in/out
- Google Drive and Dropbox connection UI (ready for implementation)
- Searchable My Files area
- Dark, light and custom backgrounds
- **Local image/GIF/video background uploads** (persistent via IndexedDB)
- Background URL support (stored in localStorage)
- **Music upload from local files** (persistent via IndexedDB)
- Music by URL (stored in localStorage)
- Playlist with previous/play/next controls
- Automatic seasonal themes and manual season selection
- Draggable app ordering, notes widget, weather widget, search

## Setup

### Run Locally
```bash
# Python 3
python -m http.server 8000

# Or Python 2
python -m SimpleHTTPServer 8000

# Or Node/npm http-server
npx http-server
```
Then visit: `http://localhost:8000`

### Google OAuth Setup

#### Step 1: Create Google Cloud Project
1. Go to https://console.cloud.google.com
2. Click "Select a Project" → "New Project"
3. Name it "Kmoon" and click Create
4. Wait for project to initialize

#### Step 2: Enable Google+ API
1. Search for "Google+ API" in the search bar
2. Click Google+ API
3. Click "Enable"

#### Step 3: Create OAuth 2.0 Credentials
1. In the left sidebar, click "Credentials"
2. Click "Create Credentials" → "OAuth client ID"
3. If prompted, click "Configure OAuth Consent Screen" first
4. Choose "External" for user type
5. Fill in app name (e.g., "Kmoon")
6. Add your email, save and continue through all steps
7. Return to Credentials, click "Create Credentials" → "OAuth client ID"
8. Select "Web application"
9. Under "Authorized JavaScript origins", add:
   - `http://localhost:8000` (for local testing)
   - Your actual domain when deployed (e.g., `https://example.com`)
10. Click Create

#### Step 4: Add to Kmoon
1. Copy the **Client ID** (the long string, not the secret)
2. Go to Settings in Kmoon → Google Account
3. Paste the Client ID into the text field
4. Click "Setup Google Sign-In"
5. A Google Sign-In button will appear
6. Click it to sign in

### Dropbox Setup (Optional)
1. Go to https://www.dropbox.com/developers/apps
2. Create new app, choose "Scoped access", "Full Dropbox"
3. Get your App Key
4. Add it in Settings → Dropbox
5. Implement OAuth redirect in your cloud connector code

## Data Storage

### LocalStorage
Stores settings and lightweight data that reloads instantly:
- Apps list and order
- Theme preferences (season, dark/light mode)
- Search engine choice
- Weather location
- Notes
- Playlist (names and URLs, but not file data)
- Profile info

### IndexedDB (kmoon_media database)
Stores binary media that survives page reloads:
- Background images/videos (users upload)
- Music files (users upload)
- Efficiently handles large files
- Per-file, not limited by localStorage 5MB cap

### Resetting Data
**Settings → Data → Reset All Data** will:
- Clear all localStorage entries
- Delete the IndexedDB database
- Delete all uploaded backgrounds and music
- Reload the page with defaults

## Seasonal Themes

Auto mode uses Northern Hemisphere calendar dates:
- **Spring**: March 20 – June 19
- **Summer**: June 20 – September 21
- **Autumn**: September 22 – December 20
- **Winter**: December 21 – March 19

Edit the `season()` function in app.js for Southern Hemisphere dates.

## Files

- `index.html` — Main page with Google GSI script tag
- `app.js` — Full application logic with OAuth and IndexedDB
- `style.css` — All styling (dark, light, seasonal themes)
- `README.md` — This file

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| LocalStorage | ✓ | ✓ | ✓ | ✓ |
| IndexedDB | ✓ | ✓ | ✓ | ✓ |
| Google OAuth (gsi) | ✓ | ✓ | ✓ | ✓ |
| Audio Player | ✓ | ✓ | ✓ | ✓ |
| Video Background | ✓ | ✓ | ✓ | ✓ |

## Deployment

### Netlify / Vercel
1. Push files to GitHub
2. Connect repository to Netlify/Vercel
3. Automatic deploys on push

### Your Own Server
1. Upload files via FTP/SSH
2. Add your domain to Google OAuth origins
3. Update any hardcoded URLs if needed

### Important: HTTPS Required for OAuth
Google OAuth requires HTTPS (or localhost for testing). If deploying, use a certificate or service like Netlify/Vercel.

## Tips & Tricks

- **Drag apps** to reorder them (saved automatically)
- **Search box** accepts URLs directly
- **Notes persist** across sessions
- **Weather** requires internet access
- **Music player** has next/previous controls and plays on loop when ended
- **Background videos** loop silently
- Remove app with the **×** button that appears on hover
- Collapse sidebar for more screen space

## Future Enhancements

- [ ] Google Drive file browser integration
- [ ] Dropbox file browser integration
- [ ] Spotify playlist integration
- [ ] Dark mode auto-switch (system preference)
- [ ] Custom wallpaper crop/position
- [ ] Keyboard shortcuts

## License

Free to use and modify. Attribution appreciated.

---

**Last updated:** September 2026  
**Status:** Production-ready with full OAuth & persistence
