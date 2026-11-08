# CloudTab — Local-Powered Personal Browser

> A fully functional, production-quality personal browser powered by local device hardware, native Android Chromium WebView engine, hardware acceleration, multi-tab management, and privacy-first local storage. Completely independent of Cloudflare or remote browser execution.

---

## 1. Architecture Overview

CloudTab is transformed into a **local-first browser architecture**:
- **Device Processing**: Utilizes the local device's CPU, RAM, and hardware GPU acceleration.
- **Local Network**: All web connections originate directly from the user's local network interface.
- **Local JavaScript & Media**: Websites, scripts, and HTML5 video/audio execute and play locally.
- **Dual Form Factor**:
  1. **Android Native**: Built with Kotlin and Android's native Chromium `WebView`, `WebChromeClient`, and `WebViewClient`, with multi-tab lifecycle management and native `DownloadManager`.
  2. **Web / Desktop Interface**: Modern React SPA interface with full Omnibox, search engine routing, local proxying, and local persistence.
- **Live Device Presence**: Shows **only currently active live devices**. Disconnected devices are never stored or displayed.

```
┌─────────────────────────────────────────────────────────────────┐
│                      CloudTab Architecture                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [ Native Android App (Kotlin) ]      [ Web / Desktop Engine ]  │
│  - Android Chromium WebView           - Local Express Server    │
│  - Hardware Accelerated GPU           - Local File/SQLite Store │
│  - Native TabManager                  - Omnibox URL / Search    │
│  - Android DownloadManager            - CORS-Stripping Proxy    │
│  - Local SQLite Database              - WebSocket Live Sync     │
│                 │                                │              │
│                 └─── window.CloudTabNative ──────┘              │
│                          (Bidirectional Bridge)                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Complete Removal of Cloudflare

All dependencies, configurations, and references to Cloudflare have been completely purged from the codebase:
- ❌ **Cloudflare Browser Run / Rendering**: Removed and replaced with local Chromium engine and native Android `BrowserWebView`.
- ❌ **Cloudflare Workers & Durable Objects**: Removed; state coordination is handled locally via `LocalProfileStore` and local WebSockets.
- ❌ **Cloudflare R2 Storage**: Removed; data is persisted locally in `./data/profile.json` and SQLite database.
- ❌ **Wrangler configurations & environment variables**: Deleted `cloudflare/` directory and purged all `CLOUDFLARE_*` keys from `.env.example`.
- ❌ **Dead API routes & packages**: Removed all remote session and takeover endpoints.

---

## 3. Implemented Browser Features

### A. Navigation & Omnibox
- **Intelligent Omnibox**: Automatically detects whether input is a direct URL (e.g. `github.com`, `https://...`, `localhost:3000`) or a search query.
- **Configurable Search Engines**: Native routing for DuckDuckGo, Google, Microsoft Bing, Brave Search, and Ecosia.
- **Full Navigation Controls**: Back, Forward, Reload, and Stop-Loading (toggles dynamically during active page loads).
- **HTTPS Padlock & Security Popover**: Verified SSL certificate indicator and local security state.
- **Homepage**: Configurable custom homepage or fast New Tab dashboard with speed dial shortcuts and hardware monitor.

### B. Multi-Tab Management
- **Independent Tab Stacks**: Each tab maintains its own back/forward history stack, title, and favicon.
- **Zero-Reload Tab Switching**: Background tabs remain resident in memory without reloading.
- **Closed Tab Recovery**: Stack of recently closed tabs can be revived instantly.
- **Tab Overview Grid**: Visual grid switcher for mobile and tablet ergonomics.

### C. Bookmarks & Browsing History
- **Local Bookmarks**: Create, edit, search, and organize bookmarks into folders.
- **Local History**: Records visited URLs and timestamps with date grouping.
- **Clear Browsing Data**: Complete purge tool for history, session cookies, and local cache.
- **Private Browsing Mode**: Disables history logging and prevents cookie persistence.

### D. Download Management
- **Local Downloads**: Direct file downloading with filename, size, progress, and local path tracking.
- **Android Integration**: Enqueues system `DownloadManager.Request` with notifications and scoped storage.

### E. Live Device Telemetry
- **Active Devices Only**: Shows only devices currently online and connected via live WebSocket heartbeat.
- **No Offline History**: Disconnected devices are purged immediately upon disconnect.

---

## 4. Android Studio Project Structure (`/android`)

```
android/
├── build.gradle.kts                     # Root build configuration
├── settings.gradle.kts                  # Project settings & repositories
├── gradle.properties                    # AndroidX and JVM options
└── app/
    ├── build.gradle.kts                 # App dependencies & SDK config (SDK 34)
    ├── proguard-rules.pro               # ProGuard keep rules for WebAppInterface
    └── src/main/
        ├── AndroidManifest.xml          # Permissions (Internet, Downloads, Network)
        ├── res/
        │   ├── layout/activity_main.xml # Layout with tab container & video fullscreen
        │   └── values/                  # Strings, colors, and dark themes
        └── java/com/cloudtab/browser/
            ├── MainActivity.kt          # Activity lifecycle, back navigation, video fullscreen
            ├── BrowserWebView.kt        # Chromium WebView with hardware acceleration
            ├── TabManager.kt            # Multi-tab pool maintaining active/background tabs
            ├── WebAppInterface.kt       # @JavascriptInterface bridge for React UI
            ├── DownloadController.kt    # Android DownloadManager integration
            └── LocalDatabase.kt         # Local SQLite database for bookmarks & history
```

---

## 5. Build and Installation Instructions

### Running the Web / Local Engine (Node.js)
```bash
# Install dependencies
npm install

# Run automated tests
npm test

# Start local server (Port 3000)
npm run dev
```

### Building the Android APK
```bash
# 1. Open the /android directory in Android Studio (Hedgehog or newer)
cd android

# 2. Build Debug APK using Gradle wrapper
./gradlew assembleDebug

# 3. Output APK location:
# android/app/build/outputs/apk/debug/app-debug.apk

# 4. Install onto connected Android device or emulator
adb install app/build/outputs/apk/debug/app-debug.apk
```

---

## 6. Testing Report

Automated tests verified via `npm test` (`tests/cloudtab.test.ts`):
- ✅ Test 1: Local Storage Profile initialization (`./data/profile.json`)
- ✅ Test 2: Live device registration
- ✅ Test 3: Disconnected device purge (no offline devices stored)
- ✅ Test 4: Omnibox direct URL formatting (`github.com` $\rightarrow$ `https://github.com`)
- ✅ Test 5: Omnibox search query detection
- ✅ Test 6: Configurable search engine query generation (Google, Bing, Brave, Ecosia)
- ✅ Test 7: Independent multi-tab creation
- ✅ Test 8: Back & Forward navigation history stacks
- ✅ Test 9: Closed tab restoration stack
- ✅ Test 10: Local bookmarks management and folders
- ✅ Test 11: Local history logging and data clearing
- ✅ Test 12: Local downloads initiation and file paths
- ✅ Test 13: Private browsing mode history suppression
- ✅ Test 14: Polished HTML error page rendering
- ✅ Test 15: Local system hardware metrics (Node `os` CPU cores & RAM)

**Result: 15/15 Tests Passed (100% Success)**

---

## 7. Unsupported Features & Technical Limitations

1. **Widevine L1 DRM in Generic WebViews**: Proprietary DRM streaming (e.g. Netflix, Disney+) requires Google-certified Widevine L1 OEM key integration, which is restricted in custom Android WebViews.
2. **Third-Party Chrome Extensions in Native WebView**: Google does not permit desktop Chrome `.crx` extension execution inside Android `android.webkit.WebView`. Declarative content filtering and user styling are supported via custom content rules.
3. **Cross-Origin Iframe Restrictions in Standard Browser Preview**: In standard web browsers, sites sending `X-Frame-Options: DENY` require the local proxy endpoint (`/api/browser/proxy`) to render within web iframes. Native Android WebViews execute websites directly without this restriction.
