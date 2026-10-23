export const injectedRecorder = String.raw`
(() => {
  const state = { shifts: [], fonts: [], insertions: [], resources: [], classChanges: [], heightChanges: [] };
  const now = () => performance.now();
  const rect = (box) => ({ x: box.x, y: box.y, w: box.width, h: box.height });
  const selector = (node) => {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return '(not attributable)';
    if (node.id) return '#' + CSS.escape(node.id);
    const parts = [];
    for (let current = node; current && current.nodeType === Node.ELEMENT_NODE && parts.length < 4; current = current.parentElement) {
      let part = current.tagName.toLowerCase();
      if (current.classList.length) part += '.' + CSS.escape(current.classList[0]);
      const siblings = [...current.parentElement?.children || []].filter((child) => child.tagName === current.tagName);
      if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
      parts.unshift(part);
      if (current.id) break;
    }
    return parts.join(' > ') || '(not attributable)';
  };
  const imageChanges = new Map();
  const observedImages = new WeakSet();
  const imageObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const previous = imageChanges.get(entry.target);
      imageChanges.set(entry.target, { height: entry.contentRect.height, t: previous ? now() : null });
    }
  });
  const observeImage = (node) => {
    if (node instanceof HTMLImageElement && !observedImages.has(node)) {
      observedImages.add(node);
      imageObserver.observe(node);
    }
    node?.querySelectorAll?.('img').forEach(observeImage);
  };
  document.querySelectorAll('img').forEach(observeImage);
  const details = (node) => {
    const container = node?.closest?.('[class]') || document.querySelector('.swiper, .slick, .splide, .owl, .flickity') || node?.parentElement || document.body;
    const image = container?.querySelector?.('img') || document.querySelector('img');
    return {
      text: Boolean(node?.textContent?.trim()),
      fontFamily: node ? getComputedStyle(node).fontFamily : '',
      containerClass: container?.className || '',
      containerSelector: selector(container),
      image: image ? { changedHeight: Boolean(imageChanges.get(image)?.t), changedAt: imageChanges.get(image)?.t, hasDimensions: image.hasAttribute('width') && image.hasAttribute('height'), hasAspectRatio: getComputedStyle(image).aspectRatio !== 'auto' } : null,
    };
  };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) state.shifts.push({
      t: entry.startTime, value: entry.value, hadRecentInput: entry.hadRecentInput,
      sources: entry.sources.map((source) => ({ selector: selector(source.node), before: rect(source.previousRect), after: rect(source.currentRect), dom: details(source.node) })),
    });
  }).observe({ type: 'layout-shift', buffered: true });
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          observeImage(node);
          const box = node.getBoundingClientRect();
          state.insertions.push({ t: now(), selector: selector(node), above: box.y < innerHeight });
        }
      }
      if (mutation.type === 'attributes') {
        const node = mutation.target;
        const box = node.getBoundingClientRect();
        state.classChanges.push({ t: now(), selector: selector(node) });
        if (box.y < innerHeight && (getComputedStyle(node).position === 'fixed' || box.y <= 0)) state.heightChanges.push({ t: now(), selector: selector(node), above: true });
      }
    }
  });
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  document.fonts?.addEventListener('loadingdone', (event) => state.fonts.push({ t: now(), family: [...(event.fontfaces || [])].map((face) => face.family).join(', ') }));
  window.__wpskRecorder = { read() {
    state.resources = performance.getEntriesByType('resource').map((entry) => ({
      t: entry.responseEnd, name: entry.name,
      kind: entry.initiatorType === 'link' || /\.css(?:$|[?])/.test(entry.name) ? 'stylesheet' : entry.initiatorType,
    }));
    return state;
  } };
})();`;
