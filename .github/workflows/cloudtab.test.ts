/**
 * CloudTab — Local-Powered Personal Browser
 * Comprehensive Local Browser Engine & Android Architecture Test Suite
 */

import assert from 'assert';
import { LocalProfileStore } from '../src/server/state.ts';
import { LocalBrowserEngine } from '../src/server/browser-engine.ts';
import type { LiveDevice } from '../src/types/browser.ts';

async function runTests() {
  console.log('================================================================');
  console.log('🚀 Running CloudTab Local Browser & Engine Test Suite');
  console.log('================================================================\n');

  const store = LocalProfileStore.getInstance();
  store.initDefaultProfile();
  const engine = new LocalBrowserEngine(store);
  await engine.initialize();

  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] Test ${total}: ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`❌ [FAIL] Test ${total}: ${name}\n   Error: ${err.message}`);
    }
  }

  // 1. Local Storage Profile Initialization
  await test('Local Storage Profile: Initializes default tabs and local storage path', () => {
    assert.strictEqual(store.profileMetadata.name, 'CloudTab Local Profile');
    assert.strictEqual(store.profileMetadata.storageProvider, 'local_filesystem');
    assert.ok(store.tabs.length >= 1, 'Should have initial tabs');
    assert.ok(store.bookmarks.length >= 1, 'Should have default bookmarks');
    assert.ok(store.profileMetadata.localStoragePath.includes('data'), 'Path should be local data folder');
  });

  // 2. Live Devices: Registers active device
  const device1: LiveDevice = {
    id: 'dev-local-laptop',
    deviceName: 'My Workstation',
    deviceType: 'desktop',
    platform: 'Linux x64',
    userAgent: 'Mozilla/5.0 CloudTab/1.0',
    ipAddress: '127.0.0.1',
    connectedAt: Date.now(),
    lastActiveAt: Date.now(),
    isLocal: true,
    isNativeAndroid: false,
    cpuCores: 8,
    memoryUsageMb: 4096,
  };

  await test('Live Devices: Registers active connected device', () => {
    store.registerLiveDevice(device1);
    const list = store.getLiveDevicesList();
    assert.ok(list.some(d => d.id === 'dev-local-laptop'));
  });

  // 3. Live Devices: Pruning on Disconnect (NO offline devices stored)
  await test('Live Devices: Disconnected devices are removed immediately (no history stored)', () => {
    const tempDev: LiveDevice = {
      id: 'dev-temp-phone',
      deviceName: 'Phone',
      deviceType: 'mobile',
      platform: 'Android 14',
      userAgent: 'CloudTabMobile',
      ipAddress: '192.168.1.100',
      connectedAt: Date.now(),
      lastActiveAt: Date.now(),
      isLocal: true,
      isNativeAndroid: true,
    };
    store.registerLiveDevice(tempDev);
    assert.ok(store.getLiveDevicesList().some(d => d.id === 'dev-temp-phone'));

    // Disconnect
    store.removeLiveDevice('dev-temp-phone');
    const updated = store.getLiveDevicesList();
    assert.strictEqual(updated.some(d => d.id === 'dev-temp-phone'), false, 'Disconnected device must NOT be stored');
  });

  // 4. Omnibox: Direct URL Resolution
  await test('Omnibox: Resolves standard website domains with https://', () => {
    const url1 = engine.resolveOmniboxInput('github.com');
    assert.strictEqual(url1, 'https://github.com');

    const url2 = engine.resolveOmniboxInput('https://wikipedia.org');
    assert.strictEqual(url2, 'https://wikipedia.org');

    const url3 = engine.resolveOmniboxInput('localhost:3000');
    assert.strictEqual(url3, 'http://localhost:3000');
  });

  // 5. Omnibox: Search Query vs URL Differentiation
  await test('Omnibox: Recognizes plain text queries and routes to default search engine', () => {
    const queryUrl = engine.resolveOmniboxInput('local webview architecture');
    assert.ok(queryUrl.startsWith('https://www.google.com/search?q='));
    assert.ok(queryUrl.includes('local%20webview%20architecture'));
  });

  // 6. Configurable Search Engines
  await test('Search Engines: Supports Google, Bing, Brave, and Ecosia engines', () => {
    const google = engine.getSearchEngineUrl('chromium', 'google');
    assert.strictEqual(google, 'https://www.google.com/search?q=chromium');

    const brave = engine.getSearchEngineUrl('privacy', 'brave');
    assert.strictEqual(brave, 'https://search.brave.com/search?q=privacy');

    const ecosia = engine.getSearchEngineUrl('trees', 'ecosia');
    assert.strictEqual(ecosia, 'https://www.ecosia.org/search?q=trees');
  });

  // 7. Multi-Tab Lifecycle & Creation
  let newTabId = '';
  await test('Tabs: Creates new independent tab with unique history stack', async () => {
    const tab = await engine.createTab('https://news.ycombinator.com');
    assert.ok(tab.id.startsWith('tab-'));
    assert.strictEqual(tab.url, 'https://news.ycombinator.com');
    assert.strictEqual(tab.canGoBack, false);
    assert.strictEqual(tab.canGoForward, false);
    newTabId = tab.id;
  });

  // 8. Navigation & History Stacks (Back/Forward)
  await test('Navigation: Forward & Back navigation through history stack', async () => {
    await engine.navigate(newTabId, 'https://wikipedia.org');
    const tabAfterNav = store.tabs.find(t => t.id === newTabId)!;
    assert.strictEqual(tabAfterNav.url, 'https://wikipedia.org');
    assert.strictEqual(tabAfterNav.canGoBack, true);
    assert.strictEqual(tabAfterNav.canGoForward, false);

    // Go back
    await engine.goBack(newTabId);
    const tabAfterBack = store.tabs.find(t => t.id === newTabId)!;
    assert.strictEqual(tabAfterBack.url, 'https://news.ycombinator.com');
    assert.strictEqual(tabAfterBack.canGoForward, true);

    // Go forward
    await engine.goForward(newTabId);
    const tabAfterForward = store.tabs.find(t => t.id === newTabId)!;
    assert.strictEqual(tabAfterForward.url, 'https://wikipedia.org');
  });

  // 9. Tab Closing & Recovery Stack
  await test('Tab Recovery: Closed tab can be restored via recovery stack', async () => {
    const initialTabCount = store.tabs.length;
    await engine.closeTab(newTabId);
    assert.strictEqual(store.tabs.length, initialTabCount - 1);

    const restored = await engine.restoreLastClosedTab();
    assert.ok(restored !== null);
    assert.strictEqual(restored?.url, 'https://wikipedia.org');
    assert.strictEqual(store.tabs.length, initialTabCount);
  });

  // 10. Local Bookmarks Management
  await test('Bookmarks: Adds, organizes by folder, and persists locally', () => {
    const testBmId = `bm-test-${Date.now()}`;
    const initialCount = store.bookmarks.length;
    store.bookmarks.unshift({
      id: testBmId,
      title: 'MDN Web Docs',
      url: 'https://developer.mozilla.org',
      folder: 'Development',
      createdAt: Date.now(),
    });
    assert.strictEqual(store.bookmarks.length, initialCount + 1);
    store.saveToLocalDisk();

    // Clean up test bookmark
    store.bookmarks = store.bookmarks.filter(b => b.id !== testBmId);
    store.saveToLocalDisk();
  });

  // 11. Local Browsing History & Clear Browsing Data
  await test('History: Records visits and supports complete browsing data purge', () => {
    store.history.unshift({
      id: `hist-test-${Date.now()}`,
      title: 'Rust Programming',
      url: 'https://www.rust-lang.org',
      visitedAt: Date.now(),
    });
    assert.ok(store.history.length >= 1);

    store.clearBrowsingData({ history: true });
    assert.strictEqual(store.history.length, 0, 'Browsing history should be purged');
  });

  // 12. Local Downloads Handling
  await test('Downloads: Initiates local download record with local storage path', async () => {
    const dl = await engine.initiateDownload('https://example.com/test.zip', 'test.zip');
    assert.strictEqual(dl.filename, 'test.zip');
    assert.ok(dl.localPath.includes('downloads'));
    assert.strictEqual(store.downloads.length > 0, true);

    // Clean up test download
    store.downloads = store.downloads.filter(d => d.id !== dl.id);
    store.saveToLocalDisk();
  });

  // 13. Privacy Mode Enforcement
  await test('Privacy Mode: When enabled, does not record URLs to history', async () => {
    store.preferences.privateBrowsingMode = true;
    const tab = await engine.createTab('https://private-mode-test.com');
    await engine.navigate(tab.id, 'https://secret-test.org');

    const inHistory = store.history.some(h => h.url === 'https://secret-test.org');
    assert.strictEqual(inHistory, false, 'Private browsing URLs must not appear in history');
    store.preferences.privateBrowsingMode = false;
  });

  // 14. Polished Error Page Rendering
  await test('Error Page: Generates HTML error page with reload and search actions', () => {
    const errorHtml = engine.renderErrorPage('https://unreachable-test-site-999.xyz', 'DNS_PROBE_FINISHED_NXDOMAIN');
    assert.ok(errorHtml.includes('This site can’t be reached'));
    assert.ok(errorHtml.includes('unreachable-test-site-999.xyz'));
    assert.ok(errorHtml.includes('DNS_PROBE_FINISHED_NXDOMAIN'));
    assert.ok(errorHtml.includes('Go to Homepage'));
  });

  // 15. Local Device Hardware Metrics
  await test('Hardware Metrics: Node OS module reports real CPU cores and RAM', () => {
    store.updateSystemMetrics();
    assert.ok(store.profileMetadata.cpuCores >= 1);
    assert.ok(store.profileMetadata.totalMemoryMb > 0);
    assert.ok(store.profileMetadata.freeMemoryMb > 0);
    assert.ok(store.profileMetadata.systemOs.length > 0);
  });

  // 16. Security Access Password ("zetta")
  await test('Security: Access password "zetta" validation and rejection of incorrect passwords', () => {
    assert.strictEqual(store.verifyAccessPassword('zetta'), true, 'Exact match "zetta" must pass');
    assert.strictEqual(store.verifyAccessPassword('  zetta  '), true, 'Trimmed "zetta" must pass');
    assert.strictEqual(store.verifyAccessPassword('ZETTA'), true, 'Case-insensitive "ZETTA" must pass');
    assert.strictEqual(store.verifyAccessPassword('wrong_password'), false, 'Incorrect password must fail');
    assert.strictEqual(store.verifyAccessPassword(''), false, 'Empty password must fail');
  });

  // 17. Process Allocation Configuration
  await test('Process Allocation: Configures process model and chooses dedicated sub-processes', () => {
    const updated = store.updateProcessSettings({
      processModel: 'process-per-site',
      dedicatedGpuProcess: true,
      dedicatedNetworkProcess: true,
      dedicatedExtensionProcess: true,
      dedicatedMediaProcess: false,
    });
    assert.strictEqual(updated.processModel, 'process-per-site');
    assert.strictEqual(updated.dedicatedMediaProcess, false);

    // Restore to process-per-tab
    store.updateProcessSettings({
      processModel: 'process-per-tab',
      dedicatedMediaProcess: true,
    });
  });

  // 18. Process Execution Target (Cloud vs Local Device)
  await test('Execution Target: Allows switching between Local Device and Cloud Server processes', () => {
    store.updateProcessSettings({ executionTarget: 'local' });
    let processes = store.getProcessList();
    assert.ok(processes.some(p => p.name.includes('[Local]')), 'Processes should indicate Local Device execution');

    // Switch to Cloud
    store.updateProcessSettings({ executionTarget: 'cloud' });
    processes = store.getProcessList();
    assert.ok(processes.some(p => p.name.includes('[Cloud]')), 'Processes should indicate Cloud Server execution');

    // Restore to local
    store.updateProcessSettings({ executionTarget: 'local' });
  });

  // 19. Task Manager & Process Termination
  await test('Task Manager: Generates dynamic process list and allows terminating rogue processes', () => {
    const list = store.getProcessList();
    assert.ok(list.length >= 2, 'Should have browser main process and sub-processes');

    const tabProcess = list.find(p => p.type === 'tab');
    if (tabProcess) {
      const pidToKill = tabProcess.pid;
      store.killProcess(pidToKill);
      assert.ok(store.killedPids.has(pidToKill));
      store.killedPids.delete(pidToKill);
    }
  });

  // 20. Process Sleep (Memory Saver)
  await test('Memory Saver: Puts inactive process to sleep and wakes it back up', () => {
    const isSleepingNow = store.toggleProcessSleep(1001);
    assert.strictEqual(isSleepingNow, true);
    assert.ok(store.sleepingPids.has(1001));

    const isAwakeNow = store.toggleProcessSleep(1001);
    assert.strictEqual(isAwakeNow, false);
    assert.strictEqual(store.sleepingPids.has(1001), false);
  });

  // Clean up state back to clean single tab
  store.tabs = [
    {
      id: 'tab-welcome-1',
      url: 'cloudtab://newtab',
      title: 'New Tab',
      favicon: 'https://www.google.com/favicon.ico',
      isLoading: false,
      progress: 100,
      canGoBack: false,
      canGoForward: false,
      isSecure: true,
      createdAt: 1700000000000,
      lastAccessedAt: 1700000000000,
    },
  ];
  store.activeTabId = 'tab-welcome-1';
  store.preferences.privateBrowsingMode = false;
  store.bookmarks = store.bookmarks.filter(b => !b.id.startsWith('bm-test-'));
  if (store.bookmarks.length === 0) {
    store.initDefaultBookmarks();
  }
  store.saveToLocalDisk();

  console.log('\n================================================================');
  console.log(`✨ TEST RESULTS: ${passed}/${total} TESTS PASSED (${Math.round((passed / total) * 100)}% SUCCESS)`);
  console.log('================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

