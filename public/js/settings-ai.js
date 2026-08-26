// settings-ai.js — adds a "Test AI connection" button to Settings → AI Brain.
// Saves the current AI fields, then pings your model and shows ✓/✗.
function authHeaders() { const t = localStorage.getItem('nickseer_token'); return t ? { Authorization: 'Bearer ' + t } : {}; }
function collectAi() {
  const body = document.getElementById('settingsBody'); if (!body) return null;
  const ai = {};
  body.querySelectorAll('[data-path^="ai."]').forEach((inp) => { ai[inp.dataset.path.slice(3)] = inp.value; });
  const seg = body.querySelector('[data-seg="ai.provider"] .active'); if (seg) ai.provider = seg.dataset.val;
  return ai;
}
async function runTest(resultEl) {
  resultEl.textContent = 'Testing…'; resultEl.className = 'test-result';
  const ai = collectAi();
  if (!ai) { resultEl.textContent = '✕ form not ready'; resultEl.className = 'test-result bad'; return; }
  if (ai.provider === 'none') { resultEl.textContent = '✕ set a provider first'; resultEl.className = 'test-result bad'; return; }
  try {
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() }, body: JSON.stringify({ ai }) });
    const r = await fetch('/api/health-detail/ai', { headers: authHeaders() }).then((x) => x.json());
    if (r.ok) { resultEl.textContent = `✓ ${r.model || 'model'} replied: "${(r.sample || 'ok').slice(0, 24)}"`; resultEl.className = 'test-result ok'; }
    else { resultEl.textContent = '✕ ' + (r.error || 'no response'); resultEl.className = 'test-result bad'; }
  } catch (e) { resultEl.textContent = '✕ ' + e.message; resultEl.className = 'test-result bad'; }
}
function inject() {
  const overlay = document.getElementById('settings');
  if (!overlay || overlay.classList.contains('hidden')) return;
  const body = document.getElementById('settingsBody'); if (!body) return;
  const seg = body.querySelector('[data-seg="ai.provider"]'); if (!seg) return;
  if (document.getElementById('aiTestLine')) return;
  const line = document.createElement('div');
  line.id = 'aiTestLine'; line.className = 'test-line'; line.style.marginTop = '10px';
  line.innerHTML = `<button class="test-btn" type="button" id="aiTestBtn">Test AI connection</button><span class="test-result" id="aiTestResult"></span>`;
  body.appendChild(line);
  line.querySelector('#aiTestBtn').addEventListener('click', () => runTest(line.querySelector('#aiTestResult')));
}
const obs = new MutationObserver(() => inject());
obs.observe(document.body, { childList: true, subtree: true });
setTimeout(inject, 500);
