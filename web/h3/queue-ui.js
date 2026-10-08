(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.H3QueueUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function summarizeQueue(queue, ownId) {
    const normalize = (items, phase) => (Array.isArray(items) ? items : []).filter(item =>
      Array.isArray(item) && typeof item[1] === 'string' && item[1].length > 0
    ).map((item, index) => {
      const own = typeof ownId === 'string' && !!ownId && item[1] === ownId;
      const metadata = item[3] && typeof item[3] === 'object' ? item[3] : {};
      return { own, phase, position: phase === 'pending' ? index + 1 : null,
        label: own ? 'Your generation' : metadata.h3_lab_job_id || metadata.h3_lab_request_id ? 'H3 Studio · other project' : 'Other project' };
    });
    const running = normalize(queue?.queue_running, 'running');
    const pending = normalize(queue?.queue_pending, 'pending');
    const current = running.find(item => item.own) || pending.find(item => item.own);
    return { running, pending, total: running.length + pending.length,
      ownStatus: current?.phase || (ownId ? 'checking' : 'none'), ownPosition: current?.position ?? null,
      canCancelOwn: !!current, foreignCount: [...running, ...pending].filter(item => !item.own).length };
  }
  function render(queue, ownId, options = {}) {
    const container = document.getElementById('queueInfo');
    const summary = summarizeQueue(queue, ownId);
    if (!container) return summary;
    container.replaceChildren();
    const header = document.createElement('div'); header.className = 'queue-summary';
    const title = document.createElement('strong'); title.textContent = 'Server queue';
    const count = document.createElement('span'); count.textContent = summary.running.length + ' running · ' + summary.pending.length + ' waiting';
    header.append(title, count); container.append(header);
    const note = document.createElement('div'); note.className = 'queue-own-status';
    note.textContent = options.waitingPreparation ? 'Your prompt preparation is waiting for the server to become idle. No generation has been queued.'
      : summary.ownStatus === 'running' ? 'Your generation is rendering. Cancel affects only this generation.'
      : summary.ownStatus === 'pending' ? 'Your generation is position ' + summary.ownPosition + ' of ' + summary.pending.length + ' waiting. Cancel removes only your generation.'
      : summary.ownStatus === 'checking' ? 'Checking the saved submission and its history. Your inputs are retained.'
      : summary.total ? 'Other projects are using this server. Their jobs remain under their owners’ control.' : 'The server is idle.';
    container.append(note);
    const items = [...summary.running, ...summary.pending];
    if (items.length) {
      const list = document.createElement('ul'); list.className = 'queue-jobs';
      for (const item of items.slice(0, 6)) {
        const card = document.createElement('li'); card.className = 'queue-job' + (item.own ? ' own' : '');
        const label = document.createElement('span'); label.textContent = item.label;
        const phase = document.createElement('small'); phase.textContent = item.phase === 'running' ? 'Rendering' : 'Waiting · ' + item.position;
        card.append(label, phase); list.append(card);
      }
      container.append(list);
      if (items.length > 6) { const more = document.createElement('small'); more.textContent = '+ ' + (items.length - 6) + ' more jobs on this server'; container.append(more); }
    }
    // Ownership never authorizes a global interrupt; the existing Cancel flow is authoritative.
    return summary;
  }
  return { summarizeQueue, render };
});
