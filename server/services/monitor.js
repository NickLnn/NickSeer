import { getSystemMetrics } from './system.js';
import { load } from '../config.js';
import * as telegram from './telegram.js';

let cpuHighMinutes = 0;
let tempHighMinutes = 0;
let cpuCooldown = 0;
let tempCooldown = 0;
let monitorTimer = null;
let _testDispatcher = null;

export function _setTestDispatcher(fn) { _testDispatcher = fn; }

async function dispatchNotify(type, data) {
  if (typeof _testDispatcher === 'function') {
    return _testDispatcher(type, data);
  }
  return telegram.notify(type, data);
}

export async function evaluateMetrics() {
  const cfg = load();
  const c = cfg.telegram || {};
  if (!c.enabled) return { skipped: true, reason: 'telegram disabled' };

  try {
    const metrics = getSystemMetrics();
    const cpuUsage = metrics.cpu?.usagePercent || 0;
    const cpuTemp = metrics.cpu?.temperature || 0;

    // Respect whatever threshold the admin configured in Settings
    const tempThreshold = (typeof c.systemTempThreshold === 'number' && c.systemTempThreshold > 0)
      ? c.systemTempThreshold
      : 90;

    let tempAlertSent = false;
    let cpuAlertSent = false;

    // CPU Temperature Alert Evaluation Loop
    if (cpuTemp >= tempThreshold) {
      tempHighMinutes++;
      console.warn(`[monitor] High CPU temperature detected: ${cpuTemp}°C >= threshold ${tempThreshold}°C (sustained: ${tempHighMinutes}/10 min)`);

      if (tempHighMinutes >= 10 && tempCooldown <= 0) {
        console.warn(`[monitor] Critical temperature sustained (${cpuTemp}°C for ${tempHighMinutes} min). Dispatching SystemTemperatureAlert to Telegram...`);
        await dispatchNotify(telegram.NotificationType.SystemTemperatureAlert, {
          temp: cpuTemp,
          threshold: tempThreshold,
          durationMinutes: tempHighMinutes
        });
        tempCooldown = 60; // 1-hour cooldown before repeat alert
        tempAlertSent = true;
      }
    } else {
      // If temperature normalized below threshold, reset sustain counter and cooldown immediately
      if (tempHighMinutes > 0 || tempCooldown > 0) {
        console.log(`[monitor] CPU temperature normalized to ${cpuTemp}°C (< threshold ${tempThreshold}°C). Resetting sustain tracking.`);
      }
      tempHighMinutes = 0;
      tempCooldown = 0;
    }

    // Cooldown decrement for temperature if still above threshold
    if (tempCooldown > 0 && !tempAlertSent) {
      tempCooldown--;
    }

    // CPU Usage Alert Evaluation Loop
    if (cpuUsage >= 85) {
      cpuHighMinutes++;
      console.warn(`[monitor] High CPU usage detected: ${cpuUsage}% >= 85% (sustained: ${cpuHighMinutes}/10 min)`);

      if (cpuHighMinutes >= 10 && cpuCooldown <= 0) {
        console.warn(`[monitor] High CPU usage sustained (${cpuUsage}% for ${cpuHighMinutes} min). Dispatching HighCpuUsageAlert to Telegram...`);
        await dispatchNotify(telegram.NotificationType.HighCpuUsageAlert, {
          usage: cpuUsage,
          durationMinutes: cpuHighMinutes
        });
        cpuCooldown = 60; // 1-hour cooldown before repeat alert
        cpuAlertSent = true;
      }
    } else {
      if (cpuHighMinutes > 0 || cpuCooldown > 0) {
        console.log(`[monitor] CPU usage normalized to ${cpuUsage}%. Resetting sustain tracking.`);
      }
      cpuHighMinutes = 0;
      cpuCooldown = 0;
    }

    // Cooldown decrement for CPU if still above 85%
    if (cpuCooldown > 0 && !cpuAlertSent) {
      cpuCooldown--;
    }

    return {
      cpuUsage,
      cpuTemp,
      tempThreshold,
      tempHighMinutes,
      cpuHighMinutes,
      tempCooldown,
      cpuCooldown,
      tempAlertSent,
      cpuAlertSent
    };
  } catch (e) {
    console.error('[monitor] Error in evaluation loop:', e.message);
    return { error: e.message };
  }
}

export function startMonitoring() {
  if (monitorTimer) return;
  const cfg = load();
  const threshold = cfg.telegram?.systemTempThreshold || 90;
  console.log(`[monitor] Starting background thermal and host health monitoring service (polling every 60s, threshold: ${threshold}°C from settings)`);

  monitorTimer = setInterval(async () => {
    await evaluateMetrics();
  }, 60000); // 1 minute
}

export function stopMonitoring() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
    console.log('[monitor] Background thermal monitoring stopped');
  }
}

export function getMonitorStatus() {
  const cfg = load();
  const c = cfg.telegram || {};
  return {
    active: !!monitorTimer,
    enabled: !!c.enabled,
    tempThreshold: c.systemTempThreshold || 90,
    tempHighMinutes,
    cpuHighMinutes,
    tempCooldown,
    cpuCooldown
  };
}

// For unit/sandbox testing: helper to manually override high minutes or cooldown
export function _setMonitorStateForTest({ tempHigh, cpuHigh, tempCd, cpuCd }) {
  if (tempHigh != null) tempHighMinutes = tempHigh;
  if (cpuHigh != null) cpuHighMinutes = cpuHigh;
  if (tempCd != null) tempCooldown = tempCd;
  if (cpuCd != null) cpuCooldown = cpuCd;
}
