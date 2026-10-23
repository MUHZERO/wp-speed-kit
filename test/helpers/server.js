import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const MIME_TYPES = { '.css': 'text/css', '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };

export async function startFixtureServer(dir) {
  const root = resolve(dir);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://fixture.test');
    if (url.pathname === '/hang') return;
    if (url.pathname === '/redirect') {
      response.writeHead(302, { location: url.searchParams.get('to') || '/clean.html' });
      response.end();
      return;
    }
    const filename = resolve(root, `.${url.pathname}`);
    if (filename !== root && !filename.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const info = await stat(filename);
      if (!info.isFile()) throw new Error('not a file');
      const delay = Number(url.searchParams.get('delay')) || 0;
      if (delay > 0) await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
      response.writeHead(200, { 'content-type': MIME_TYPES[extname(filename)] || 'application/octet-stream' });
      createReadStream(filename).pipe(response);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())) };
}
