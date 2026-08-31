import { getSystemMetrics } from './services/system.js';
import fs from 'fs';
const m = getSystemMetrics();
fs.writeFileSync('../public/debug.json', JSON.stringify(m, null, 2));
console.log('done');
