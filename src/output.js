import { mkdir } from 'node:fs/promises';

export async function uniqueDir(base) {
  for (let suffix = 1; ; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    try {
      await mkdir(candidate);
      return candidate;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

export function slugFor(value) {
  const url = new URL(value);
  const path = url.pathname.replace(/^\/+|\/+$/g, '') || 'home';
  const pathSlug = path.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home';
  return `${url.host}-${pathSlug}`;
}
