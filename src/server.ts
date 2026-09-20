// The whole server: JSON API, static files and the websocket in one place.
import { file } from 'bun';
import { routes } from './api.ts';
import { onPublish } from './sync.ts';

const WEB = new URL('../web/', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 4173);
const TOPIC = 'table-six';

/**
 * One deployment speaks one language. It is set here, on the shell, and the
 * interface reads it back off `<html lang>` — there is no switch in the app,
 * because a kitchen does not change language between two evenings.
 */
const LANGUAGE = process.env.TABLE_SIX_LANG === 'en' ? 'en' : 'de';

// Read once: the shell is one file that only changes when the app is deployed,
// and the ETag over it keeps a reload in the kitchen at 304 and no bytes.
const SHELL = (await file(WEB + 'index.html').text()).replace(/<html lang="[a-z-]+">/, `<html lang="${LANGUAGE}">`);
const ETAG = `"${Bun.hash(SHELL).toString(16)}"`;

/** The screens the client router owns: each one is the shell, it takes over from there. */
const shell = (request: Request) =>
  request.headers.get('if-none-match') === ETAG
    ? new Response(null, { status: 304, headers: { etag: ETAG } })
    : new Response(SHELL, { headers: { etag: ETAG, 'content-type': 'text/html; charset=utf-8' } });

const server = Bun.serve({
  port: PORT,
  idleTimeout: 60,

  routes: {
    ...routes,

    '/': shell,
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
