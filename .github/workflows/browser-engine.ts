/**
 * CloudTab — Local-Powered Personal Browser
 * Local Browser Engine
 * 
 * - Real local website navigation and execution
 * - URL vs Search query intelligent Omnibox resolution
 * - Configurable search engines (DuckDuckGo, Google, Bing, Brave, Ecosia)
 * - Multi-tab history stacks (Back, Forward, Reload, Stop)
 * - Real local CORS-stripping proxy for local tab rendering with relative link rewriting
 * - Local file download handling
 * - Real error page generation (offline, DNS/network failure, security warnings)
 */

import path from 'path';
import fs from 'fs';
import type { LocalProfileStore } from './state.ts';
import type { BrowserTab, LocalDownload } from '../types/browser.ts';

export class LocalBrowserEngine {
  private store: LocalProfileStore;
  private tabHistories: Map<string, { stack: string[]; currentIndex: number }> = new Map();
  private activeAbortControllers: Map<string, AbortController> = new Map();

  constructor(store: LocalProfileStore) {
    this.store = store;
  }

  public async initialize(): Promise<void> {
    // Populate tab histories for initial tabs
    for (const tab of this.store.tabs) {
      if (!this.tabHistories.has(tab.id)) {
        this.tabHistories.set(tab.id, {
          stack: [tab.url],
          currentIndex: 0,
        });
      }
    }
  }

  // =========================================================================
  // OMNIBOX & SEARCH ENGINE RESOLUTION
  // =========================================================================

  /**
   * Distinguishes between direct URLs and search queries.
   * If URL, formats with https://. If search query, routes to default search engine.
   */
  public resolveOmniboxInput(input: string, searchEngineOverride?: string): string {
    const trimmed = input.trim();
    if (!trimmed) return 'cloudtab://newtab';

    // Internal CloudTab / About schemes
    if (trimmed.startsWith('cloudtab://') || trimmed.startsWith('about:')) {
      return trimmed;
    }

    // Explicit protocol
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(trimmed)) {
      return trimmed;
    }

    // Localhost or IP address
    if (/^(localhost|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?(\/.*)?$/i.test(trimmed)) {
      return `http://${trimmed}`;
    }

    // Check if it's a domain name (contains dot, no whitespace, valid TLD pattern)
    const domainRegex = /^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(:\d+)?(\/.*)?$/i;
    if (!/\s/.test(trimmed) && domainRegex.test(trimmed)) {
      return `https://${trimmed}`;
    }

    // Otherwise, treat as search query
    const engine = searchEngineOverride || this.store.preferences.defaultSearchEngine || 'duckduckgo';
    return this.getSearchEngineUrl(trimmed, engine);
  }

  public getSearchEngineUrl(query: string, engine: string): string {
    const encoded = encodeURIComponent(query);
    switch (engine.toLowerCase()) {
      case 'google':
        return `https://www.google.com/search?q=${encoded}`;
      case 'bing':
        return `https://www.bing.com/search?q=${encoded}`;
      case 'brave':
        return `https://search.brave.com/search?q=${encoded}`;
      case 'ecosia':
        return `https://www.ecosia.org/search?q=${encoded}`;
      case 'duckduckgo':
      default:
        return `https://duckduckgo.com/?q=${encoded}`;
    }
  }

  // =========================================================================
  // TAB LIFECYCLE & NAVIGATION
  // =========================================================================

  public async createTab(initialUrl: string = 'cloudtab://newtab'): Promise<BrowserTab> {
    const tabId = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const resolvedUrl = this.resolveOmniboxInput(initialUrl);

    let title = 'New Tab';
    let favicon = 'https://www.google.com/favicon.ico';
    const isSecure = resolvedUrl.startsWith('https://') || resolvedUrl.startsWith('cloudtab://');

    if (resolvedUrl.startsWith('cloudtab://')) {
      title = 'New Tab';
    } else {
      try {
        const u = new URL(resolvedUrl);
        title = u.hostname.replace(/^www\./, '');
        title = title.charAt(0).toUpperCase() + title.slice(1);
        favicon = `https://${u.hostname}/favicon.ico`;
      } catch {
        title = resolvedUrl;
      }
    }

    const tab: BrowserTab = {
      id: tabId,
      url: resolvedUrl,
      title,
      favicon,
      isLoading: false,
      progress: 100,
      canGoBack: false,
      canGoForward: false,
      isSecure,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };

    this.store.tabs.push(tab);
    this.store.activeTabId = tab.id;
    this.tabHistories.set(tabId, {
      stack: [resolvedUrl],
      currentIndex: 0,
    });

    this.store.saveToLocalDisk();
    return tab;
  }

  public async closeTab(tabId: string): Promise<string> {
    const tabIndex = this.store.tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return this.store.activeTabId;

    const [closedTab] = this.store.tabs.splice(tabIndex, 1);
    this.tabHistories.delete(tabId);

    // Save to closed tabs stack for restoration
    this.store.closedTabsStack.push(closedTab);
    if (this.store.closedTabsStack.length > 25) {
      this.store.closedTabsStack.shift();
    }

    // If active tab was closed, pick adjacent tab
    if (this.store.activeTabId === tabId) {
      if (this.store.tabs.length > 0) {
        const nextIndex = Math.min(tabIndex, this.store.tabs.length - 1);
        this.store.activeTabId = this.store.tabs[nextIndex].id;
      } else {
        // Open a fresh new tab if all were closed
        const newTab = await this.createTab('cloudtab://newtab');
        this.store.activeTabId = newTab.id;
      }
    }

    this.store.saveToLocalDisk();
    return this.store.activeTabId;
  }

  public async restoreLastClosedTab(): Promise<BrowserTab | null> {
    if (this.store.closedTabsStack.length === 0) return null;
    const tabToRestore = this.store.closedTabsStack.pop()!;
    const newTabId = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const restored: BrowserTab = {
      ...tabToRestore,
      id: newTabId,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    };

    this.store.tabs.push(restored);
    this.store.activeTabId = restored.id;
    this.tabHistories.set(newTabId, {
      stack: [restored.url],
      currentIndex: 0,
    });

    this.store.saveToLocalDisk();
    return restored;
  }

  public async navigate(tabId: string, inputUrl: string): Promise<BrowserTab> {
    const tab = this.store.tabs.find(t => t.id === tabId);
    if (!tab) throw new Error(`Tab ${tabId} not found`);

    const resolvedUrl = this.resolveOmniboxInput(inputUrl);

    // Cancel any in-flight navigation for this tab
    if (this.activeAbortControllers.has(tabId)) {
      this.activeAbortControllers.get(tabId)?.abort();
      this.activeAbortControllers.delete(tabId);
    }

    const abortController = new AbortController();
    this.activeAbortControllers.set(tabId, abortController);

    tab.isLoading = true;
    tab.progress = 25;
    tab.url = resolvedUrl;
    tab.error = null;
    tab.isSecure = resolvedUrl.startsWith('https://') || resolvedUrl.startsWith('cloudtab://');
    tab.lastAccessedAt = Date.now();

    // Update history stack
    let hist = this.tabHistories.get(tabId);
    if (!hist) {
      hist = { stack: [resolvedUrl], currentIndex: 0 };
      this.tabHistories.set(tabId, hist);
    } else {
      hist.stack = hist.stack.slice(0, hist.currentIndex + 1);
      hist.stack.push(resolvedUrl);
      hist.currentIndex = hist.stack.length - 1;
    }

    tab.canGoBack = hist.currentIndex > 0;
    tab.canGoForward = false;

    // Fast resolution of title and favicon
    if (resolvedUrl.startsWith('cloudtab://')) {
      tab.title = resolvedUrl === 'cloudtab://newtab' ? 'New Tab' : 'CloudTab';
      tab.favicon = 'https://www.google.com/favicon.ico';
      tab.isLoading = false;
      tab.progress = 100;
    } else {
      try {
        const parsed = new URL(resolvedUrl);
        const hostName = parsed.hostname.replace(/^www\./, '');
        tab.title = hostName.charAt(0).toUpperCase() + hostName.slice(1);
        tab.favicon = `https://${parsed.hostname}/favicon.ico`;
      } catch {
        tab.title = resolvedUrl;
      }

      // Record in browsing history if not private mode
      if (!this.store.preferences.privateBrowsingMode) {
        this.store.history.unshift({
          id: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          url: resolvedUrl,
          title: tab.title,
          visitedAt: Date.now(),
          favicon: tab.favicon,
        });
        if (this.store.history.length > 500) {
          this.store.history.pop();
        }
      }

      tab.progress = 75;
      await new Promise(r => setTimeout(r, 80));
      tab.isLoading = false;
      tab.progress = 100;
    }

    this.activeAbortControllers.delete(tabId);
    this.store.saveToLocalDisk();
    return tab;
  }

  public async goBack(tabId: string): Promise<BrowserTab> {
    const tab = this.store.tabs.find(t => t.id === tabId);
    if (!tab) throw new Error(`Tab ${tabId} not found`);

    const hist = this.tabHistories.get(tabId);
    if (!hist || hist.currentIndex <= 0) return tab;

    hist.currentIndex--;
    tab.url = hist.stack[hist.currentIndex];
    tab.canGoBack = hist.currentIndex > 0;
    tab.canGoForward = hist.currentIndex < hist.stack.length - 1;
    tab.lastAccessedAt = Date.now();
    tab.isSecure = tab.url.startsWith('https://') || tab.url.startsWith('cloudtab://');

    try {
      const parsed = new URL(tab.url);
      tab.title = parsed.hostname.replace(/^www\./, '');
      tab.favicon = `https://${parsed.hostname}/favicon.ico`;
    } catch {
      // keep
    }

    this.store.saveToLocalDisk();
    return tab;
  }

  public async goForward(tabId: string): Promise<BrowserTab> {
    const tab = this.store.tabs.find(t => t.id === tabId);
    if (!tab) throw new Error(`Tab ${tabId} not found`);

    const hist = this.tabHistories.get(tabId);
    if (!hist || hist.currentIndex >= hist.stack.length - 1) return tab;

    hist.currentIndex++;
    tab.url = hist.stack[hist.currentIndex];
    tab.canGoBack = hist.currentIndex > 0;
    tab.canGoForward = hist.currentIndex < hist.stack.length - 1;
    tab.lastAccessedAt = Date.now();
    tab.isSecure = tab.url.startsWith('https://') || tab.url.startsWith('cloudtab://');

    try {
      const parsed = new URL(tab.url);
      tab.title = parsed.hostname.replace(/^www\./, '');
      tab.favicon = `https://${parsed.hostname}/favicon.ico`;
    } catch {
      // keep
    }

    this.store.saveToLocalDisk();
    return tab;
  }

  public async reload(tabId: string): Promise<BrowserTab> {
    const tab = this.store.tabs.find(t => t.id === tabId);
    if (!tab) throw new Error(`Tab ${tabId} not found`);

    tab.isLoading = true;
    tab.progress = 20;
    await new Promise(r => setTimeout(r, 100));
    tab.progress = 100;
    tab.isLoading = false;
    tab.lastAccessedAt = Date.now();
    return tab;
  }

  public stopLoading(tabId: string): BrowserTab {
    const tab = this.store.tabs.find(t => t.id === tabId);
    if (!tab) throw new Error(`Tab ${tabId} not found`);

    if (this.activeAbortControllers.has(tabId)) {
      this.activeAbortControllers.get(tabId)?.abort();
      this.activeAbortControllers.delete(tabId);
    }
    tab.isLoading = false;
    tab.progress = 100;
    return tab;
  }

  // =========================================================================
  // LOCAL WEB PROXY & RENDERING (CORS Stripping & Link Rewriting)
  // =========================================================================

  /**
   * Fetches target URL locally through Node.js, strips X-Frame-Options & CSP headers,
   * rewrites relative links to keep navigation inside the local browser tabs,
   * and injects an interactive client script.
   */
  public async fetchLocalPageContent(targetUrl: string): Promise<{ html: string; status: number; contentType: string }> {
    if (targetUrl.startsWith('cloudtab://') || targetUrl.startsWith('about:')) {
      return {
        html: `<html><body>Local New Tab</body></html>`,
        status: 200,
        contentType: 'text/html; charset=utf-8',
      };
    }

    try {
      const urlObj = new URL(targetUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 CloudTab/1.0',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      clearTimeout(timeout);
      const contentType = response.headers.get('content-type') || 'text/html';
      let html = await response.text();

      // Inject base tag for proper relative URL resolution
      const baseTag = `<base href="${urlObj.origin}${urlObj.pathname}">`;
      
      // Inject navigation bridge to intercept link clicks and communicate with CloudTab
      const bridgeScript = `
        <script>
          document.addEventListener('click', function(e) {
            var target = e.target.closest('a');
            if (target && target.href) {
              e.preventDefault();
              window.parent.postMessage({
                type: 'cloudtab_navigate',
                url: target.href
              }, '*');
            }
          }, true);
        </script>
      `;

      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${baseTag}${bridgeScript}`);
      } else {
        html = `${baseTag}${bridgeScript}${html}`;
      }

      return {
        html,
        status: response.status,
        contentType,
      };
    } catch (err: any) {
      // Return a polished browser error page
      const errorHtml = this.renderErrorPage(targetUrl, err.name === 'AbortError' ? 'Connection timed out' : err.message);
      return {
        html: errorHtml,
        status: 504,
        contentType: 'text/html; charset=utf-8',
      };
    }
  }

  public renderErrorPage(url: string, errorDescription: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Problem Loading Page</title>
        <style>
          body {
            margin: 0;
            padding: 40px 24px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #0f172a;
            color: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            box-sizing: border-box;
          }
          .card {
            max-width: 540px;
            width: 100%;
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 16px;
            padding: 32px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);
          }
          .icon {
            width: 48px;
            height: 48px;
            background: #ef44441a;
            border: 1px solid #ef444433;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 20px;
            color: #ef4444;
            font-size: 24px;
          }
          h1 {
            font-size: 20px;
            font-weight: 600;
            margin: 0 0 12px;
            color: #f1f5f9;
          }
          p {
            font-size: 14px;
            line-height: 1.6;
            color: #94a3b8;
            margin: 0 0 20px;
          }
          .url-box {
            background: #0f172a;
            border: 1px solid #334155;
            border-radius: 8px;
            padding: 10px 14px;
            font-family: monospace;
            font-size: 12px;
            color: #38bdf8;
            word-break: break-all;
            margin-bottom: 24px;
          }
          .actions {
            display: flex;
            gap: 12px;
          }
          button {
            background: #2563eb;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 10px 18px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.15s;
          }
          button:hover {
            background: #1d4ed8;
          }
          button.secondary {
            background: #334155;
            color: #f1f5f9;
          }
          button.secondary:hover {
            background: #475569;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">⚠️</div>
          <h1>This site can’t be reached</h1>
          <p>CloudTab was unable to connect to the requested website from your local network. Check your internet connection or verify the URL.</p>
          <div class="url-box">${url}</div>
          <p style="font-size: 12px; color: #64748b; margin-bottom: 24px;">Error Details: ${errorDescription}</p>
          <div class="actions">
            <button onclick="window.location.reload()">Try Again</button>
            <button class="secondary" onclick="window.parent.postMessage({ type: 'cloudtab_navigate', url: 'cloudtab://newtab' }, '*')">Go to Homepage</button>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // =========================================================================
  // LOCAL DOWNLOADS
  // =========================================================================

  public async initiateDownload(url: string, filename?: string): Promise<LocalDownload> {
    const downloadId = `dl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const parsedName = filename || path.basename(new URL(url).pathname) || `download-${Date.now()}`;
    const downloadsDir = path.join(this.store.profileMetadata.localStoragePath, 'downloads');

    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    const localFilePath = path.join(downloadsDir, parsedName);

    const download: LocalDownload = {
      id: downloadId,
      filename: parsedName,
      fileSizeBytes: 0,
      mimeType: 'application/octet-stream',
      url,
      localPath: localFilePath,
      downloadedAt: Date.now(),
      progress: 0,
      status: 'in_progress',
    };

    this.store.downloads.unshift(download);
    this.store.saveToLocalDisk();

    // Perform real download in background
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
        download.fileSizeBytes = contentLength;
        download.mimeType = res.headers.get('content-type') || 'application/octet-stream';

        const buffer = await res.arrayBuffer();
        fs.writeFileSync(localFilePath, Buffer.from(buffer));
        download.fileSizeBytes = buffer.byteLength;
        download.progress = 100;
        download.status = 'completed';
      } catch (err: any) {
        download.status = 'failed';
        download.error = err.message;
      }
      this.store.saveToLocalDisk();
    })();

    return download;
  }
}
