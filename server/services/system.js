// system.js — Live Host & Hardware Telemetry Service for NickSeer
// Gathers Host Model, CPU Usage %, Thermal Temperature (Live + Max Peak), RAM usage, and Disks.
import os from 'os';
import fs from 'fs';
import path from 'path';
import child_process from 'child_process';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function getDeviceInfo() {
  let model = null;
  let osName = null;

  try {
    if (fs.existsSync('/proc/sys/kernel/syno_hw_version')) {
      model = fs.readFileSync('/proc/sys/kernel/syno_hw_version', 'utf8').trim();
    }
  } catch {}

  if (!model) {
    try {
      if (fs.existsSync('/etc/synoinfo.conf')) {
        const conf = fs.readFileSync('/etc/synoinfo.conf', 'utf8');
        const m = conf.match(/upnpmodelname="([^"]+)"/i) || conf.match(/model="([^"]+)"/i);
        if (m) model = m[1];
      }
    } catch {}
  }

  try {
    if (fs.existsSync('/etc/os-release')) {
      const raw = fs.readFileSync('/etc/os-release', 'utf8');
      const pretty = raw.match(/PRETTY_NAME="([^"]+)"/i) || raw.match(/NAME="([^"]+)"/i);
      if (pretty) osName = pretty[1];
    }
  } catch {}

  if (!osName) {
    if (model) osName = 'Synology DSM / Linux';
    else osName = `${os.type()} ${os.release()}`;
  }

  return {
    hostname: os.hostname(),
    model: model || os.hostname(),
    osName,
    platform: os.platform(),
    type: os.type(),
    kernel: os.release(),
    arch: os.arch(),
    uptime: os.uptime(),
    uptimeText: formatUptime(os.uptime())
  };
}

let prevCpuTimes = null;
let maxRecordedTemp = 0;
let simulatedThermalState = 41.5;

function getCpuInfo() {
  const cpus = os.cpus() || [];
  const model = cpus[0]?.model ? cpus[0].model.trim().replace(/\s+/g, ' ') : 'Multi-Core Processor';
  const cores = cpus.length;

  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
  for (const c of cpus) {
    user += c.times.user;
    nice += c.times.nice;
    sys += c.times.sys;
    idle += c.times.idle;
    irq += c.times.irq;
  }
  const total = user + nice + sys + idle + irq;
  let usagePercent = 0;

  if (prevCpuTimes && total > prevCpuTimes.total) {
    const totalDelta = total - prevCpuTimes.total;
    const idleDelta = idle - prevCpuTimes.idle;
    usagePercent = Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 1000) / 10));
  } else {
    const load1 = os.loadavg()[0] || 0;
    usagePercent = Math.min(100, Math.round((load1 / (cores || 1)) * 1000) / 10);
  }
  prevCpuTimes = { total, idle };

  const tempObj = getCpuTemperature(usagePercent);
  const temperature = tempObj.value;
  const tempSource = tempObj.source;
  if (!maxRecordedTemp || temperature > maxRecordedTemp) {
    maxRecordedTemp = temperature;
  }

  const loadAvg = (os.loadavg() || [0, 0, 0]).map(l => Math.round(l * 100) / 100);

  return {
    model,
    cores,
    usagePercent,
    temperature,
    maxTemperature: maxRecordedTemp,
    tempUnit: '°C',
    tempSource,
    loadAvg
  };
}

function getCpuTemperature(usageHint = 5) {
  let temps = [];

  const addTemp = (val, src, name = 'unknown') => {
    if (!isNaN(val) && val > 20 && val < 110 && val !== 27.8) {
      temps.push({ val, src, name });
    }
  };

  try {
    const hwmonDir = '/sys/class/hwmon';
    if (fs.existsSync(hwmonDir)) {
      const hwmons = fs.readdirSync(hwmonDir);
      for (const h of hwmons) {
        const dir = path.join(hwmonDir, h);
        let name = 'unknown';
        try { name = fs.readFileSync(path.join(dir, 'name'), 'utf8').trim(); } catch {}
        
        const inputs = fs.readdirSync(dir).filter(f => f.startsWith('temp') && f.endsWith('_input'));
        for (const inp of inputs) {
          const raw = parseFloat(fs.readFileSync(path.join(dir, inp), 'utf8').trim());
          const c = raw > 1000 ? Math.round((raw / 1000) * 10) / 10 : Math.round(raw * 10) / 10;
          addTemp(c, 'sysfs_hwmon', name);
        }
      }
    }
  } catch {}

  try {
    const thermalDir = '/sys/class/thermal';
    if (fs.existsSync(thermalDir)) {
      const zones = fs.readdirSync(thermalDir).filter(f => f.startsWith('thermal_zone'));
      for (const z of zones) {
        const p = path.join(thermalDir, z, 'temp');
        if (fs.existsSync(p)) {
          let type = 'unknown';
          try { type = fs.readFileSync(path.join(thermalDir, z, 'type'), 'utf8').trim(); } catch {}
          const raw = parseFloat(fs.readFileSync(p, 'utf8').trim());
          const c = raw > 1000 ? Math.round((raw / 1000) * 10) / 10 : Math.round(raw * 10) / 10;
          addTemp(c, 'sysfs_thermal', type);
        }
      }
    }
  } catch {}

  try {
    if (fs.existsSync('/run/synoinfo/temperature')) {
      const raw = parseFloat(fs.readFileSync('/run/synoinfo/temperature', 'utf8').trim());
      addTemp(raw, 'synology_run', 'synoinfo');
    }
  } catch {}

  if (temps.length === 0) {
    return { value: Math.round((35 + (usageHint * 0.45)) * 10) / 10, source: 'simulated' };
  }

  // Filter out clearly fake dummy sensors (often exactly 114.0, 115.0, or 127.0)
  temps = temps.filter(t => t.val < 105);

  // 1. If we have explicit 'coretemp' (Intel) or 'k10temp' (AMD), ONLY use those.
  const cpuSensors = temps.filter(t => t.name === 'coretemp' || t.name === 'k10temp' || t.name.includes('cpu') || t.name.includes('x86_pkg_temp'));
  const validTemps = cpuSensors.length > 0 ? cpuSensors : temps;

  // Now just take the maximum of the valid pool (to find the hottest core)
  let maxTemp = -1;
  let bestSource = 'none';
  for (const t of validTemps) {
    if (t.val > maxTemp) {
      maxTemp = t.val;
      bestSource = t.src;
    }
  }

  return { value: maxTemp > 0 ? maxTemp : 45.0, source: bestSource };
}

function getMemoryInfo() {
  let total = os.totalmem();
  let free = os.freemem();
  let available = free;

  try {
    const meminfoPath = fs.existsSync('/host/proc/meminfo') ? '/host/proc/meminfo' : '/proc/meminfo';
    if (fs.existsSync(meminfoPath)) {
      const raw = fs.readFileSync(meminfoPath, 'utf8');
      const getKb = (k) => {
        const m = raw.match(new RegExp(k + ':\\s+(\\d+)\\s+kB', 'i'));
        return m ? parseInt(m[1], 10) * 1024 : null;
      };
      const mt = getKb('MemTotal');
      const ma = getKb('MemAvailable');
      const mf = getKb('MemFree');
      const buf = getKb('Buffers') || 0;
      const cch = getKb('Cached') || 0;
      if (mt) total = mt;
      if (ma) available = ma;
      else if (mf) available = mf + buf + cch;
    }
  } catch {}

  const used = Math.max(0, total - available);
  const usedPercent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0;

  return {
    total,
    used,
    available,
    free,
    usedPercent,
    totalText: formatBytes(total),
    usedText: formatBytes(used),
    availableText: formatBytes(available)
  };
}

function getDiskInfo() {
  const disks = [];
  const seenMounts = new Set();

  try {
    const out = child_process.execSync('df -kP', { timeout: 1500, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    const lines = out.split('\n').filter(l => l.trim());
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/);
      if (parts.length >= 6) {
        const [fsName, totalK, usedK, availK, , mount] = parts;
        if (mount === '/config' || mount === '/' || mount.startsWith('/volume') || mount.startsWith('/mnt') || mount.startsWith('/media')) {
          if (seenMounts.has(mount)) continue;
          seenMounts.add(mount);
          const total = parseInt(totalK, 10) * 1024;
          const used = parseInt(usedK, 10) * 1024;
          const avail = parseInt(availK, 10) * 1024;
          if (!isNaN(total) && total > 0) {
            disks.push({
              mount: mount === '/config' ? '/config (Storage Pool)' : mount,
              filesystem: fsName,
              total,
              used,
              available: avail,
              usedPercent: Math.round((used / total) * 100),
              totalText: formatBytes(total),
              usedText: formatBytes(used),
              availableText: formatBytes(avail)
            });
          }
        }
      }
    }
  } catch {}

  if (!disks.length) {
    const paths = ['/config', '/'];
    for (const p of paths) {
      try {
        if (fs.existsSync(p) && fs.statfsSync) {
          const s = fs.statfsSync(p);
          const total = s.bsize * s.blocks;
          const avail = s.bsize * s.bavail;
          const used = total - avail;
          disks.push({
            mount: p === '/config' ? '/config (Storage Pool)' : p,
            filesystem: p,
            total,
            used,
            available: avail,
            usedPercent: total > 0 ? Math.round((used / total) * 100) : 0,
            totalText: formatBytes(total),
            usedText: formatBytes(used),
            availableText: formatBytes(avail)
          });
        }
      } catch {}
    }
  }

  return disks;
}

export function getSystemMetrics() {
  const memUsage = process.memoryUsage();
  return {
    device: getDeviceInfo(),
    cpu: getCpuInfo(),
    ram: getMemoryInfo(),
    disks: getDiskInfo(),
    process: {
      version: process.version,
      uptime: Math.round(process.uptime()),
      uptimeText: formatUptime(process.uptime()),
      memory: {
        rss: formatBytes(memUsage.rss),
        heapTotal: formatBytes(memUsage.heapTotal),
        heapUsed: formatBytes(memUsage.heapUsed)
      },
      pid: process.pid
    },
    timestamp: new Date().toISOString()
  };
}

export default { getSystemMetrics };


