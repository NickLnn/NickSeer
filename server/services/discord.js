import { load } from '../config.js';
import arr from './arr.js';

const DISCORD_SNOWFLAKE_REGEX = /^[0-9]{17,19}$/;
const isValidSnowflake = (id) => DISCORD_SNOWFLAKE_REGEX.test(id);

const EmbedColors = {
  DARK_PURPLE: 0x2b2b35,
  GREEN: 0x43a047,
  ORANGE: 0xff9800,
  PURPLE: 0x6a1b9a,
  RED: 0xe53935
};

export async function notify(type, reqData) {
  const cfg = load();
  const c = cfg.discord;
  if (!c || !c.enabled || !c.webhookUrl) return;
  if (c.types && c.types[type] === false) return;

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
    seasonStr = reqData.seasons.join(', ');
  }
  
  let color = EmbedColors.DARK_PURPLE;
  let eventName = '';
  let statusStr = '';
  
  const canonicalType = {
    SystemTemperatureAlert: 'systemTemp',
    systemTemp: 'systemTemp',
    HighCpuUsageAlert: 'systemCpu',
    systemCpu: 'systemCpu',
    Pending: 'pending',
    AutoApproved: 'autoApproved',
    Approved: 'approved',
    Declined: 'declined',
    Available: 'available',
    Failed: 'failed',
    Issue: 'issue'
  }[type] || type;

  if (canonicalType === 'pending') { color = EmbedColors.ORANGE; eventName = 'New Request Pending Approval'; statusStr = 'Pending Approval'; }
  else if (canonicalType === 'autoApproved') { color = EmbedColors.PURPLE; eventName = 'Request Automatically Approved'; statusStr = 'Processing'; }
  else if (canonicalType === 'approved') { color = EmbedColors.PURPLE; eventName = 'Request Approved'; statusStr = 'Processing'; }
  else if (canonicalType === 'declined') { color = EmbedColors.RED; eventName = 'Request Declined'; statusStr = 'Declined'; }
  else if (canonicalType === 'available') { color = EmbedColors.GREEN; eventName = 'Request Available'; statusStr = 'Available'; }
  else if (canonicalType === 'issue') { color = EmbedColors.ORANGE; eventName = 'Media Issue Reported'; statusStr = 'Open Issue'; }
  else if (canonicalType === 'failed') { color = EmbedColors.RED; eventName = 'Request Processing Failed'; statusStr = 'Failed'; }
  else if (canonicalType === 'systemTemp') {
    color = EmbedColors.RED;
    eventName = '🔥 System Temperature Alert';
    statusStr = 'Critical Thermal Load';
  }
  else if (canonicalType === 'systemCpu') {
    color = EmbedColors.ORANGE;
    eventName = '⚠️ High CPU Usage Alert';
    statusStr = 'High System Load';
  }
  else { return; }

  const fields = [
    { name: 'Requested By', value: by, inline: true },
    { name: 'Request Status', value: statusStr, inline: true }
  ];

  if (['pending', 'autoApproved', 'approved', 'declined', 'available', 'failed'].includes(type)) {
    if (seasonStr) fields.push({ name: 'Seasons', value: seasonStr, inline: true });
    fields.push({ name: 'Profile', value: pName, inline: true });
    fields.push({ name: 'Root Folder', value: rootFolder, inline: true });
  }
  if (type === 'issue') {
    fields.push({ name: 'Issue Type', value: reqData.issueType || 'Other', inline: true });
    fields.push({ name: 'Message', value: reqData.message || 'No description provided.', inline: false });
  }

  const embed = {
    title: `${eventName}: ${title} (${mediaStr})`,
    color: color,
    timestamp: new Date().toISOString(),
    fields: fields
  };

  if (c.embedPoster !== false && reqData.poster && reqData.poster.startsWith('http')) {
    embed.thumbnail = { url: reqData.poster };
  }

  let content = '';
  if (c.enableMentions && c.roleId && isValidSnowflake(c.roleId)) {
    content = `<@&${c.roleId}>`;
  }

  const payload = {
    username: c.botUsername || 'NickSeer',
    embeds: [embed],
    content: content,
    allowed_mentions: {
      roles: c.roleId ? [c.roleId] : []
    }
  };

  if (c.botAvatarUrl) {
    payload.avatar_url = c.botAvatarUrl;
  }

  try {
    const url = new URL(c.webhookUrl);
    if (c.threadId) {
      url.searchParams.set('thread_id', c.threadId);
    }
    await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error('[discord] notify error:', err.message);
  }
}

export async function test() {
  const c = load().discord;
  if (!c || !c.webhookUrl) throw new Error('Discord Webhook URL is missing.');
  
  const embed = {
    title: 'Test Notification',
    description: 'This is a test notification from NickSeer to verify Discord webhooks are working correctly!',
    color: EmbedColors.GREEN,
    timestamp: new Date().toISOString()
  };

  const payload = {
    username: c.botUsername || 'NickSeer',
    embeds: [embed]
  };
  
  if (c.botAvatarUrl) {
    payload.avatar_url = c.botAvatarUrl;
  }

  try {
    const url = new URL(c.webhookUrl);
    if (c.threadId) {
      url.searchParams.set('thread_id', c.threadId);
    }
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Discord HTTP ${res.status}: ${errText}`);
    }
  } catch (err) {
    throw new Error(`Discord Webhook Error: ${err.message}`);
  }
  
  return { success: true };
}
