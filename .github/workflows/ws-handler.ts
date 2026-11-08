/**
 * CloudTab — Local-Powered Personal Browser
 * WebSocket Coordinator for Local Multi-Tab Sync & Live Devices
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { LocalProfileStore } from './state.ts';
import type { WebSocketMessage } from '../types/browser.ts';

interface ClientConnection {
  ws: WebSocket;
  deviceId: string;
  isAlive: boolean;
}

export class WebSocketCoordinator {
  private wss: WebSocketServer;
  private clients: Set<ClientConnection> = new Set();
  private store: LocalProfileStore;

  constructor(server: Server) {
    this.store = LocalProfileStore.getInstance();
    this.wss = new WebSocketServer({ server, path: '/ws/browser' });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const url = new URL(req.url || '', 'http://localhost');
      let deviceId = url.searchParams.get('deviceId');
      if (!deviceId) {
        const cookieHeader = req.headers.cookie || '';
        const match = cookieHeader.match(/cloudtab_device_id=([^;]+)/);
        deviceId = match ? match[1] : `dev-${Date.now()}`;
      }

      const client: ClientConnection = {
        ws,
        deviceId,
        isAlive: true,
      };

      this.clients.add(client);
      this.store.updateLiveDeviceHeartbeat(deviceId);

      // Send initial full sync
      this.sendToClient(client, {
        type: 'sync_state',
        timestamp: Date.now(),
        payload: {
          profile: this.store.profileMetadata,
          preferences: this.store.preferences,
          tabs: this.store.tabs,
          activeTabId: this.store.activeTabId,
          liveDevices: this.store.getLiveDevicesList(),
        },
      });

      // Broadcast live device change
      this.broadcast({
        type: 'live_devices_changed',
        timestamp: Date.now(),
        payload: {
          liveDevices: this.store.getLiveDevicesList(),
        },
      });

      ws.on('message', (messageData: string) => {
        try {
          const msg = JSON.parse(messageData.toString());
          if (msg.type === 'ping') {
            client.isAlive = true;
            this.store.updateLiveDeviceHeartbeat(client.deviceId);
            this.sendToClient(client, { type: 'pong', timestamp: Date.now(), payload: {} });
          } else if (msg.type === 'tab_switched') {
            const { tabId } = msg.payload;
            if (tabId) {
              this.store.activeTabId = tabId;
              this.broadcast({
                type: 'tab_switched',
                timestamp: Date.now(),
                payload: { activeTabId: tabId },
              }, client);
            }
          }
        } catch {
          // ignore malformed
        }
      });

      ws.on('close', () => {
        this.clients.delete(client);
        // Remove device immediately when socket closes
        this.store.removeLiveDevice(client.deviceId);
        this.broadcast({
          type: 'live_devices_changed',
          timestamp: Date.now(),
          payload: {
            liveDevices: this.store.getLiveDevicesList(),
          },
        });
      });

      ws.on('error', () => {
        this.clients.delete(client);
        this.store.removeLiveDevice(client.deviceId);
      });
    });

    // Heartbeat ping interval to clear stale connections
    setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          client.ws.terminate();
          this.clients.delete(client);
          this.store.removeLiveDevice(client.deviceId);
          continue;
        }
        client.isAlive = false;
        client.ws.ping();
      }
    }, 30000);
  }

  public broadcast(message: WebSocketMessage, excludeClient?: ClientConnection): void {
    const raw = JSON.stringify(message);
    for (const client of this.clients) {
      if (client !== excludeClient && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(raw);
      }
    }
  }

  private sendToClient(client: ClientConnection, message: WebSocketMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }
}
