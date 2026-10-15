(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const header = document.querySelector('header');
  if (!header || document.getElementById('h3UpdatesButton')) return;
  const button = document.createElement('button');
  button.id = 'h3UpdatesButton'; button.type = 'button'; button.className = 'button alt small h3-updates-trigger';
  button.textContent = 'Updates'; button.setAttribute('aria-haspopup', 'dialog');
  header.append(button);
  const dialog = document.createElement('dialog');
  dialog.id = 'h3UpdatesDialog'; dialog.className = 'dialog h3-updates-dialog';
  dialog.setAttribute('aria-labelledby', 'h3UpdatesTitle');
  dialog.style.cssText = 'max-width:560px;width:calc(100% - 32px);padding:24px;color:var(--text,#eee);background:var(--panel,#15171d);border:1px solid #51545c;border-radius:16px';
  dialog.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><h2 id="h3UpdatesTitle">Studio updates</h2><button type="button" data-close class="button alt small">Close</button></div><p data-copy></p><p data-status role="status" aria-live="polite"></p><div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" data-check class="button alt">Check for updates</button><button type="button" data-apply class="button" hidden>Install update</button></div>';
  document.body.append(dialog);
  const status = dialog.querySelector('[data-status]'), check = dialog.querySelector('[data-check]'), apply = dialog.querySelector('[data-apply]');
  let target = null, pending = false, last = null, timer = null;
  const arabic = () => window.H3Guidance?.getLanguage() === 'ar';
  function translate() {
    const ar = arabic();
    dialog.querySelector('[data-copy]').textContent = ar ? 'التحديث يحافظ على مشاريعك وملفاتك ولا يبدأ أي توليد. يجب إنهاء جميع المهام أولاً. بعد تثبيت الكود، أعد تشغيل ComfyUI يدوياً ثم أعد تحميل الصفحة.' : 'Updates preserve projects and media and never start a generation. Finish every operation first. After code installation, restart ComfyUI manually, then reload this page.';
    if (last) render(last);
  }
  function endpoint(path) {
    if (typeof api === 'function') return api('/h3_studio/updates/' + path);
    return '/h3_studio/updates/' + path;
  }
  async function request(path, options = {}) {
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(endpoint(path), {...options, signal: controller.signal, credentials: 'same-origin', cache: 'no-store'});
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || data.error || 'Update service unavailable.');
      return data;
    } finally { clearTimeout(timeout); }
  }
  function render(data) {
    last = data; const ar = arabic();
    const texts = {
      idle: ar ? 'اضغط للتحقق من آخر تحديث رسمي.' : 'Check for the latest official update.',
      current: ar ? 'أنت تستخدم أحدث إصدار رسمي.' : 'You are running the latest official revision.',
      available: ar ? 'يوجد تحديث رسمي جديد. التثبيت يتطلب إعادة تشغيل يدوية.' : 'An official update is available. Installation requires a manual restart.',
      running: ar ? 'جارٍ تثبيت الكود. التوليد متوقف مؤقتاً لحماية أعمالك.' : 'Installing code. Generation is paused to protect your work.',
      restart_required: ar ? 'تم تثبيت الكود. أعد تشغيل ComfyUI يدوياً ثم أعد تحميل الصفحة. لم يُجرَ اختبار GPU.' : 'Code installed. Restart ComfyUI manually, then reload this page. No GPU test was run.',
      completed: ar ? 'اكتمل التحديث وإعادة التشغيل.' : 'Update and restart completed.',
      recovery_required: ar ? 'التحديث يحتاج إلى استرداد من المسؤول عبر المشغّل الرسمي. التوليد متوقف لحماية أعمالك.' : 'Administrator recovery is required using the official launcher. Generation remains paused to protect your work.'
    };
    status.textContent = texts[data.state] || data.message || data.error || 'Update service unavailable.';
    if (data.state === 'available' && data.target) status.textContent += ' (' + data.target.slice(0, 12) + ')';
    target = data.state === 'available' && data.can_install !== false ? data.target : null;
    apply.hidden = !target; apply.disabled = pending;
    check.disabled = pending || ['running', 'restart_required', 'recovery_required'].includes(data.state);
    button.textContent = data.state === 'available' ? 'Updates · new' : data.state === 'restart_required' ? 'Restart required' : 'Updates';
    if (data.state === 'running' && !timer) timer = setTimeout(async () => { timer = null; await poll(); }, 2000);
  }
  async function poll() { try { render(await request('status')); } catch (error) { status.textContent = error.message; } }
  button.addEventListener('click', () => { dialog.showModal(); translate(); poll(); });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  check.addEventListener('click', async () => { pending = true; check.disabled = true; status.textContent = arabic() ? 'جارٍ التحقق…' : 'Checking official repository…'; try { render(await request('check')); } catch (error) { status.textContent = error.message; } finally { pending = false; check.disabled = false; apply.disabled = false; } });
  apply.addEventListener('click', async () => {
    if (!target || pending) return;
    const commit = target; pending = true; apply.disabled = true; check.disabled = true;
    try { render(await request('apply', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({commit})})); }
    catch (error) { status.textContent = error.message; }
    finally { pending = false; apply.disabled = false; check.disabled = ['running', 'restart_required', 'recovery_required'].includes(last?.state); }
  });
  window.addEventListener('h3guidancechange', translate);
  async function detect() {
    try {
      const data = await request('status'); render(data);
      if (['idle', 'completed'].includes(data.state)) render(await request('check'));
    } catch (error) { status.textContent = error.message; }
  }
  translate(); detect();
  setInterval(() => { if (!pending && !['running', 'restart_required', 'recovery_required'].includes(last?.state)) detect(); }, 30 * 60 * 1000);
})();
