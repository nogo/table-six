// The whole server: JSON API, static files and the websocket in one place.
import { file } from 'bun';
import { routes } from './api.ts';
import { onPublish } from './sync.ts';

const WEB = new URL('../web/', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 4173);
const TOPIC = 'table-six';

/** The screens the client router owns: each one is the shell, it takes over from there. */
const shell = () => new Response(file(WEB + 'index.html'));

const server = Bun.serve({
  port: PORT,
  idleTimeout: 60,

  routes: {
    ...routes,

    '/day/:date': shell,
    '/inventory': shell,

    '/ws': (request, server) =>
      server.upgrade(request) ? undefined : new Response('upgrade failed', { status: 400 }),

    // web/ as it lies on disk, `/` included: Bun sends the file and the
    // ETag, Last-Modified and 304 with it, so a reload in the kitchen costs
    // one request per file and no bytes. Anything else is a 404.
    '/*': { dir: WEB },
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
