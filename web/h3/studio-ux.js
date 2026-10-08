(function (root) {
  'use strict';
  function mentionNodes(container, value) {
    container.replaceChildren();
    const text = String(value || '');
    const pattern = /@[\p{L}\p{N}_-]+/gu;
    let start = 0;
    for (const match of text.matchAll(pattern)) {
      container.append(document.createTextNode(text.slice(start, match.index)));
      const span = document.createElement('span'); span.className = 'reference-mention'; span.textContent = match[0];
      container.append(span); start = match.index + match[0].length;
    }
    container.append(document.createTextNode(text.slice(start)));
  }
  function attachPrompt(textarea) {
    if (!textarea || textarea.parentElement.classList.contains('prompt-editor')) return;
    const wrapper = document.createElement('div'); wrapper.className = 'prompt-editor';
    textarea.before(wrapper); wrapper.append(textarea);
    const mirror = document.createElement('div'); mirror.className = 'prompt-highlight'; mirror.setAttribute('aria-hidden', 'true');
    wrapper.prepend(mirror);
    const sync = () => {
      mentionNodes(mirror, textarea.value + '\n');
      mirror.scrollTop = textarea.scrollTop; mirror.scrollLeft = textarea.scrollLeft;
    };
    textarea.addEventListener('input', sync); textarea.addEventListener('scroll', sync);
    textarea.addEventListener('compositionstart', () => wrapper.classList.add('composing'));
    textarea.addEventListener('compositionend', () => { wrapper.classList.remove('composing'); sync(); });
    new ResizeObserver(() => { mirror.style.height = textarea.clientHeight + 'px'; mirror.style.width = textarea.clientWidth + 'px'; sync(); }).observe(textarea);
    // Draft restoration and mention insertion assign .value without an input event.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
    Object.defineProperty(textarea, 'value', { configurable: true, get() { return descriptor.get.call(this); }, set(value) { descriptor.set.call(this, value); sync(); } });
    const setRangeText = textarea.setRangeText;
    textarea.setRangeText = function (...args) { const result = setRangeText.apply(this, args); sync(); return result; };
    sync();
  }
  function captureThumbnail(item) {
    if (item.thumbnail) return item.thumbnail;
    const url = item.previewUrl || item.url;
    if (!url || item.kind === 'audio') return null;
    const image = [...document.querySelectorAll('img,video')].find(node => node.src === url && (node.naturalWidth || node.videoWidth));
    if (!image) return null;
    try {
      const width = image.naturalWidth || image.videoWidth, height = image.naturalHeight || image.videoHeight;
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = Math.max(1, Math.round(160 * height / width));
      if (canvas.height > 160) { canvas.height = 160; canvas.width = Math.max(1, Math.round(160 * width / height)); }
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', .7);
    } catch { return null; }
  }
  function referenceCards(container, references, assetUrl) {
    const list = document.createElement('div'); list.className = 'detail-references';
    for (const ref of references) {
      const card = document.createElement('div'); card.className = 'detail-reference';
      const snapshot = typeof ref.thumbnail === 'string' && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(ref.thumbnail) && ref.thumbnail.length < 60000 ? ref.thumbnail : null;
      const source = snapshot || (ref.asset_id && ref.type === 'image' ? assetUrl(ref.asset_id) : null);
      const preview = document.createElement('div'); preview.className = 'detail-reference-preview';
      preview.textContent = ref.type === 'audio' ? 'Audio' : 'Unavailable';
      if (source) {
        const img = document.createElement('img'); img.src = source; img.alt = ref.name || 'Reference'; img.loading = 'lazy';
        img.onerror = () => { preview.textContent = 'Unavailable'; card.classList.add('missing'); };
        preview.replaceChildren(img);
      } else if (ref.type !== 'audio') card.classList.add('missing');
      const label = document.createElement('div'); mentionNodes(label, ref.name || ref.file || 'Reference');
      const role = document.createElement('small'); role.textContent = [ref.type, ref.use_as, ref.video_soundtrack ? 'soundtrack on' : null].filter(Boolean).join(' · ');
      const status = document.createElement('small'); status.textContent = source ? (snapshot ? 'Saved preview' : 'Project asset') : ref.type === 'audio' ? 'Audio reference' : 'Historical preview unavailable';
      label.append(role, status); card.append(preview, label); list.append(card);
    }
    container.append(list);
  }
  root.H3StudioUX = { mentionNodes, attachPrompt, captureThumbnail, referenceCards };
  if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => attachPrompt(document.getElementById('prompt')));
})(globalThis);
