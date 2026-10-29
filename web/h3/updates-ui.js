(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const header = document.querySelector('header');
  if (!header || document.getElementById('h3UpdatesButton')) return;
  const icon = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4"/></svg>';
  const tools = document.createElement('div');
  tools.className = 'h3-header-tools';
  const nodes = document.createElement('a');
  nodes.id = 'h3ComfyUIButton'; nodes.className = 'button alt small h3-comfy-link';
  nodes.textContent = 'ComfyUI'; nodes.target = '_blank'; nodes.rel = 'noopener noreferrer';
  nodes.setAttribute('aria-label', 'Open ComfyUI node editor in a new tab');
  const button = document.createElement('button');
  button.id = 'h3UpdatesButton'; button.type = 'button'; button.className = 'button alt small h3-updates-trigger';
  button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-controls', 'h3UpdatesDialog');
  button.innerHTML = icon + '<span data-update-label>Updates</span><span class="h3-update-badge" data-update-badge aria-hidden="true" hidden>1</span>';
  tools.append(nodes, button); header.append(tools);
  const dialog = document.createElement('dialog');
  dialog.id = 'h3UpdatesDialog'; dialog.className = 'h3-updates-dialog';
  dialog.setAttribute('aria-labelledby', 'h3UpdatesTitle');
  dialog.innerHTML = '<div class="h3-updates-heading"><div class="h3-updates-mark">' + icon + '</div><h2 id="h3UpdatesTitle">Studio updates</h2><button type="button" data-close class="button alt small">Close</button></div><div class="h3-update-summary"><span class="h3-update-state" data-state-label></span><p data-status role="status" aria-live="polite"></p><dl class="h3-update-revisions" hidden><div><dt data-current-label>Installed revision</dt><dd data-current></dd></div><div data-target-row hidden><dt data-target-label>Available revision</dt><dd data-target></dd></div></dl></div><p class="h3-update-copy" data-copy></p><p class="h3-update-error" data-error role="alert" hidden></p><div class="h3-update-actions"><button type="button" data-check class="button alt">Check for updates</button><button type="button" data-apply class="button" hidden>Install update</button></div>';
  document.body.append(dialog);
  const find = selector => dialog.querySelector(selector);
  const status = find('[data-status]'), check = find('[data-check]'), apply = find('[data-apply]');
  const badge = button.querySelector('[data-update-badge]'), errorBox = find('[data-error]');
  const notice = document.createElement('span'); notice.className = 'h3-update-announcement';
  notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite'); tools.append(notice);
  let target = null, pending = false, last = null, timer = null, detection = null, lastCheck = 0;
  const blocked = () => ['running', 'restart_required', 'recovery_required'].includes(last?.state);
  const arabic = () => window.H3Guidance?.getLanguage() === 'ar';
  function serverPath(path) {
    const prefix = location.pathname.includes('/extensions/') ? location.pathname.split('/extensions/')[0] : '';
    const resolved = typeof api === 'function' ? api(path) : path;
    // Video's default api helper returns root-relative paths. Keep provider
    // routing when no explicit server has overridden that default.
    return prefix && resolved === path ? prefix + path : resolved;
  }
  function endpoint(path) { return serverPath('/h3_studio/updates/' + path); }
  function nodesURL() {
    const url = new URL(serverPath('/'), location.href);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported server address.');
    url.search = '?view=nodes'; url.hash = ''; return url.href;
  }
  function refreshNodesURL() { try { nodes.href = nodesURL(); } catch { nodes.removeAttribute('href'); } }
  refreshNodesURL(); nodes.addEventListener('click', refreshNodesURL); nodes.addEventListener('focus', refreshNodesURL);
  function controls() {
    check.disabled = pending || blocked(); apply.hidden = !target; apply.disabled = pending || blocked();
    dialog.setAttribute('aria-busy', String(pending || last?.state === 'running'));
  }
  function showError(error) {
    errorBox.textContent = error.message; errorBox.hidden = false;
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
  function translate() {
    const ar = arabic();
    find('[data-copy]').textContent = ar ? 'التحديث يحافظ على مشاريعك وملفاتك ولا يبدأ أي توليد. أنهِ المهام أولاً، ثم ثبّت التحديث وأعد تشغيل ComfyUI يدوياً وأعد تحميل الصفحة.' : 'Updates preserve projects and media and never start a generation. Finish your tasks, install the update, then restart ComfyUI manually and reload Studio.';
    find('[data-copy]').dir = ar ? 'rtl' : 'ltr';
    find('[data-current-label]').textContent = ar ? 'المراجعة المثبتة' : 'Installed revision';
    find('[data-target-label]').textContent = ar ? 'المراجعة المتاحة' : 'Available revision';
    if (last) render(last);
  }
  function render(data) {
    const previousTarget = last?.state === 'available' ? last.target : null;
    last = data; const ar = arabic();
    const texts = {
      idle: ['Ready to check', 'Check for the latest official update.', 'جاهز للتحقق', 'تحقق من آخر تحديث رسمي.'],
      current: ['Studio code up to date', 'Installed Studio code matches the latest official revision. Model and LoRA installation is checked separately.', 'كود الواجهة محدّث', 'كود الواجهة المثبت يطابق أحدث مراجعة رسمية. تثبيت الموديلات واللورات يُفحص بشكل مستقل.'],
      checking: ['Checking installation', 'Checking the official revision and installed files…', 'جارٍ فحص التثبيت', 'جارٍ فحص المراجعة الرسمية والملفات المثبتة…'],
      repair_required: ['Installation needs attention', 'Installed files or the running worker differ from the official source. Preserve local changes, repair with the launcher, then restart when idle.', 'التثبيت يحتاج مراجعة', 'الملفات المثبتة أو العامل الحالي لا تطابق المصدر الرسمي. احتفظ بالتعديلات المحلية وأصلح التثبيت بالمشغّل ثم أعد التشغيل عند خلو الطابور.'],
      available: ['Update available', 'A new Studio update is ready to install.', 'تحديث متاح', 'يوجد تحديث جديد للواجهة جاهز للتثبيت.'],
      running: ['Installing update', 'Installing code. Generation is paused to protect your work.', 'جارٍ التثبيت', 'جارٍ تثبيت الكود. التوليد متوقف مؤقتاً لحماية أعمالك.'],
      restart_required: ['Restart required', 'Code installed. Restart ComfyUI manually, then reload Studio.', 'إعادة التشغيل مطلوبة', 'تم تثبيت الكود. أعد تشغيل ComfyUI يدوياً ثم أعد تحميل الواجهة.'],
      completed: ['Update completed', 'Update and restart completed.', 'اكتمل التحديث', 'اكتمل التحديث وإعادة التشغيل.'],
      recovery_required: ['Recovery required', 'Ask the administrator to recover the update using the official launcher. Generation remains paused.', 'الاسترداد مطلوب', 'اطلب من المسؤول استرداد التحديث بالمشغّل الرسمي. التوليد متوقف مؤقتاً.'],
      unavailable: ['Update check unavailable', 'Automatic updates are unavailable for this installation. Use the official launcher to update.', 'التحقق غير متاح', 'التحديث التلقائي غير متاح لهذا التثبيت. استخدم المشغّل الرسمي للتحديث.']
    };
    const text = texts[data.state] || texts.unavailable;
    find('[data-state-label]').textContent = text[ar ? 2 : 0];
    status.textContent = texts[data.state] ? text[ar ? 3 : 1] : data.message || text[ar ? 3 : 1];
    status.dir = ar ? 'rtl' : 'ltr'; dialog.dataset.state = data.state || 'unavailable';
    target = data.state === 'available' && data.can_install !== false ? data.target : null;
    const available = data.state === 'available' && Boolean(data.target);
    badge.hidden = !available; button.dataset.state = data.state || 'unavailable';
    button.setAttribute('aria-label', available ? 'Updates: 1 update available' : data.state === 'restart_required' ? 'Updates: restart required' : 'Updates');
    button.title = available ? 'A Studio update is available' : 'Check Studio updates';
    if (available && previousTarget !== data.target) notice.textContent = ar ? 'يوجد تحديث جديد للواجهة.' : 'A new Studio update is available.';
    if (!available) notice.textContent = '';
    const revisions = find('.h3-update-revisions');
    revisions.hidden = !data.current;
    find('[data-current]').textContent = data.current?.slice(0, 12) || '';
    find('[data-target-row]').hidden = !available;
    find('[data-target]').textContent = available ? data.target.slice(0, 12) : '';
    controls();
    if (data.state !== 'running' && timer) { clearTimeout(timer); timer = null; }
    if (data.state === 'running' && !timer) timer = setTimeout(async () => { timer = null; await poll(); }, 2000);
  }
  async function poll() {
    try { render(await request('status')); errorBox.hidden = true; }
    catch (error) { showError(error); if (last?.state === 'running' && !timer) timer = setTimeout(() => { timer = null; poll(); }, 5000); }
  }
  function detect() {
    if (detection || pending) return detection;
    detection = (async () => {
      pending = true; controls(); errorBox.hidden = true;
      if (!blocked() && last?.state !== 'available') render({state: 'checking', current: last?.current});
      try {
        const data = await request('status');
        // Status does not persist check results. Resolve the fresh check before
        // rendering so opening the dialog cannot erase an available-update badge.
        render(['idle', 'current', 'completed', 'available'].includes(data.state) ? await request('check') : data);
        lastCheck = Date.now();
      } catch (error) {
        if (last?.state === 'available') render({...last, can_install: false});
        else if (!blocked()) render({state: 'unavailable'});
        target = null; showError(error);
      }
      finally { pending = false; detection = null; controls(); }
    })();
    return detection;
  }
  button.addEventListener('click', () => { if (!dialog.open) dialog.showModal(); translate(); detect(); });
  find('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => button.focus());
  check.addEventListener('click', detect);
  apply.addEventListener('click', async () => {
    if (!target || pending || blocked()) return;
    const commit = target; pending = true; controls(); errorBox.hidden = true;
    try { render(await request('apply', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({commit})})); }
    catch (error) { showError(error); }
    finally { pending = false; controls(); }
  });
  window.addEventListener('h3guidancechange', translate);
  window.addEventListener('focus', () => { refreshNodesURL(); if (Date.now() - lastCheck > 60000 && !blocked()) detect(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastCheck > 60000 && !blocked()) detect(); });
  translate(); render({state: 'idle'}); detect();
  setInterval(() => { if (!document.hidden && !blocked()) detect(); }, 5 * 60 * 1000);
})();
