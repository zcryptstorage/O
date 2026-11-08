/**
 * CloudTab — Local-Powered Personal Browser
 * Comprehensive TypeScript definitions for local-first browser engine,
 * Android WebView native bridge, local storage persistence, and live device telemetry.
 */

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  isLoading: boolean;
  progress: number; // 0 to 100
  canGoBack: boolean;
  canGoForward: boolean;
  isSecure: boolean; // HTTPS certificate state
  isMuted?: boolean;
  hasAudioPlaying?: boolean;
  isVideoPlaying?: boolean;
  error?: string | null;
  createdAt: number;
  lastAccessedAt: number;
}

export interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  favicon?: string;
  folder?: string;
  createdAt: number;
}

export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visitedAt: number;
  favicon?: string;
}

export interface ChromeExtension {
  id: string;
  name: string;
  version: string;
  description: string;
  icon: string;
  enabled: boolean;
  permissions: string[];
  homepageUrl?: string;
  manifestVersion: number;
  source: 'builtin' | 'custom' | 'store';
}

export interface LocalDownload {
  id: string;
  filename: string;
  fileSizeBytes: number;
  mimeType: string;
  url: string;
  localPath: string;
  downloadedAt: number;
  progress: number; // 0 to 100
  status: 'completed' | 'in_progress' | 'cancelled' | 'failed';
  error?: string;
}

/**
 * ONLY live connected devices are maintained.
 * No historical disconnected device records are stored.
 */
export interface LiveDevice {
  id: string;
  deviceName: string;
  deviceType: 'android' | 'desktop' | 'tablet' | 'mobile';
  platform: string;
  userAgent: string;
  ipAddress: string;
  connectedAt: number;
  lastActiveAt: number;
  isLocal: boolean;
  isNativeAndroid: boolean;
  cpuCores?: number;
  memoryUsageMb?: number;
}

export type ProcessModel = 'process-per-tab' | 'process-per-site' | 'single-process' | 'isolated-heavy';
export type ProcessExecutionTarget = 'local' | 'cloud' | 'hybrid';

export interface ProcessAllocationSettings {
  processModel: ProcessModel;
  executionTarget: ProcessExecutionTarget; // Switch between 'local' and 'cloud'
  maxProcesses: number; // 0 for Auto/System cores, or 2, 4, 8, 16
  dedicatedGpuProcess: boolean;
  dedicatedNetworkProcess: boolean;
  dedicatedExtensionProcess: boolean;
  dedicatedMediaProcess: boolean;
  dedicatedStorageProcess: boolean;
  backgroundProcessThrottling: boolean;
  memorySaverDiscardMinutes: number; // 0 (off), 5, 15, 30, 60
  preferredCpuPriority: 'performance' | 'balanced' | 'power-saver';
}

export interface BrowserProcessInfo {
  pid: number;
  type: 'browser' | 'tab' | 'gpu' | 'network' | 'extension' | 'media' | 'storage';
  name: string;
  title?: string;
  tabId?: string;
  url?: string;
  cpuPercent: number;
  memoryMb: number;
  threads: number;
  status: 'running' | 'throttled' | 'sleeping';
  priority: 'high' | 'normal' | 'low';
}

export interface LocalBrowserPreferences {
  theme: 'dark' | 'light' | 'system';
  homePage: string;
  defaultSearchEngine: 'google' | 'duckduckgo' | 'bing' | 'brave' | 'ecosia';
  javascriptEnabled: boolean;
  cookiesEnabled: boolean;
  doNotTrack: boolean;
  privateBrowsingMode: boolean;
  hardwareAcceleration: boolean;
  restoreTabsOnStartup: boolean;
  fontSize: 'small' | 'medium' | 'large';
  zoomLevel: number; // e.g. 100
  securityPasswordEnabled: boolean;
  autoLockMinutes: number; // 0 (never), 5, 15, 30
  processSettings: ProcessAllocationSettings;
}

export interface LocalProfileMetadata {
  name: string;
  profileId: string;
  storageProvider: 'local_filesystem' | 'android_sqlite' | 'browser_indexeddb';
  browserEngine: 'android_chromium_webview' | 'local_embedded_chromium' | 'local_sandboxed_engine';
  localStoragePath: string;
  activeTabsCount: number;
  bookmarksCount: number;
  historyCount: number;
  downloadsCount: number;
  extensionsCount: number;
  cpuCores: number;
  totalMemoryMb: number;
  freeMemoryMb: number;
  systemOs: string;
}

export interface WebSocketMessage {
  type:
    | 'sync_state'
    | 'tab_updated'
    | 'tab_created'
    | 'tab_closed'
    | 'tab_switched'
    | 'download_progress'
    | 'download_completed'
    | 'live_devices_changed'
    | 'ping'
    | 'pong';
  payload: any;
  timestamp: number;
  deviceId?: string;
}

/**
 * Android Native Bridge contract for window.CloudTabNative
 */
export interface AndroidBridge {
  navigate(tabId: string, url: string): void;
  newTab(url: string): void;
  closeTab(tabId: string): void;
  switchTab(tabId: string): void;
  goBack(tabId: string): void;
  goForward(tabId: string): void;
  reload(tabId: string): void;
  stopLoading(tabId: string): void;
  downloadFile(url: string, userAgent: string, contentDisposition: string, mimeType: string): void;
  setPrivateBrowsing(enabled: boolean): void;
  clearBrowsingData(): void;
  getDeviceStats(): string; // JSON
}

declare global {
  interface Window {
    CloudTabNative?: AndroidBridge;
  }
}
