/**
 * CloudTab — Local-Powered Personal Browser
 * Local Device & Session Management
 * 
 * - Manages active local device presence
 * - Returns ONLY currently live devices (never stores past offline devices)
 * - Exposes local device telemetry
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import os from 'os';
import { LocalProfileStore } from '../state.ts';
import type { LiveDevice } from '../../types/browser.ts';

export const authRouter = Router();
const store = LocalProfileStore.getInstance();

export function getOrCreateLiveDevice(req: Request, res: Response): LiveDevice {
  const cookieSession = req.cookies?.cloudtab_device_id;
  const headerToken = req.headers['x-device-id'] as string;
  const deviceId = cookieSession || headerToken || `dev-${crypto.randomBytes(6).toString('hex')}`;

  const userAgent = req.headers['user-agent'] || 'Modern Browser';
  let detectedType: 'desktop' | 'tablet' | 'mobile' | 'android' = 'desktop';

  if (/Android.*CloudTabNative/i.test(userAgent)) {
    detectedType = 'android';
  } else if (/iPad|Android(?!.*Mobile)|Tablet/i.test(userAgent)) {
    detectedType = 'tablet';
  } else if (/Mobile|Android|iPhone/i.test(userAgent)) {
    detectedType = 'mobile';
  }

  let defaultName = 'Local Workstation';
  if (detectedType === 'android') defaultName = 'Android Device (Native)';
  else if (detectedType === 'tablet') defaultName = 'Tablet';
  else if (detectedType === 'mobile') defaultName = 'Phone';
  else if (/Macintosh|Mac OS/i.test(userAgent)) defaultName = 'Mac';
  else if (/Windows/i.test(userAgent)) defaultName = 'Windows PC';
  else if (/Linux/i.test(userAgent)) defaultName = 'Linux Desktop';

  const ip = ((req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1').split(',')[0].trim();

  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.');

  const liveDevice: LiveDevice = {
    id: deviceId,
    deviceName: defaultName,
    deviceType: detectedType,
    platform: `${os.type()} ${os.arch()}`,
    userAgent,
    ipAddress: ip,
    connectedAt: Date.now(),
    lastActiveAt: Date.now(),
    isLocal,
    isNativeAndroid: detectedType === 'android',
    cpuCores: os.cpus().length,
    memoryUsageMb: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024),
  };

  store.registerLiveDevice(liveDevice);

  res.cookie('cloudtab_device_id', deviceId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24, // 24 hours
    path: '/',
  });

  return liveDevice;
}

/**
 * GET /api/auth/status
 * Returns current device and ONLY active live devices
 */
authRouter.get('/status', (req: Request, res: Response) => {
  const currentDevice = getOrCreateLiveDevice(req, res);
  const liveDevices = store.getLiveDevicesList();

  res.json({
    authenticated: true,
    device: currentDevice,
    liveDevices,
    liveDeviceCount: liveDevices.length,
    profile: store.profileMetadata,
    preferences: store.preferences,
  });
});

/**
 * GET /api/auth/devices
 * Returns strictly the current live devices list
 */
authRouter.get('/devices', (req: Request, res: Response) => {
  const liveDevices = store.getLiveDevicesList();
  res.json({
    liveDevices,
    count: liveDevices.length,
  });
});

/**
 * POST /api/auth/heartbeat
 */
authRouter.post('/heartbeat', (req: Request, res: Response) => {
  const deviceId = req.cookies?.cloudtab_device_id || req.body?.deviceId;
  if (deviceId) {
    store.updateLiveDeviceHeartbeat(deviceId);
  }
  res.json({ success: true });
});

/**
 * POST /api/auth/disconnect
 * Immediately removes device from live list
 */
authRouter.post('/disconnect', (req: Request, res: Response) => {
  const deviceId = req.cookies?.cloudtab_device_id || req.body?.deviceId;
  if (deviceId) {
    store.removeLiveDevice(deviceId);
  }
  res.json({ success: true, message: 'Device unregistered' });
});
