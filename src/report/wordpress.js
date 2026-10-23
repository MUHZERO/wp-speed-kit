function requests(lhr) {
  return lhr?.audits?.['network-requests']?.details?.items || [];
}

function isWordPress(lhr) {
  return requests(lhr).some((request) => /\/wp-content\//.test(request.url || ''))
    || /wordpress/i.test(lhr?.audits?.['meta-generator']?.displayValue || '');
}

export function wordpressHints(lhr) {
  if (!isWordPress(lhr)) return [];
  const network = requests(lhr);
  const hints = [];
  if (network.some((request) => /litespeed/i.test(request.url || '') && /\.css(?:$|\?)/.test(request.url || ''))) {
    hints.push({ id: 'litespeed-combined-css-blocking', text: 'LiteSpeed combined CSS is render-blocking.' });
  }
  const lcp = lhr?.audits?.['largest-contentful-paint-element']?.details?.items?.[0]?.node?.snippet || '';
  if (/loading=["']lazy/i.test(lcp) && /\/wp-content\/uploads\//.test(lcp)) {
    hints.push({ id: 'lcp-image-lazy', text: 'The LCP image is lazy-loaded.' });
  }
  if (network.some((request) => /(?:loader|preloader)/i.test(request.url || ''))) {
    hints.push({ id: 'full-page-loader', text: 'A full-page loader was requested.' });
  }
  if (network.some((request) => /(?:fontawesome|icon).+\.(?:woff2?|ttf)(?:$|\?)/i.test(request.url || ''))
    && !lhr?.audits?.['font-display']?.details?.items?.length) {
    hints.push({ id: 'unused-icon-font-preloads', text: 'Icon fonts were preloaded but not used above the fold.' });
  }
  return hints;
}
