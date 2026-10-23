# Kmoon Start Page — Quick Start Guide

## 🚀 5-Minute Setup

### Step 1: Run Locally
```bash
python -m http.server 8000
# or: npx http-server
# Then open: http://localhost:8000
```

### Step 2: Add Google OAuth (2 min)

**Get your Google Client ID:**
1. Go to https://console.cloud.google.com
2. Create new project called "Kmoon"
3. Click "Enable APIs and Services"
4. Search for "Google+ API" and enable it
5. Click "Credentials" (left sidebar)
6. Click "Create Credentials" → "OAuth client ID"
7. Choose "Web application"
8. Under "Authorized JavaScript origins" add: `http://localhost:8000`
9. Click "Create" and copy the Client ID

**Add it to Kmoon:**
1. Open http://localhost:8000
2. Click ⚙ (Settings) in top right
3. Paste your Client ID in "Google OAuth Client ID" field
4. Click "Setup Google Sign-In"
5. A blue Google button will appear
6. Click it and sign in with your Google account
7. ✨ Your profile will appear in the sidebar

### Step 3: Test Persistence

**Background (survives reload):**
1. Click ◈ (Background)
2. Click "Image / GIF" and upload a photo
3. Refresh page (Ctrl+R)
4. Background stays!

**Music (survives reload):**
1. Click ♫ (Music)
2. Click "Choose file" and upload a .mp3
3. Click the ▶ button to play
4. Refresh page
5. Song is still there!

**Notes (survives reload):**
1. On home page, type in "Quick Notes" box
2. Refresh page
3. Notes are still there!

---

## 🎯 Common Tasks

### Add an App
1. Click "＋ Add App" on home page
2. Enter: Name (e.g., "Netflix"), URL (e.g., "netflix.com")
3. Click "Add App"
4. Drag tiles to reorder
5. All changes auto-save

### Set Weather
1. Click ⚙ Settings
2. Enter city name (e.g., "Philadelphia")
3. Click "Save Settings"
4. Weather widget updates on home page

### Change Theme
1. Click ◐ (theme icon) or go to ◈ Background
2. Choose: Spring, Summer, Autumn, or Winter
3. Or set to "Auto" for real seasonal changes
4. Choose: Dark, Light, or Custom (with your own image)

### Upload Custom Background
1. Click ◈ Background
2. Click "Image / GIF" or "Video"
3. Select file from computer
4. It saves automatically and persists forever!

### Create Music Playlist
1. Click ♫ Music
2. Upload .mp3 files one by one (or multiple at once)
3. Or paste a URL to an audio file (e.g., Spotify preview links don't work, but direct .mp3 URLs do)
4. Click ▶ to play
5. Use ⏮ Previous and ⏭ Next to navigate
6. All songs saved and available after reload

### Sign Out
1. Click ⚙ Settings
2. Scroll to Google Account section
3. Click "Sign out"
4. Your profile disappears from sidebar

---

## 💾 What Gets Saved?

### Automatically Saved (Forever)
✓ Google profile (name, email, picture)
✓ Apps and their order
✓ Background images & videos you upload
✓ Music files you upload
✓ Notes you write
✓ Theme choices
✓ Search engine preference
✓ Weather city

### Lost on Refresh
✗ Unsaved search query
✗ Text in input fields (unless you press Save)

### Cleared by "Reset All Data"
✗ Everything above (this is intentional)

---

## ⚡ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Enter | Search from search box |
| Tab | Navigate elements |
| Click app | Open that website |
| Drag app | Reorder apps |

---

## 🆘 Troubleshooting

### Google button doesn't appear
- Paste valid Client ID in Settings
- Wait 2 seconds
- Try refreshing page

### Background doesn't load after refresh
- Check browser's IndexedDB: DevTools → Application → IndexedDB
- Make sure you're not in incognito mode (IndexedDB doesn't work there)
- Try uploading again

### Music plays but very quiet/distorted
- Try re-uploading the file
- Make sure it's a valid .mp3 format
- Check browser volume

### Weather shows "unavailable"
- Make sure you added a city name in Settings
- Check your internet connection
- City name should be English (e.g., "New York", not "Nueva York")

### Apps disappear after reload
- They're saved! Just refresh again
- If still gone, check localStorage: DevTools → Application → Local Storage

---

## 📱 Mobile Use

Works great on phones! 
- Tap ☰ (menu) to open/close sidebar
- Tap ◈ to set a mobile-friendly background
- Upload music to listen offline
- All the same persistence

---

## 🔒 Privacy Notes

- All data stays in YOUR browser
- Nothing is sent to any server
- Google only sees your sign-in (standard OAuth)
- You can clear everything with "Reset All Data"
- Safe to use on shared computers (use separate browser profile)

---

## 🚀 Deploy to Internet

### Option 1: Netlify (Easiest)
1. Push files to GitHub
2. Go to netlify.com, connect GitHub
3. Done! Site is live with HTTPS

### Option 2: Vercel
1. Push files to GitHub
2. Go to vercel.com, connect GitHub
3. Done! Auto-deploys on every push

### Option 3: Your Own Server
1. Upload files via FTP/SSH
2. Make sure HTTPS is enabled (required for OAuth)
3. Add your domain to Google OAuth credentials

### Important
After deploying, update Google OAuth:
1. Go to Google Cloud Console
2. Click "Credentials"
3. Click your Client ID
4. Add authorized origin: `https://yourdomain.com`

---

## 📚 More Info

- **README.md** — Full feature list & setup guide
- **UPGRADE_NOTES.md** — Technical details of what changed
- **app.js** — Code comments explain every function
- **Google OAuth Docs** — https://developers.google.com/identity/gsi/web

---

## ✨ You're All Set!

Your Kmoon Start Page now has:
- ✓ Real Google Sign-In
- ✓ Persistent backgrounds & music
- ✓ Auto-save everything
- ✓ Seasonal themes
- ✓ Dark/light mode
- ✓ Custom search engine
- ✓ Weather widget
- ✓ Quick notes

Enjoy your custom start page! 🚀
