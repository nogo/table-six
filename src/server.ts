// The whole server: JSON API, static files and the websocket in one place.
// `bun src/server.ts` listens on PORT; tests call `serve(0)` and get the same
// route table on a free port.
import { file } from 'bun';
import { routes } from './api.ts';
import { onPublish } from './sync.ts';

const WEB = new URL('../web/', import.meta.url).pathname;
const TOPIC = 'table-six';

/**
 * One deployment speaks one language. It is set here, on the shell, and the
 * interface reads it back off `<html lang>` — there is no switch in the app,
 * because a kitchen does not change language between two evenings.
 */
const LANGUAGE = process.env.TABLE_SIX_LANG === 'en' ? 'en' : 'de';

/**
 * What this deployment is, for the cache on the phone: the commit the image
 * was built from, baked in by the Dockerfile. Outside a container there is no
 * commit, and the start time is the honest answer — every `--watch` restart is
 * a new version, which is what someone editing wants. The shell and
 * `/api/version` both read this one value; if they ever disagree, the phone
 * reloads every time it is picked up.
 */
const VERSION = process.env.TABLE_SIX_VERSION || String(Date.now());

// Read once: the shell is one file that only changes when the app is deployed.
// It carries the language and the version, so the first line the phone reads
// tells it both; the ETag over it keeps a reload at 304 and no bytes.
const SHELL = (await file(WEB + 'index.html').text())
  .replace(/<html lang="[a-z-]+">/, `<html lang="${LANGUAGE}" data-version="${VERSION}">`);
const ETAG = `"${Bun.hash(SHELL).toString(16)}"`;

/**
 * The screens the client router owns: each one is the shell, it takes over
 * from there.
 *
 * `no-cache` is not "do not store", it is "ask first": without it the browser
 * is free to keep the shell on heuristic freshness, and the file that names
 * the deployed version would be the one file that never updates. With the
 * ETag beside it, asking costs a 304 and no bytes.
 */
const HEADERS = { etag: ETAG, 'cache-control': 'no-cache', 'content-type': 'text/html; charset=utf-8' };

const shell = (request: Request) =>
  request.headers.get('if-none-match') === ETAG
    ? new Response(null, { status: 304, headers: HEADERS })
    : new Response(SHELL, { headers: HEADERS });

export function serve(port: number) {
  const server = Bun.serve({
    port,
    idleTimeout: 60,

    routes: {
      ...routes,

      // What this deployment is. Behind `/api/`, which the service worker
      // never caches, so a phone that has been asleep for a week can ask the
      // server the one question the cache cannot answer honestly.
      '/api/version': () => Response.json({ version: VERSION }),

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
  return server;
}

if (import.meta.main) {
  const server = serve(Number(process.env.PORT ?? 4173));
  console.log(`Table Six on http://localhost:${server.port}`);
}
