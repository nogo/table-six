# Coding standards

Base: the [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/) in
`strict` mode for `src/` and `test/`; plain ES modules with JSDoc types for
`web/`, under the auril contract in `web/auril/FRAMEWORK.md`. Where this file is
silent, they apply. The stack, sync model and repo layout are in
[`AGENTS.md`](AGENTS.md); outcome and constraints in
[`docs/project.md`](docs/project.md); screens in [`docs/ui.md`](docs/ui.md).

## Check

`bun test` — must pass before a change is done. The whole suite runs in well
under a second; it is never filtered.

Gap: the check has no type check and no lint. `bunx -p typescript@5.9.3 tsc --noEmit -p .`
passes today but is not a repo command, and `web/` is not type-checked at all.

## Measure

Run before and after a refactor, same command, both numbers in the reply.

- Duplication: `bunx jscpd@4.0.5 --min-tokens 40 --reporters console src web --ignore "web/auril/**"`
- Cognitive complexity: ESLint 9.39.1 with `eslint-plugin-sonarjs@3.0.5`
  (`sonarjs/cognitive-complexity: [warn, 0]`) and the `typescript-eslint@8.46.2`
  parser, run from a scratch directory outside the repo on a copy of `src/*.ts`
  and `web/*.js` — nothing is added to `package.json`. Report max and sum.
- Flakiness: `for i in $(seq 20); do bun test --randomize >/dev/null || echo FAIL; done`
- Hotspots: `git log --since=3.months --name-only --format= | sort | uniq -c | sort -rn | head -20`
- Mutation: gap — no mutation tool runs on `bun test`. Use hand mutation
  (skill's MEASURE.md) on the function about to change.

## TypeScript (server, `src/`)

### Structure
- `server.ts` is the route table and nothing else: API routes spread in from
  `api.ts`, `/api/version`, one shell route per client screen, `/ws`, and `web/`
  as a `dir` route. `serve(port)` builds it; it listens on its own only under
  `import.meta.main`, so tests run the same table.
- The deployment version has one owner, `VERSION` in `server.ts`: the shell and
  `/api/version` both read it.
- Every SQL statement lives in `db.ts` (migrations in `schema.ts`). Callers get
  functions that return domain types, never a query string or a raw row.
- Prepared statements are module-level constants named `<verb><Noun>Stmt`;
  values are always bound. A list of values is bound as one JSON array through
  `json_each(?)`, never interpolated.
- A row type (`ItemRow`) is converted to the domain type (`Item`) in `db.ts`
  (`toItem`): SQLite integers become booleans there and nowhere else.
- Planning logic (`suggest.ts`, `week.ts`) takes ISO dates, reads through
  `db.ts`, returns plain data. It never builds a `Response` and never publishes.
- A route handler does, in order: parse and validate, call one domain or `db.ts`
  function, `changed()`, respond. Expected failures return early.
- A schema change is a new step appended to `MIGRATIONS`; a shipped step is
  never edited.
- Dates cross every boundary as ISO `YYYY-MM-DD` strings. Arithmetic goes
  through `dates.ts` (UTC); "today" is `today()`, which takes an injectable `now`.

### Naming
- One word per concept, used everywhere: *item*, *plate* (the items of one
  evening), *evening*, *effort* (the evening's level and the item's cost),
  *component*, *retired* (shown as "paused").
- Suggestion reasons are structured `{ axis, ... }` values. Words for them live
  in `web/i18n.js`, never in `src/`.
- Files are one lowercase word named for the concern (`dates.ts`, `suggest.ts`).

### Errors
- API errors are JSON `{ error }`: `400` for bad input (via `bad()`), `404` for a
  missing item (`missing()`), `409` for a conflict, with the conflicting item in
  the body where there is one. Success without a body is `204` (`done()`).
- An unparseable request body is `{}`, and validation reports the field.
- A refused write calls no `changed()`.
- `!` is only used where the query cannot return nothing (a row just inserted,
  index 0–6 of a seven-day week).

### Tests
- `bun test` against a real in-memory SQLite (`test/setup.ts` sets
  `TABLE_SIX_DB=:memory:`). No mocks; that database is the only substitute.
- Each test file empties every table in `beforeEach`.
- API behaviour is tested over HTTP against `serve(0)`, the real route table;
  planning behaviour by calling `db.ts` and `suggest.ts` directly.
- Nothing waits with a sleep. Socket tests publish a marker and wait for it:
  the socket delivers in order.
- Dates are fixed constants (`MONDAY = '2026-08-17'`), never the wall clock.
- A test is named for the behaviour, as a sentence the family would agree with.
- A migration is tested from a fixture database shaped like the one before it.

### Dependencies
- No runtime dependencies; `@types/*` only. A new one is a question, not a
  commit (see `AGENTS.md`).

## JavaScript (client, `web/`)

### Structure
- Only `api.js` calls the data API. Screens call its functions.
- One `Store` in `app.js`. Server data enters it only through `loadWeek`,
  `loadItems` and `loadSuggestions`, which set `offline` on failure; `reload()`
  runs all three.
- Every write goes through `write()` in `app.js`: the request, then `reload()`.
  A failed write sets `unsaved`, and the screen shows what is stored. No
  optimistic state, and no screen keeps its own list of what to refetch.
- A rule the server can decide (such as which items are too much for an
  evening) arrives in the response; the client does not recompute it.
- A screen is an `AurilElement`: `this.watch()` for store slices, `delegate()`
  for events, private fields for state nobody else needs, `data-id` read back
  through `#id(el)`.
- Every word on screen goes through `t()` with a `screen.key` key; both
  languages in `i18n.js`.
- A new file under `web/` is added to `SHELL` in `sw.js`; a new client route
  gets its shell route in `server.ts`.
- `web/auril/` is vendored and never edited in place.

### Naming
- Custom elements are two lowercase words (`week-board`, `day-focus`).
- Event targets are classes named for the action (`.add`, `.x`, `.fill`).

### Tests
- None in `web/`. Client behaviour is checked by running the app.

## Overrides

- Stored enum values stay as they shipped: effort is `kurz` / `normal` /
  `entspannt`, component is English — the family's database holds them, so
  renaming one is a migration.
