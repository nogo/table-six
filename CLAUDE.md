# Table Six

Weekly meal planning for a six-person household, running locally. An evening is
a **set of items**, not a dish — potatoes, broccoli and bratwurst is one meal
for all six, and the two vegetarians leave out one item. The app suggests, it
never decides: every slot is overwritable, every warning is a hint.

Outcome, value and constraints are in [`docs/project.md`](docs/project.md), the
screens and the visual guardrails in [`docs/ui.md`](docs/ui.md). Both are rules,
not a changelog — keep them short, and change them only when a rule changes.

**The most important rule:** the base first, features one at a time. A week
that can be filled by hand is the whole of the first version; the recommendation
system comes after it, and is used before the next thing is started.

## Stack

**Bun 1.4 + SQLite + TypeScript, auril.js on the front.** One language, one
database, one process, no build step. Before reaching for anything, check
whether the runtime already has it — Bun ships more every release.

- **No runtime dependencies.** `@types/*` are the only entries in
  `package.json`. Stdlib beats a library beats a framework; a new dependency is
  a question, not a commit.
- **Server:** a single `Bun.serve` in `src/server.ts` — JSON API, static files
  and the websocket in one place. No framework, no router library. The route
  table *is* the server, there is no `fetch` handler: the API routes, one shell
  route per screen the client router owns, `/ws`, and `web/` as a `{ dir }`
  route that carries `Content-Type`, `ETag`, `Last-Modified`, `304` and `Range`
  on its own. Nothing falls through a `dir` route — an unknown path is a 404,
  and a new client route needs its shell route here.
- **Database:** `bun:sqlite`, WAL, foreign keys on. Prepared statements as
  module-level constants in `src/db.ts`, values always bound, never
  interpolated. The schema lives in `src/schema.ts` as a ledger of steps, and
  `user_version` counts the steps a database has run: a schema change is a new
  step appended to `MIGRATIONS`, never an edit to one that has shipped — the
  family's database has already run it.
- **Frontend:** [auril.js](../../auril) vendored into `web/auril/` with
  `../../auril/vendor.sh web/auril`. Plain ES modules, no npm, no bundler, no
  JSX — the file in the debugger is the file that was written. `html` for
  markup (quote every interpolated attribute), `Store` for shared state,
  private fields for local state, `AurilElement` + `this.watch()` for
  components, `Router` for the two routes. The contract is in
  `web/auril/FRAMEWORK.md`; the kernel is never edited in place, it is
  re-vendored.
- **PWA:** manifest and a shell-only service worker, `display: standalone`, so
  the app opens from the home screen. The cache holds the shell, never data.
- **German** in the interface, English in code, comments and docs.

## Sync

Two phones and a laptop in one kitchen see the same week without a reload.

- **SQLite is the truth. The socket only says what changed.** Every mutation
  goes through the HTTP API; the server then broadcasts the affected scope
  (`week:2026-08-17`, `items`) to the other clients, which refetch it.
- **No diffs, no operations, no CRDT, no offline merge.** Last write wins. Six
  people in one household do not need more, and anything more is maintenance.
- **The socket is an accelerator.** If it never connects or drops, everything
  still works and resyncs on reconnect and on focus. Nothing may be reachable
  only through the socket.

## Repo

```
src/      server, schema, planning logic
web/      frontend, auril/ vendored kernel, sw.js, manifest
docs/     project.md, ui.md — the guardrails
test/     bun test, real behaviour, not smoke
```

Start with `bun src/server.ts` (port 4173), open it on the phone over the LAN;
`bun --watch src/server.ts` while editing. `bun test` runs the real behaviour
— the whole suite is well under a second, so it runs in full, never filtered.
The database lives in `data/` and is not in git; `bun repl` is the way to ask
it a real question instead of guessing (`import { db } from './src/db.ts'`).
