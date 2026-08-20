// The whole server: JSON API, static files and the websocket in one place.
import { file } from 'bun';
import { routes } from './api.ts';
import { onPublish } from './sync.ts';

const WEB = new URL('../web/', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 4173);
const TOPIC = 'table-six';

/** Serve web/ as-is. `/` and unknown paths hand out the shell — the router owns them. */
async function serveStatic(pathname: string): Promise<Response> {
  const path = pathname.replace(/\/+$/, '');
  const candidate = file(WEB + (path.includes('..') ? '' : path.slice(1)));
  if (path && (await candidate.exists())) return new Response(candidate);
  return new Response(file(WEB + 'index.html'), { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

const server = Bun.serve({
  port: PORT,
  idleTimeout: 60,
  routes,

  fetch(request, server) {
    const { pathname } = new URL(request.url);
    if (pathname === '/ws') {
      return server.upgrade(request) ? undefined : new Response('upgrade failed', { status: 400 });
    }
    return serveStatic(pathname);
  },

  websocket: {
    // Every phone in the kitchen listens to the same topic. Clients never
    // send: the socket carries what changed, nothing else.
    open: (ws) => void ws.subscribe(TOPIC),
    message: () => {},
  },
});

onPublish((scope) => server.publish(TOPIC, scope));

console.log(`Table Six on http://localhost:${server.port}`);
