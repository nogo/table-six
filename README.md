# Table Six

Weekly meal planning for a household. **An evening is a set of items, not a
dish** — potatoes, broccoli and bratwurst is one meal for everyone at the
table, and whoever does not want an item leaves it out. **The app suggests, it
never decides:** every slot is overwritable, every warning is a hint.

Three screens, in German or English — one language per deployment:

- **Woche** — seven evenings on one phone screen, no scrolling. Plate, effort
  level, and a `⚠` when an evening asks for more time than the weekday has.
- **Tag** — one evening fills the screen. One tap adds an item, one tap removes
  it, written immediately. Every suggestion carries its reason in plain words
  („wieder dran · vor 11 Tagen", „zuletzt mit Gnocchi"), and `Abend
  vorschlagen` proposes a whole evening out of combinations that have actually
  been eaten.
- **Bestand** — the item list: create, rename, set the part it plays on a plate
  (`Sättigung`, `Gemüse`, `Protein`, `Extra`, `Komplett`) and how much work it
  is. Nothing seeds it; it is filled by hand and that is cheap on purpose.

Every device planning at the same time sees the same week without a reload:
SQLite is the truth, a websocket only says what changed, and everything still
works when it never connects.

## Running it

Bun 1.4, SQLite and TypeScript, [auril.js](https://github.com/nogo/auril) on the
front. One language, one database, one process, **no build step and no runtime
dependencies** — `@types/bun` is the only entry in `package.json`.

```sh
bun src/server.ts                        # http://localhost:4173
TABLE_SIX_LANG=en bun src/server.ts      # English instead of German
bun --watch src/server.ts                # while editing
bun test                                 # the whole suite, well under a second
```

The database lives in `data/` and is not in git. In the container it is a bind
mount and the image comes from the registry:

```sh
docker compose pull && docker compose up -d
```

## Guardrails

- [`docs/project.md`](docs/project.md) — outcome, value, constraints, non-goals.
- [`docs/ui.md`](docs/ui.md) — the screens, the colour, the type, the touch
  targets.

Both are rules, not a changelog. **The base first, features one at a time.**
