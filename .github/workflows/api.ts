/**
 * CloudTab — Local-Powered Personal Browser
 * Frontend API Service (Local Engine + Android Native Bridge Support)
 */

import type {
  BrowserTab,
  BookmarkItem,
  HistoryEntry,
  LocalDownload,
  LiveDevice,
  LocalBrowserPreferences,
  LocalProfileMetadata,
  BrowserProcessInfo,
  ProcessAllocationSettings,
} from '../types/browser.ts';

export interface DeviceStatusResponse {
  liveDevices: LiveDevice[];
  deviceCount: number;
  system: {
    cpuCores: number;
    totalMemoryMb: number;
    freeMemoryMb: number;
    systemOs: string;
  };
}

class ApiService {
  private isNative(): boolean {
    return typeof window !== 'undefined' && typeof window.CloudTabNative !== 'undefined';
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    const res = await fetch(endpoint, {
      ...options,
      headers,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(errBody.error || `Request failed with status ${res.status}`);
    }

    return res.json();
  }

  // =========================================================================
  // TABS & NAVIGATION
  // =========================================================================

  public async getTabs(): Promise<{ tabs: BrowserTab[]; activeTabId: string; closedTabsAvailable: number; preferences: LocalBrowserPreferences }> {
    return this.request('/api/browser/tabs');
  }

  public async createTab(url?: string): Promise<{ tab: BrowserTab; activeTabId: string; tabs: BrowserTab[] }> {
    if (this.isNative()) {
      window.CloudTabNative?.newTab(url || 'cloudtab://newtab');
    }
    return this.request('/api/browser/tabs', {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  public async switchTab(tabId: string): Promise<{ activeTabId: string }> {
    if (this.isNative()) {
      window.CloudTabNative?.switchTab(tabId);
    }
    return this.request('/api/browser/tabs/switch', {
      method: 'POST',
      body: JSON.stringify({ tabId }),
    });
  }

  public async closeTab(tabId: string): Promise<{ closedId: string; activeTabId: string; tabs: BrowserTab[] }> {
    if (this.isNative()) {
      window.CloudTabNative?.closeTab(tabId);
    }
    return this.request(`/api/browser/tabs/${tabId}`, {
      method: 'DELETE',
    });
  }

  public async restoreClosedTab(): Promise<{ tab: BrowserTab; activeTabId: string; tabs: BrowserTab[] }> {
    return this.request('/api/browser/tabs/restore', {
      method: 'POST',
    });
  }

  public async navigate(tabId: string, url: string): Promise<{ tab: BrowserTab }> {
    if (this.isNative()) {
      window.CloudTabNative?.navigate(tabId, url);
    }
    return this.request(`/api/browser/tabs/${tabId}/navigate`, {
      method: 'POST',
      body: JSON.stringify({ url }),
    });
  }

  public async goBack(tabId: string): Promise<{ tab: BrowserTab }> {
    if (this.isNative()) {
      window.CloudTabNative?.goBack(tabId);
    }
    return this.request(`/api/browser/tabs/${tabId}/back`, { method: 'POST' });
  }

  public async goForward(tabId: string): Promise<{ tab: BrowserTab }> {
    if (this.isNative()) {
      window.CloudTabNative?.goForward(tabId);
    }
    return this.request(`/api/browser/tabs/${tabId}/forward`, { method: 'POST' });
  }

  public async reload(tabId: string): Promise<{ tab: BrowserTab }> {
    if (this.isNative()) {
      window.CloudTabNative?.reload(tabId);
    }
    return this.request(`/api/browser/tabs/${tabId}/reload`, { method: 'POST' });
  }

  public async stopLoading(tabId: string): Promise<{ tab: BrowserTab }> {
    if (this.isNative()) {
      window.CloudTabNative?.stopLoading(tabId);
    }
    return this.request(`/api/browser/tabs/${tabId}/stop`, { method: 'POST' });
  }

  // =========================================================================
  // BOOKMARKS
  // =========================================================================

  public async getBookmarks(): Promise<BookmarkItem[]> {
    return this.request('/api/browser/bookmarks');
  }

  public async addBookmark(bookmark: { title: string; url: string; favicon?: string; folder?: string }): Promise<BookmarkItem> {
    return this.request('/api/browser/bookmarks', {
      method: 'POST',
      body: JSON.stringify(bookmark),
    });
  }

  public async deleteBookmark(id: string): Promise<{ success: boolean; bookmarks: BookmarkItem[] }> {
    return this.request(`/api/browser/bookmarks/${id}`, { method: 'DELETE' });
  }

  // =========================================================================
  // HISTORY
  // =========================================================================

  public async getHistory(): Promise<HistoryEntry[]> {
    return this.request('/api/browser/history');
  }

  public async deleteHistoryItem(id: string): Promise<{ success: boolean; history: HistoryEntry[] }> {
    return this.request(`/api/browser/history/${id}`, { method: 'DELETE' });
  }

  public async clearHistory(): Promise<{ success: boolean; message: string }> {
    if (this.isNative()) {
      window.CloudTabNative?.clearBrowsingData();
    }
    return this.request('/api/browser/history', { method: 'DELETE' });
  }

  // =========================================================================
  // DOWNLOADS
  // =========================================================================

  public async getDownloads(): Promise<LocalDownload[]> {
    return this.request('/api/browser/downloads');
  }

  public async startDownload(url: string, filename?: string): Promise<LocalDownload> {
    if (this.isNative()) {
      window.CloudTabNative?.downloadFile(url, navigator.userAgent, '', 'application/octet-stream');
    }
    return this.request('/api/browser/downloads', {
      method: 'POST',
      body: JSON.stringify({ url, filename }),
    });
  }

  public async deleteDownload(id: string): Promise<{ success: boolean; downloads: LocalDownload[] }> {
    return this.request(`/api/browser/downloads/${id}`, { method: 'DELETE' });
  }

  // =========================================================================
  // SETTINGS & PROFILE
  // =========================================================================

  public async getSettings(): Promise<{ preferences: LocalBrowserPreferences; metadata: LocalProfileMetadata }> {
    return this.request('/api/browser/settings');
  }

  public async updateSettings(prefs: Partial<LocalBrowserPreferences>): Promise<{ success: boolean; preferences: LocalBrowserPreferences }> {
    if (this.isNative() && typeof prefs.privateBrowsingMode !== 'undefined') {
      window.CloudTabNative?.setPrivateBrowsing(prefs.privateBrowsingMode);
    }
    return this.request('/api/browser/settings', {
      method: 'POST',
      body: JSON.stringify(prefs),
    });
  }

  public async clearBrowsingData(options?: { history?: boolean; cookies?: boolean; downloads?: boolean }): Promise<{ success: boolean; message: string }> {
    if (this.isNative()) {
      window.CloudTabNative?.clearBrowsingData();
    }
    return this.request('/api/browser/clear-data', {
      method: 'POST',
      body: JSON.stringify(options || {}),
    });
  }

  // =========================================================================
  // LIVE DEVICES (ONLY ACTIVE ONES)
  // =========================================================================

  public async getLiveDevices(): Promise<DeviceStatusResponse> {
    return this.request('/api/browser/devices/live');
  }

  // =========================================================================
  // SECURITY & ACCESS PASSWORD
  // =========================================================================

  public async getAuthStatus(): Promise<{ passwordRequired: boolean; autoLockMinutes: number }> {
    return this.request('/api/browser/auth/status');
  }

  public async unlockBrowser(password: string): Promise<{ success: boolean; message?: string }> {
    return this.request('/api/browser/auth/unlock', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
  }

  // =========================================================================
  // PROCESS ALLOCATION & TASK MANAGER
  // =========================================================================

  public async getProcesses(): Promise<{
    processes: BrowserProcessInfo[];
    settings: ProcessAllocationSettings;
    summary: {
      totalCpu: number;
      totalMemoryMb: number;
      processCount: number;
      systemCores: number;
      systemTotalMemoryMb: number;
    };
  }> {
    return this.request('/api/browser/processes');
  }

  public async updateProcessSettings(settings: Partial<ProcessAllocationSettings>): Promise<{ success: boolean; settings: ProcessAllocationSettings }> {
    return this.request('/api/browser/processes/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  public async killProcess(pid: number): Promise<{ success: boolean; pid: number; processes: BrowserProcessInfo[] }> {
    return this.request(`/api/browser/processes/${pid}/kill`, {
      method: 'POST',
    });
  }

  public async toggleProcessSleep(pid: number): Promise<{ success: boolean; pid: number; isSleeping: boolean; processes: BrowserProcessInfo[] }> {
    return this.request(`/api/browser/processes/${pid}/toggle-sleep`, {
      method: 'POST',
    });
  }
}

export const api = new ApiService();

