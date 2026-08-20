// The whole server: JSON API, static files and the websocket in one place.
import { file } from 'bun';
import { isIsoDate, today, weekStart } from './dates.ts';
import { buildWeek } from './week.ts';

const WEB = new URL('../web/', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 4173);

const bad = (message: string) => Response.json({ error: message }, { status: 400 });

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

  routes: {
    // One week, Monday to Sunday. `start` is any day inside it.
    '/api/week': (request) => {
      const start = new URL(request.url).searchParams.get('start') ?? today();
      if (!isIsoDate(start)) return bad('start must be YYYY-MM-DD');
      return Response.json(buildWeek(weekStart(start)));
    },
  },

  fetch: (request) => serveStatic(new URL(request.url).pathname),
});

console.log(`Table Six on http://localhost:${server.port}`);
