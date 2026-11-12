// Web Push subscription endpoints. Mounted at /api/push, behind the normal
// auth gate, so req.user is the signed-in account (or undefined when login is
// switched off, in which case the device is stored without an owner).
import express from '../mini.js';
import push from '../services/push.js';
import { allow } from '../lib/ratelimit.js';

const router = express.Router();

router.get('/key', (req, res) => {
  try { res.json({ ok: true, publicKey: push.publicKey(), devices: push.countFor(req.user) }); }
  catch (e) { res.status(200).json({ ok: false, error: e.message }); }
});

router.post('/subscribe', (req, res) => {
  try { res.json(push.subscribe(req.user, (req.body || {}).subscription)); }
  catch (e) { res.status(400).json({ ok: false, error: e.message }); }
});

router.post('/unsubscribe', (req, res) => {
  try { res.json(push.unsubscribe(req.user, String((req.body || {}).endpoint || ''))); }
  catch (e) { res.status(200).json({ ok: false, error: e.message }); }
});

// Sends a test notification to the caller's own devices only.
router.post('/test', async (req, res) => {
  const who = req.user?.username || '';
  if (!allow('push-test:' + (who || req.ip), 5, 60000)) return res.status(429).json({ ok: false, error: 'Too many test notifications — wait a minute.' });
  try {
    const r = await push.sendTo([who], { title: 'NickSeer', body: 'Notifications are working on this device.', tag: 'test', url: '/' });
    res.json({ ok: r.sent > 0, ...r, error: r.sent > 0 ? undefined : (r.targets ? 'The push service rejected the message.' : 'No device is subscribed for this account.') });
  } catch (e) { res.status(200).json({ ok: false, error: e.message }); }
});

export default router;
