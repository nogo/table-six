// The database itself: where the file is, how it is opened, and every change
// the schema has been through. `src/db.ts` holds the statements that use it.
import { Database } from 'bun:sqlite';

const hasColumn = (db: Database, table: string, column: string): boolean =>
  db.query('SELECT 1 FROM pragma_table_info(?) WHERE name = ?').get(table, column) !== null;

/**
 * The schema as a ledger: one step per change, in the order they happened.
 * `user_version` counts the steps a database has already seen, so each one
 * runs exactly once. Append the next step; never edit a step that has shipped,
 * because the family's database has already run it.
 */
const MIGRATIONS: ((db: Database) => void)[] = [
  // 1 — the schema as it stood when the ledger started. The family's database
  // is older than the ledger and already carries all of this, so the step is
  // written to change nothing there.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS items (
        id         INTEGER PRIMARY KEY,
        name       TEXT NOT NULL COLLATE NOCASE UNIQUE,
        vegetarian INTEGER NOT NULL DEFAULT 0,
        effort     TEXT NOT NULL DEFAULT 'normal' CHECK (effort IN ('kurz', 'normal', 'entspannt')),
        component  TEXT CHECK (component IN ('base', 'vegetable', 'protein', 'extra', 'whole')),
        retired    INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS plan (
        date     TEXT NOT NULL,
        item_id  INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        PRIMARY KEY (date, item_id)
      );

      CREATE INDEX IF NOT EXISTS plan_item ON plan(item_id);

      -- The effort level is a recurring weekday grid, not a property of a date:
      -- Wednesday is short every week, not just this one.
      CREATE TABLE IF NOT EXISTS weekday_effort (
        weekday INTEGER PRIMARY KEY CHECK (weekday BETWEEN 1 AND 7),
        effort  TEXT NOT NULL CHECK (effort IN ('kurz', 'normal', 'entspannt'))
      );
    `);

    // `CREATE TABLE IF NOT EXISTS` leaves a table that is already there alone,
    // so the two columns that arrived after `items` did need their own step.
    // Only a database from before the ledger reaches these.
    if (!hasColumn(db, 'items', 'component')) {
      db.exec("ALTER TABLE items ADD COLUMN component TEXT CHECK (component IN ('base', 'vegetable', 'protein', 'extra', 'whole'))");
    }
    if (!hasColumn(db, 'items', 'retired')) {
      db.exec('ALTER TABLE items ADD COLUMN retired INTEGER NOT NULL DEFAULT 0');
    }
  },

  // 2 — vegetarian goes. Whatever is usually meat has a meatless version, and
  // there is always something on the table the two can eat, so the flag said
  // nothing the family did not already know.
  (db) => {
    if (hasColumn(db, 'items', 'vegetarian')) db.exec('ALTER TABLE items DROP COLUMN vegetarian');
  },
];

/** Bring a database up to the last step. Running it again does nothing. */
export function migrate(db: Database): void {
  const applied = db.query<{ user_version: number }, []>('PRAGMA user_version').get()!.user_version;

  for (const [index, step] of MIGRATIONS.entries()) {
    if (index < applied) continue;
    // The step and the count it raises land together: a step that throws
    // leaves the database at the version it had.
    db.transaction(() => {
      step(db);
      // The one value in the app written into SQL instead of bound — a PRAGMA
      // takes no parameter. It is a loop index, never anything from outside.
      db.exec(`PRAGMA user_version = ${index + 1}`);
    })();
  }
}

const path = process.env.TABLE_SIX_DB ?? new URL('../data/table-six.db', import.meta.url).pathname;

export const db = new Database(path, { create: true });

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

migrate(db);
