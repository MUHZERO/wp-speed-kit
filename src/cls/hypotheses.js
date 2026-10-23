const WINDOW_MS = 100;
// An inserted element can wait more than one frame before it is painted and moves the page (seen on slow CI
// machines), so insertions get a wider window than font and stylesheet loads.
const INSERT_WINDOW_MS = 1000;

function recent(events, shift, windowMs = WINDOW_MS) {
  return events.filter((event) => event.t <= shift.t && shift.t - event.t <= windowMs);
}

function evidence(kind, text) {
  return { kind, evidence: text };
}

export function buildHypotheses(shift, events, dom = {}) {
  const hypotheses = [];
  const fonts = recent(events.fonts || [], shift).filter((font) => !font.family || !dom.fontFamily || dom.fontFamily.includes(font.family));
  if (fonts.length && dom.text !== false) hypotheses.push(evidence('font', `font ${fonts[0].family || 'finished loading'} ${Math.round(shift.t - fonts[0].t)} ms before`));
  if (dom.image?.changedHeight && (!dom.image.changedAt || shift.t - dom.image.changedAt <= WINDOW_MS)) {
    const reservation = dom.image.hasDimensions || dom.image.hasAspectRatio ? 'space was reserved' : 'no width/height or aspect-ratio';
    hypotheses.push(evidence('image', `image height changed; ${reservation}`));
  }
  const insertion = recent(events.insertions || [], shift, INSERT_WINDOW_MS).reverse().find((event) => event.above);
  if (insertion) hypotheses.push(evidence('inserted', `${insertion.selector} was added above ${Math.round(shift.t - insertion.t)} ms before`));
  const stylesheet = recent(events.resources || [], shift).find((event) => event.kind === 'stylesheet');
  if (stylesheet) hypotheses.push(evidence('stylesheet', `${stylesheet.name} finished ${Math.round(shift.t - stylesheet.t)} ms before`));
  const carousel = /\b(swiper|slick|splide|owl|flickity)\b/i.test(dom.containerClass || '') && recent(events.classChanges || [], shift).find((event) => !dom.containerSelector || event.selector === dom.containerSelector);
  if (carousel) hypotheses.push(evidence('carousel', `carousel class changed ${Math.round(shift.t - carousel.t)} ms before`));
  const bar = recent(events.heightChanges || [], shift).find((event) => event.above);
  if (bar) hypotheses.push(evidence('bar', `${bar.selector} changed height ${Math.round(shift.t - bar.t)} ms before`));
  return hypotheses;
}
