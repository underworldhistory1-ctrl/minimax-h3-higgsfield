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
  function progressSummary(progress) {
    if ((!progress?.phase || progress.phase === 'sampling') && Number.isFinite(progress?.step) && Number.isFinite(progress?.total) && progress.total > 0) {
      const step = Math.max(0, Math.min(progress.total, progress.step));
      return { label: 'H3 sampling · ' + step + '/' + progress.total,
        percent: Math.round(100 * step / progress.total) };
    }
    const labels = { loading: 'Loading model and references', decoding: 'Decoding video and audio', saving: 'Saving video' };
    return { label: labels[progress?.phase] || 'Rendering · waiting for progress', percent: null };
  }
  function cancellationRequest(queue, id) {
    if (typeof id !== 'string' || !id) return null;
    if ((queue?.queue_running || []).some(row => Array.isArray(row) && row[1] === id))
      return { path: '/interrupt', body: { prompt_id: id } };
    if ((queue?.queue_pending || []).some(row => Array.isArray(row) && row[1] === id))
      return { path: '/queue', body: { delete: [id] } };
    return null;
  }
  function elapsedLabel(milliseconds) {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = seconds % 60;
    return (h ? h + 'h ' : '') + (m || h ? m + 'm ' : '') + s + 's';
  }
  function cancelButton(id, options) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'button alt smallbtn';
    const pending = options.cancelPending?.has(id);
    button.textContent = pending ? 'Cancellation requested' : 'Cancel this render';
    button.disabled = !!pending;
    button.onclick = async () => {
      button.disabled = true; button.textContent = 'Requesting cancellation…';
      try { await options.onCancel(id); } catch { button.disabled = false; button.textContent = 'Retry cancellation'; }
    };
    return button;
  }
  function timingPanel(timing, now, finished = false) {
    const panel = document.createElement('div'); panel.className = 'stage-timings';
    const labels = {loading:'Loading / preparation',sampling:'Sampling',decoding:'Video / audio decoding',saving:'Saving'};
    for (const stage of timing.stages || []) {
      const line = document.createElement('div'); line.className = 'statusline';
      const duration = elapsedLabel((stage.ended_at || now) - stage.started_at);
      line.textContent = (labels[stage.phase] || stage.phase) + ': ' + duration
        + (stage.partial ? ' (tracked since timing was enabled)' : '')
        + (!stage.ended_at ? ' · in progress' : ' · finished');
      panel.append(line);
    }
    if (!finished) {
      const eta = document.createElement('small');
      eta.textContent = Number.isFinite(timing.eta_ms) && timing.eta_ms > 0
        ? 'Current stage remaining: ~' + elapsedLabel(timing.eta_ms) + ' · ' + timing.eta_basis
        : 'Current stage estimate: collecting actual measurements';
      panel.append(eta);
    }
    return panel;
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
    for (const row of (Array.isArray(queue?.queue_running) ? queue.queue_running : []).filter(row =>
      Array.isArray(row) && typeof row[1] === 'string' && row[1].length > 0
    ).slice(0, 6)) {
      const display = progressSummary(options.progress?.[row[1]]);
      const shared = document.createElement('div'); shared.className = 'output-card shared-generation';
      const heading = document.createElement('strong');
      heading.textContent = row[1] === ownId ? 'Shared generation · your render' : 'Shared generation · another user';
      const line = document.createElement('div'); line.className = 'statusline';
      const status = document.createElement('span'); status.textContent = display.label;
      const percent = document.createElement('span'); percent.textContent = display.percent === null ? 'In progress' : display.percent + '%';
      line.append(status, percent);
      const bar = document.createElement('div'); bar.className = 'progress' + (display.percent === null ? ' busy' : '');
      bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-label', 'Shared generation: ' + display.label);
      bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100');
      if (display.percent !== null) bar.setAttribute('aria-valuenow', String(display.percent));
      const fill = document.createElement('i'); fill.style.width = (display.percent ?? 0) + '%';
      bar.append(fill); shared.append(heading, line, bar);
      const created = row[3]?.create_time;
      if (Number.isFinite(created) && created > 0 && created <= Date.now()) {
        const elapsed = document.createElement('div'); elapsed.className = 'statusline';
        elapsed.textContent = 'Elapsed since submission: ' + elapsedLabel(Date.now() - created);
        shared.append(elapsed);
      }
      const timing = options.timings?.jobs?.[row[1]];
      if (timing) shared.append(timingPanel(timing, options.timings.updated_at));
      if (options.onCancel) shared.append(cancelButton(row[1], options));
      container.append(shared);
    }
    const note = document.createElement('div'); note.className = 'queue-own-status';
    note.textContent = options.waitingPreparation ? 'Your prompt preparation is waiting for the server to become idle. No generation has been queued.'
      : summary.ownStatus === 'running' ? 'Your generation is rendering. Cancel affects only this generation.'
      : summary.ownStatus === 'pending' ? 'Your generation is position ' + summary.ownPosition + ' of ' + summary.pending.length + ' waiting. Cancel removes only your generation.'
      : summary.ownStatus === 'checking' ? 'Checking the saved submission and its history. Your inputs are retained.'
      : summary.total ? 'All users can follow and cancel a listed generation.' : 'The server is idle.';
    container.append(note);
    const recent = options.timings?.recent?.[0];
    if (!summary.total && recent) {
      const completed = document.createElement('details');
      const title = document.createElement('summary'); title.textContent = 'Last render: ' + recent.status;
      completed.append(title, timingPanel(recent, recent.finished_at, true)); container.append(completed);
    }
    const items = [...summary.running, ...summary.pending];
    if (items.length) {
      const list = document.createElement('ul'); list.className = 'queue-jobs';
      for (const item of items.slice(0, 6)) {
        const card = document.createElement('li'); card.className = 'queue-job' + (item.own ? ' own' : '');
        const label = document.createElement('span'); label.textContent = item.label;
        const phase = document.createElement('small'); phase.textContent = item.phase === 'running' ? 'Rendering' : 'Waiting · ' + item.position;
        card.append(label, phase);
        if (item.phase === 'pending' && options.onCancel) {
          const pendingRows = (queue.queue_pending || []).filter(row => Array.isArray(row) && typeof row[1] === 'string' && row[1]);
          const id = pendingRows[item.position - 1]?.[1];
          if (id) card.append(cancelButton(id, options));
        }
        list.append(card);
      }
      container.append(list);
      if (items.length > 6) { const more = document.createElement('small'); more.textContent = '+ ' + (items.length - 6) + ' more jobs on this server'; container.append(more); }
    }
    // Cancellation always targets the selected prompt, never a global interrupt.
    return summary;
  }
  return { summarizeQueue, progressSummary, cancellationRequest, elapsedLabel, render };
});
