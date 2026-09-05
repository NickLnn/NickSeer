import { load } from '../config.js';
import arr from './arr.js';

export const NotificationType = {
  SystemTemperatureAlert: 'systemTemp',
  HighCpuUsageAlert: 'systemCpu',
  Pending: 'pending',
  AutoApproved: 'autoApproved',
  Approved: 'approved',
  Declined: 'declined',
  Available: 'available',
  Failed: 'failed',
  Issue: 'issue'
};

const TYPE_MAP = {
  SystemTemperatureAlert: 'systemTemp',
  systemTemperatureAlert: 'systemTemp',
  systemTemp: 'systemTemp',
  HighCpuUsageAlert: 'systemCpu',
  highCpuUsageAlert: 'systemCpu',
  systemCpu: 'systemCpu',
  Pending: 'pending',
  AutoApproved: 'autoApproved',
  Approved: 'approved',
  Declined: 'declined',
  Available: 'available',
  Failed: 'failed',
  Issue: 'issue'
};

export async function notify(type, reqData = {}) {
  const cfg = load();
  const c = cfg.telegram;
  if (!c || !c.enabled || !c.botToken || !c.chatId) return;

  const canonicalType = TYPE_MAP[type] || type;
  if (c.types && c.types[canonicalType] === false && c.types[type] === false) return;

  const title = reqData.title || 'Unknown Title';
  const by = reqData.by || 'guest';
  const mediaStr = reqData.media === 'tv' || reqData.media === 'show' ? 'TV Series' : 'Movie';

  let pName = 'Default';
  let rootFolder = 'Default';
  
  if (reqData.media) {
    try {
      const isTv = (reqData.media === 'tv' || reqData.media === 'show');
      const kind = isTv ? 'sonarr' : 'radarr';
      const arrCfg = (cfg.services && cfg.services[kind]) ? cfg.services[kind] : {};
      
      const targetProfileId = Number(reqData.qualityProfileId || arrCfg.qualityProfileId);
      if (targetProfileId) {
        const profiles = await arr.qualityProfiles(kind);
        const p = profiles.find(x => x.id === targetProfileId);
        if (p) pName = p.name;
      }
      
      const targetRoot = reqData.rootFolder || arrCfg.rootFolder;
      if (targetRoot) {
        rootFolder = targetRoot;
      }
    } catch(e) {}
  }

  let seasonStr = '';
  if (reqData.seasons && reqData.seasons.length > 0) {
    seasonStr = `\nSeasons: <b>${reqData.seasons.join(', ')}</b>`;
  }
  
  const extras = ['pending', 'autoApproved', 'approved', 'declined', 'available', 'failed'].includes(canonicalType) ? `${seasonStr}\nProfile: <i>${pName}</i>\nRoot: <i>${rootFolder}</i>` : '';

  let msg = '';
  let color = '\u2753';
  if (canonicalType === 'pending') { color = '\uD83D\uDD14'; msg = `<b>New Request Pending Approval</b>\n\n<b>${title}</b> (${mediaStr})${extras}\nRequested by: <i>${by}</i>\nStatus: Pending`; }
  else if (canonicalType === 'autoApproved') { color = '\u2728'; msg = `<b>Request Automatically Approved</b>\n\n<b>${title}</b> (${mediaStr})${extras}\nRequested by: <i>${by}</i>\nStatus: Automatically Approved`; }
  else if (canonicalType === 'approved') { color = '\u2705'; msg = `<b>Request Approved</b>\n\n<b>${title}</b> (${mediaStr})${extras}\nRequested by: <i>${by}</i>\nStatus: Approved by Admin`; }
  else if (canonicalType === 'declined') { color = '\u274C'; msg = `<b>Request Declined</b>\n\n<b>${title}</b> (${mediaStr})${extras}\nRequested by: <i>${by}</i>\nStatus: Declined by Admin`; }
  else if (canonicalType === 'available') { color = '\uD83D\uDC40'; msg = `<b>Already Tracked</b>\n\n<b>${title}</b> (${mediaStr})\nRequested by: <i>${by}</i>\nStatus: Already tracking in ${reqData.media === 'tv' || reqData.media === 'show' ? 'Sonarr' : 'Radarr'}`; }
  else if (canonicalType === 'issue') { color = '\u26A0\uFE0F'; msg = `<b>Media Issue Reported</b>\n\n<b>${title}</b> (${reqData.media})\nIssue Type: <i>${reqData.issueType || 'Other'}</i>\nMessage: ${reqData.message || 'No description provided.'}`; }
  else if (canonicalType === 'failed') { color = '\u26A0\uFE0F'; msg = `<b>Request Processing Failed</b>\n\n<b>${title}</b> (${mediaStr})\nRequested by: <i>${by}</i>\nStatus: Failed to add to Arr`; }
  else if (canonicalType === 'systemTemp') {
    color = '\uD83D\uDD25';
    const curTemp = reqData.temp != null ? reqData.temp : 'Unknown';
    const thresh = reqData.threshold != null ? reqData.threshold : (c.systemTempThreshold || 90);
    const duration = reqData.durationMinutes || 10;
    msg = `<b>System Temperature Alert</b>\n\nCPU Temperature exceeded <b>${thresh}°C</b> for over ${duration} minutes.\n\nCurrent Temp: <b>${curTemp}°C</b>\nConfigured Threshold: <b>${thresh}°C</b>\nStatus: <b>CRITICAL THERMAL LOAD</b>`;
  }
  else if (canonicalType === 'systemCpu') {
    color = '\u26A0\uFE0F';
    const curUsage = reqData.usage != null ? reqData.usage : 'Unknown';
    const duration = reqData.durationMinutes || 10;
    msg = `<b>High CPU Usage Alert</b>\n\nCPU Usage has been sustained above 85% for over ${duration} minutes.\n\nCurrent Usage: <b>${curUsage}%</b>\nThreshold: <b>85%</b>\nStatus: <b>HIGH SYSTEM LOAD</b>`;
  }
  else { return; }

  const text = `${color} ${msg}`;
  const poster = reqData.poster && reqData.poster.startsWith('http') ? reqData.poster : null;

  try {
    let res;
    if (poster) {
      const url = `https://api.telegram.org/bot${c.botToken}/sendPhoto`;
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: c.chatId,
          photo: poster,
          caption: text,
          parse_mode: 'HTML',
          disable_notification: !!c.sendSilently
        })
      });
    } else {
      const url = `https://api.telegram.org/bot${c.botToken}/sendMessage`;
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: c.chatId,
          text: text,
          parse_mode: 'HTML',
          disable_notification: !!c.sendSilently
        })
      });
    }
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      console.error(`[telegram] API error HTTP ${res.status}: ${errJson.description || res.statusText}`);
    }
  } catch (err) {
    console.error('[telegram] notify error:', err.message);
  }
}

export async function test(alertType = null) {
  const c = load().telegram;
  if (!c || !c.botToken || !c.chatId) throw new Error('Telegram bot token or chat ID is missing.');
  
  const canonicalType = alertType ? (TYPE_MAP[alertType] || alertType) : null;
  let text = '';

  if (canonicalType === 'systemTemp') {
    let curTemp = 55.0;
    try {
      const sys = await import('./system.js');
      const metrics = (sys.default?.getSystemMetrics || sys.getSystemMetrics)();
      if (metrics.cpu?.temperature) curTemp = metrics.cpu.temperature;
    } catch {}
    const thresh = c.systemTempThreshold || 90;
    text = `\uD83D\uDD25 <b>System Temperature Alert [TEST]</b>\n\nCPU Temperature threshold notification test.\n\nCurrent Temp: <b>${curTemp}°C</b>\nThreshold: <b>${thresh}°C</b>\nDuration: <b>>10 minutes (Simulated)</b>\n\n<i>\u2705 Telegram connectivity and alert dispatch verified successfully.</i>`;
  } else if (canonicalType === 'systemCpu') {
    let curUsage = 15;
    try {
      const sys = await import('./system.js');
      const metrics = (sys.default?.getSystemMetrics || sys.getSystemMetrics)();
      if (metrics.cpu?.usagePercent) curUsage = metrics.cpu.usagePercent;
    } catch {}
    text = `\u26A0\uFE0F <b>High CPU Usage Alert [TEST]</b>\n\nCPU Usage threshold notification test.\n\nCurrent Usage: <b>${curUsage}%</b>\nThreshold: <b>>85%</b>\nDuration: <b>>10 minutes (Simulated)</b>\n\n<i>\u2705 Telegram connectivity and alert dispatch verified successfully.</i>`;
  } else {
    text = `\uD83D\uDD14 <b>NickSeer Test Notification</b>\nThis is a test message to verify Telegram is working correctly!`;
  }

  const url = `https://api.telegram.org/bot${c.botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: c.chatId,
      text: text,
      parse_mode: 'HTML',
      disable_notification: !!c.sendSilently
    })
  });
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Telegram API Error: ${err.description || res.statusText}`);
  }
  
  return { success: true, message: canonicalType ? `Test ${canonicalType} notification sent successfully` : 'Test notification sent' };
}
