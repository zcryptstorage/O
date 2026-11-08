/**
 * CloudTab — Local-Powered Personal Browser
 * Local Profile State Manager
 * 
 * - Persistent local storage in ./data/profile.json
 * - Live Device tracking: ONLY currently active / live devices are shown
 *   (never stores past disconnected devices)
 * - Real local system metrics (CPU cores, RAM usage, platform) via Node os module
 * - Multi-tab history stacks, bookmarks, browsing history, downloads, and preferences
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import type {
  BrowserTab,
  BookmarkItem,
  HistoryEntry,
  LocalDownload,
  ChromeExtension,
  LiveDevice,
  LocalProfileMetadata,
  LocalBrowserPreferences,
  BrowserProcessInfo,
  ProcessAllocationSettings,
} from '../types/browser.ts';

export const ACCESS_PASSWORD = 'zetta';

export class LocalProfileStore {
  private static instance: LocalProfileStore;

  public tabs: BrowserTab[] = [];
  public activeTabId: string = '';
  public closedTabsStack: BrowserTab[] = [];
  public bookmarks: BookmarkItem[] = [];
  public history: HistoryEntry[] = [];
  public downloads: LocalDownload[] = [];
  public extensions: ChromeExtension[] = [];

  // IN-MEMORY ONLY: Currently active live devices.
  // Never stored to disk. When a device disconnects, it is completely removed.
  public liveDevices: Map<string, LiveDevice> = new Map();

  // Sleeping and killed processes state (for process management & simulation)
  public sleepingPids: Set<number> = new Set();
  public killedPids: Set<number> = new Set();

  public preferences: LocalBrowserPreferences = {
    theme: 'dark',
    homePage: 'cloudtab://newtab',
    defaultSearchEngine: 'google',
    javascriptEnabled: true,
    cookiesEnabled: true,
    doNotTrack: true,
    privateBrowsingMode: false,
    hardwareAcceleration: true,
    restoreTabsOnStartup: true,
    fontSize: 'medium',
    zoomLevel: 100,
    securityPasswordEnabled: true,
    autoLockMinutes: 0,
    processSettings: {
      processModel: 'process-per-tab',
      executionTarget: 'local', // 'local' or 'cloud'
      maxProcesses: 0, // Auto based on hardware cores
      dedicatedGpuProcess: true,
      dedicatedNetworkProcess: true,
      dedicatedExtensionProcess: true,
      dedicatedMediaProcess: true,
      dedicatedStorageProcess: true,
      backgroundProcessThrottling: true,
      memorySaverDiscardMinutes: 30,
      preferredCpuPriority: 'balanced',
    },
  };

  public profileMetadata: LocalProfileMetadata = {
    name: 'CloudTab Local Profile',
    profileId: 'local-owner-profile',
    storageProvider: 'local_filesystem',
    browserEngine: 'local_sandboxed_engine',
    localStoragePath: path.resolve(process.cwd(), 'data'),
    activeTabsCount: 0,
    bookmarksCount: 0,
    historyCount: 0,
    downloadsCount: 0,
    extensionsCount: 0,
    cpuCores: os.cpus().length,
    totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
    freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
    systemOs: `${os.type()} ${os.arch()}`,
  };

  private storageFilePath: string;

  private constructor() {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (err) {
        console.error('Failed to create local data directory:', err);
      }
    }
    this.storageFilePath = path.join(dataDir, 'profile.json');
    this.loadFromLocalDisk();
    this.updateSystemMetrics();
  }

  public static getInstance(): LocalProfileStore {
    if (!LocalProfileStore.instance) {
      LocalProfileStore.instance = new LocalProfileStore();
    }
    return LocalProfileStore.instance;
  }

  /**
   * Refreshes local CPU, RAM and OS metrics
   */
  public updateSystemMetrics(): void {
    this.profileMetadata.cpuCores = os.cpus().length;
    this.profileMetadata.totalMemoryMb = Math.round(os.totalmem() / 1024 / 1024);
    this.profileMetadata.freeMemoryMb = Math.round(os.freemem() / 1024 / 1024);
    this.profileMetadata.systemOs = `${os.type()} ${os.arch()}`;
    this.syncCounts();
  }

  /**
   * Initializes default local profile if storage file does not exist
   */
  public initDefaultProfile(): void {
    if (this.tabs.length === 0) {
      const initialTabId = 'tab-welcome-1';
      this.tabs = [
        {
          id: initialTabId,
          url: 'cloudtab://newtab',
          title: 'New Tab',
          favicon: 'https://www.google.com/favicon.ico',
          isLoading: false,
          progress: 100,
          canGoBack: false,
          canGoForward: false,
          isSecure: true,
          createdAt: Date.now(),
          lastAccessedAt: Date.now(),
        },
      ];
      this.activeTabId = initialTabId;
    }

    if (this.bookmarks.length === 0) {
      this.initDefaultBookmarks();
    }

    if (this.extensions.length === 0) {
      this.extensions = [
        {
          id: 'ext-adblock',
          name: 'uBlock Lite Local',
          version: '1.2.4',
          description: 'Local content filtering and tracker blocking.',
          icon: '🛡️',
          enabled: true,
          permissions: ['webRequest', 'storage'],
          manifestVersion: 3,
          source: 'builtin',
        },
        {
          id: 'ext-darkreader',
          name: 'Dark Reader Local',
          version: '4.9.82',
          description: 'Inverts bright colors for dark mode comfort on all websites.',
          icon: '🌙',
          enabled: true,
          permissions: ['storage'],
          manifestVersion: 3,
          source: 'builtin',
        },
      ];
    }

    this.syncCounts();
    this.saveToLocalDisk();
  }

  public initDefaultBookmarks(): void {
    this.bookmarks = [
      {
        id: 'bm-google',
        title: 'Google',
        url: 'https://www.google.com',
        favicon: 'https://www.google.com/favicon.ico',
        folder: 'General',
        createdAt: 1700000000000,
      },
      {
        id: 'bm-github',
        title: 'GitHub',
        url: 'https://github.com',
        favicon: 'https://github.githubassets.com/favicons/favicon.png',
        folder: 'Development',
        createdAt: 1700000000000,
      },
      {
        id: 'bm-wikipedia',
        title: 'Wikipedia',
        url: 'https://www.wikipedia.org',
        favicon: 'https://www.wikipedia.org/static/favicon/wikipedia.ico',
        folder: 'Reference',
        createdAt: 1700000000000,
      },
      {
        id: 'bm-hackernews',
        title: 'Hacker News',
        url: 'https://news.ycombinator.com',
        favicon: 'https://news.ycombinator.com/favicon.ico',
        folder: 'Tech',
        createdAt: 1700000000000,
      },
    ];
  }

  // =========================================================================
  // LIVE DEVICES (In-Memory Only: No history of disconnected devices)
  // =========================================================================

  public registerLiveDevice(device: LiveDevice): LiveDevice {
    // Upsert or register live device
    this.liveDevices.set(device.id, {
      ...device,
      lastActiveAt: Date.now(),
    });
    return device;
  }

  public updateLiveDeviceHeartbeat(deviceId: string): void {
    const dev = this.liveDevices.get(deviceId);
    if (dev) {
      dev.lastActiveAt = Date.now();
    }
  }

  public removeLiveDevice(deviceId: string): void {
    // When a device disconnects, purge it immediately so it is never shown
    this.liveDevices.delete(deviceId);
  }

  public getLiveDevicesList(): LiveDevice[] {
    const now = Date.now();
    // Prune any stale devices that haven't sent a heartbeat in 60s
    for (const [id, dev] of this.liveDevices.entries()) {
      if (now - dev.lastActiveAt > 60000) {
        this.liveDevices.delete(id);
      }
    }
    return Array.from(this.liveDevices.values());
  }

  // =========================================================================
  // PERSISTENCE (Local JSON Storage)
  // =========================================================================

  public syncCounts(): void {
    this.profileMetadata.activeTabsCount = this.tabs.length;
    this.profileMetadata.bookmarksCount = this.bookmarks.length;
    this.profileMetadata.historyCount = this.history.length;
    this.profileMetadata.downloadsCount = this.downloads.length;
    this.profileMetadata.extensionsCount = this.extensions.length;
  }

  public saveToLocalDisk(): void {
    try {
      this.syncCounts();
      // Ensure strictly unique items
      const uniqueBookmarks = Array.from(new Map(this.bookmarks.map(b => [b.id, b])).values());
      const uniqueTabs = Array.from(new Map(this.tabs.map(t => [t.id, t])).values());
      const uniqueDownloads = Array.from(new Map(this.downloads.map(d => [d.id, d])).values());

      const payload = {
        tabs: uniqueTabs,
        activeTabId: this.activeTabId,
        bookmarks: uniqueBookmarks,
        history: this.preferences.privateBrowsingMode ? [] : this.history.slice(0, 500),
        downloads: uniqueDownloads,
        extensions: this.extensions,
        preferences: this.preferences,
        savedAt: Date.now(),
      };
      fs.writeFileSync(this.storageFilePath, JSON.stringify(payload, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving local profile to disk:', err);
    }
  }

  private loadFromLocalDisk(): void {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = fs.readFileSync(this.storageFilePath, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.tabs) && data.tabs.length > 0) {
          const tabMap = new Map<string, BrowserTab>();
          for (const t of data.tabs) {
            if (t && t.id && !tabMap.has(t.id)) tabMap.set(t.id, t);
          }
          this.tabs = Array.from(tabMap.values());
          this.activeTabId = data.activeTabId || this.tabs[0]?.id || '';
        }
        if (Array.isArray(data.bookmarks)) {
          const bmMap = new Map<string, BookmarkItem>();
          for (const b of data.bookmarks) {
            if (b && b.id && !b.id.startsWith('bm-test-') && !bmMap.has(b.id)) {
              bmMap.set(b.id, b);
            }
          }
          this.bookmarks = Array.from(bmMap.values());
          if (this.bookmarks.length === 0) {
            this.initDefaultBookmarks();
          }
        }
        if (Array.isArray(data.history)) {
          this.history = data.history;
        }
        if (Array.isArray(data.downloads)) {
          const dlMap = new Map<string, LocalDownload>();
          for (const d of data.downloads) {
            if (d && d.id && !dlMap.has(d.id)) dlMap.set(d.id, d);
          }
          this.downloads = Array.from(dlMap.values());
        }
        if (Array.isArray(data.extensions)) {
          this.extensions = data.extensions;
        }
        if (data.preferences) {
          this.preferences = { ...this.preferences, ...data.preferences };
        }
      } else {
        this.initDefaultProfile();
      }
    } catch (err) {
      console.warn('Failed to load profile.json, initializing defaults:', err);
      this.initDefaultProfile();
    }
  }

  /**
   * Clears browsing data (cache, history, cookies)
   */
  public clearBrowsingData(options?: { history?: boolean; cookies?: boolean; downloads?: boolean }): void {
    const opts = { history: true, cookies: true, downloads: false, ...options };
    if (opts.history) {
      this.history = [];
    }
    if (opts.downloads) {
      this.downloads = [];
    }
    this.syncCounts();
    this.saveToLocalDisk();
  }

  // =========================================================================
  // SECURITY & ACCESS PASSWORD
  // =========================================================================

  public verifyAccessPassword(password: string): boolean {
    if (!password) return false;
    return password.trim().toLowerCase() === ACCESS_PASSWORD;
  }

  // =========================================================================
  // PROCESS ALLOCATION & TASK MANAGER
  // =========================================================================

  public updateProcessSettings(settings: Partial<ProcessAllocationSettings>): ProcessAllocationSettings {
    this.preferences.processSettings = {
      ...this.preferences.processSettings,
      ...settings,
    };
    this.saveToLocalDisk();
    return this.preferences.processSettings;
  }

  public getProcessList(): BrowserProcessInfo[] {
    const list: BrowserProcessInfo[] = [];
    const settings = this.preferences.processSettings;
    const isCloud = settings.executionTarget === 'cloud';
    const tag = isCloud ? '☁️ [Cloud] ' : '💻 [Local] ';

    // 1. Browser Main Process (always present)
    list.push({
      pid: 1000,
      type: 'browser',
      name: `${tag}Browser (Main Controller)`,
      cpuPercent: isCloud ? 0.3 : 1.4,
      memoryMb: isCloud ? 45 : 116,
      threads: 14,
      status: 'running',
      priority: 'high',
    });

    // 2. Dedicated GPU Process (if chosen)
    if (settings.dedicatedGpuProcess) {
      const isSleeping = this.sleepingPids.has(1001);
      list.push({
        pid: 1001,
        type: 'gpu',
        name: 'GPU Acceleration Service',
        cpuPercent: isSleeping ? 0 : this.preferences.hardwareAcceleration ? 2.6 : 0.5,
        memoryMb: isSleeping ? 18 : 84,
        threads: 8,
        status: isSleeping ? 'sleeping' : 'running',
        priority: 'high',
      });
    }

    // 3. Dedicated Network Service Process (if chosen)
    if (settings.dedicatedNetworkProcess) {
      const isSleeping = this.sleepingPids.has(1002);
      list.push({
        pid: 1002,
        type: 'network',
        name: 'Network I/O & Socket Pipeline',
        cpuPercent: isSleeping ? 0 : 0.6,
        memoryMb: isSleeping ? 10 : 42,
        threads: 6,
        status: isSleeping ? 'sleeping' : 'running',
        priority: 'normal',
      });
    }

    // 4. Dedicated Extension Sandboxing Process (if chosen)
    if (settings.dedicatedExtensionProcess) {
      const isSleeping = this.sleepingPids.has(1003);
      list.push({
        pid: 1003,
        type: 'extension',
        name: 'Extension Sandbox (uBlock Lite & Dark Reader)',
        cpuPercent: isSleeping ? 0 : 0.3,
        memoryMb: isSleeping ? 8 : 36,
        threads: 4,
        status: isSleeping ? 'sleeping' : 'running',
        priority: 'normal',
      });
    }

    // 5. Dedicated Audio & Video Media Pipeline (if chosen)
    if (settings.dedicatedMediaProcess) {
      const isSleeping = this.sleepingPids.has(1004);
      list.push({
        pid: 1004,
        type: 'media',
        name: 'Audio/Video Media Decoder Pipeline',
        cpuPercent: isSleeping ? 0 : 0.9,
        memoryMb: isSleeping ? 14 : 68,
        threads: 8,
        status: isSleeping ? 'sleeping' : 'running',
        priority: 'normal',
      });
    }

    // 6. Dedicated Local Storage & Cache Worker (if chosen)
    if (settings.dedicatedStorageProcess) {
      const isSleeping = this.sleepingPids.has(1005);
      list.push({
        pid: 1005,
        type: 'storage',
        name: 'Local Storage & IndexedDB Worker',
        cpuPercent: isSleeping ? 0 : 0.2,
        memoryMb: isSleeping ? 6 : 28,
        threads: 4,
        status: isSleeping ? 'sleeping' : 'running',
        priority: 'low',
      });
    }

    // 7. Tab Render Processes according to processModel
    const activeTabs = this.tabs;
    if (activeTabs.length === 0) return list;

    if (settings.processModel === 'single-process') {
      const pid = 1100;
      if (!this.killedPids.has(pid)) {
        const isSleeping = this.sleepingPids.has(pid);
        list.push({
          pid,
          type: 'tab',
          name: `Shared Tab Renderer (${activeTabs.length} tabs)`,
          title: `All Tabs (${activeTabs.map(t => t.title).join(', ')})`,
          cpuPercent: isSleeping ? 0 : 2.1,
          memoryMb: isSleeping ? 25 : Math.max(70, activeTabs.length * 40),
          threads: 10,
          status: isSleeping ? 'sleeping' : 'running',
          priority: 'normal',
        });
      }
    } else if (settings.processModel === 'process-per-site') {
      // Group tabs by origin / site hostname
      const siteGroups = new Map<string, BrowserTab[]>();
      for (const tab of activeTabs) {
        let domain = 'internal';
        try {
          if (tab.url.startsWith('http')) {
            domain = new URL(tab.url).hostname;
          } else {
            domain = 'cloudtab://';
          }
        } catch {
          domain = 'local';
        }
        if (!siteGroups.has(domain)) siteGroups.set(domain, []);
        siteGroups.get(domain)!.push(tab);
      }

      let siteIdx = 0;
      for (const [domain, group] of siteGroups.entries()) {
        const pid = 1100 + siteIdx;
        siteIdx++;
        if (this.killedPids.has(pid)) continue;
        const isSleeping = this.sleepingPids.has(pid);
        const containsActive = group.some(t => t.id === this.activeTabId);
        list.push({
          pid,
          type: 'tab',
          name: `Site Process: ${domain} (${group.length} tab${group.length > 1 ? 's' : ''})`,
          title: group.map(t => t.title).join(' | '),
          tabId: group[0]?.id,
          url: group[0]?.url,
          cpuPercent: isSleeping ? 0 : containsActive ? 1.8 : (settings.backgroundProcessThrottling ? 0.1 : 0.8),
          memoryMb: isSleeping ? 15 : Math.max(45, group.length * 35),
          threads: 6,
          status: isSleeping ? 'sleeping' : (containsActive ? 'running' : 'throttled'),
          priority: containsActive ? 'high' : 'normal',
        });
      }
    } else if (settings.processModel === 'isolated-heavy') {
      // Isolate media/video/heavy tabs, combine others
      let heavyIdx = 0;
      const normalTabs: BrowserTab[] = [];
      for (const tab of activeTabs) {
        const isHeavy = /youtube|twitch|vimeo|netflix|hulu|soundcloud|webgl|figma|canvas/i.test(tab.url);
        if (isHeavy) {
          const pid = 1200 + heavyIdx;
          heavyIdx++;
          if (this.killedPids.has(pid)) continue;
          const isSleeping = this.sleepingPids.has(pid);
          const isActive = tab.id === this.activeTabId;
          list.push({
            pid,
            type: 'media',
            name: `Isolated Heavy Process: ${tab.title}`,
            title: tab.title,
            tabId: tab.id,
            url: tab.url,
            cpuPercent: isSleeping ? 0 : isActive ? 3.5 : (settings.backgroundProcessThrottling ? 0.3 : 1.5),
            memoryMb: isSleeping ? 30 : 160,
            threads: 8,
            status: isSleeping ? 'sleeping' : (isActive ? 'running' : 'throttled'),
            priority: 'high',
          });
        } else {
          normalTabs.push(tab);
        }
      }

      if (normalTabs.length > 0) {
        const pid = 1100;
        if (!this.killedPids.has(pid)) {
          const isSleeping = this.sleepingPids.has(pid);
          const containsActive = normalTabs.some(t => t.id === this.activeTabId);
          list.push({
            pid,
            type: 'tab',
            name: `Standard Tab Process (${normalTabs.length} tabs)`,
            title: normalTabs.map(t => t.title).join(', '),
            cpuPercent: isSleeping ? 0 : containsActive ? 1.2 : 0.2,
            memoryMb: isSleeping ? 20 : Math.max(50, normalTabs.length * 30),
            threads: 6,
            status: isSleeping ? 'sleeping' : 'running',
            priority: 'normal',
          });
        }
      }
    } else {
      // 'process-per-tab': Default 1:1 dedicated process per tab
      activeTabs.forEach((tab, idx) => {
        const pid = 1100 + idx;
        if (this.killedPids.has(pid)) return;
        const isSleeping = this.sleepingPids.has(pid);
        const isActive = tab.id === this.activeTabId;
        list.push({
          pid,
          type: 'tab',
          name: `Tab: ${tab.title || 'Untitled'}`,
          title: tab.title,
          tabId: tab.id,
          url: tab.url,
          cpuPercent: isSleeping ? 0 : isActive ? 1.8 : (settings.backgroundProcessThrottling ? 0.1 : 0.6),
          memoryMb: isSleeping ? 14 : isActive ? 95 : 48,
          threads: 6,
          status: isSleeping ? 'sleeping' : (isActive ? 'running' : (settings.backgroundProcessThrottling ? 'throttled' : 'running')),
          priority: isActive ? 'high' : 'normal',
        });
      });
    }

    return list;
  }

  public killProcess(pid: number): boolean {
    this.killedPids.add(pid);
    this.sleepingPids.delete(pid);

    // If it is a tab process, find associated tab and set error status
    const tabIdx = pid - 1100;
    if (tabIdx >= 0 && tabIdx < this.tabs.length) {
      const tab = this.tabs[tabIdx];
      if (tab) {
        tab.error = 'Aw, Snap! The process for this webpage was terminated.';
        tab.isLoading = false;
      }
    }
    this.saveToLocalDisk();
    return true;
  }

  public toggleProcessSleep(pid: number): boolean {
    if (this.sleepingPids.has(pid)) {
      this.sleepingPids.delete(pid);
    } else {
      this.sleepingPids.add(pid);
    }
    return this.sleepingPids.has(pid);
  }
}
