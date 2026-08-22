// Schema and every SQL statement in the app. Callers get functions, never a
// query string — that keeps binding (and therefore escaping) in one file.
import { Database } from 'bun:sqlite';

export type Effort = 'kurz' | 'normal' | 'entspannt';

/** Ascending: an evening blows the day when its hardest item ranks higher. */
export const EFFORT_ORDER: Effort[] = ['kurz', 'normal', 'entspannt'];

/**
 * What an item contributes to a plate. `whole` is an evening on its own —
 * Lasagne, Reste, kaltes Abendbrot — and wants nothing beside it. Null until
 * someone says otherwise: an unsorted item is normal, not a defect, and it
 * ranks like any other.
 */
export type Component = 'base' | 'vegetable' | 'protein' | 'extra' | 'whole';
export const COMPONENTS: Component[] = ['base', 'vegetable', 'protein', 'extra', 'whole'];

export type Item = {
  id: number;
  name: string;
  vegetarian: boolean;
  effort: Effort;
  component: Component | null;
  /** ISO date of the latest evening this item is planned for, or null. */
  last_used: string | null;
};

const path = process.env.TABLE_SIX_DB ?? new URL('../data/table-six.db', import.meta.url).pathname;
export const db = new Database(path, { create: true });

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL COLLATE NOCASE UNIQUE,
    vegetarian INTEGER NOT NULL DEFAULT 0,
    effort     TEXT NOT NULL DEFAULT 'normal' CHECK (effort IN ('kurz', 'normal', 'entspannt')),
    component  TEXT CHECK (component IN ('base', 'vegetable', 'protein', 'extra', 'whole')),
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

// `CREATE TABLE IF NOT EXISTS` leaves a table that is already there alone, so
// a column that arrives later needs its own step. The family's database is
// older than `component`.
const hasColumn = (table: string, column: string): boolean =>
  db.query('SELECT 1 FROM pragma_table_info(?) WHERE name = ?').get(table, column) !== null;

if (!hasColumn('items', 'component')) {
  db.exec("ALTER TABLE items ADD COLUMN component TEXT CHECK (component IN ('base', 'vegetable', 'protein', 'extra', 'whole'))");
}

// ── items ────────────────────────────────────────────────────────────────────

const ITEM_COLUMNS = `
  items.id, items.name, items.vegetarian, items.effort, items.component,
  (SELECT MAX(plan.date) FROM plan WHERE plan.item_id = items.id) AS last_used
`;

type ItemRow = {
  id: number;
  name: string;
  vegetarian: number;
  effort: Effort;
  component: Component | null;
  last_used: string | null;
};

const toItem = (row: ItemRow): Item => ({ ...row, vegetarian: row.vegetarian === 1 });

/** The inventory, most recently planned first — the order `Bestand` shows. */
const listItemsStmt = db.query<ItemRow, []>(
  `SELECT ${ITEM_COLUMNS} FROM items ORDER BY last_used DESC NULLS LAST, items.name COLLATE NOCASE`,
);
const getItemStmt = db.query<ItemRow, [number]>(`SELECT ${ITEM_COLUMNS} FROM items WHERE items.id = ?`);
const insertItemStmt = db.query<{ id: number }, [string, number, Effort, Component | null]>(
  'INSERT INTO items (name, vegetarian, effort, component) VALUES (?, ?, ?, ?) RETURNING id',
);
const updateItemStmt = db.query<null, [string, number, Effort, Component | null, number]>(
  'UPDATE items SET name = ?, vegetarian = ?, effort = ?, component = ? WHERE id = ?',
);
const deleteItemStmt = db.query<null, [number]>('DELETE FROM items WHERE id = ?');

export const listItems = (): Item[] => listItemsStmt.all().map(toItem);

export const getItem = (id: number): Item | null => {
  const row = getItemStmt.get(id);
  return row ? toItem(row) : null;
};

export function createItem(name: string, vegetarian: boolean, effort: Effort, component: Component | null = null): Item {
  const { id } = insertItemStmt.get(name, vegetarian ? 1 : 0, effort, component)!;
  return getItem(id)!;
}

export function updateItem(
  id: number,
  name: string,
  vegetarian: boolean,
  effort: Effort,
  component: Component | null,
): Item | null {
  updateItemStmt.run(name, vegetarian ? 1 : 0, effort, component, id);
  return getItem(id);
}

export const deleteItem = (id: number): void => void deleteItemStmt.run(id);

const mergePlanStmt = db.query<null, [number, number]>(
  // Keep the evening: the target takes over every date the source was on,
  // unless it is already there.
  `INSERT OR IGNORE INTO plan (date, item_id, position)
   SELECT date, ?, position FROM plan WHERE item_id = ?`,
);

/** Fold `sourceId` into `targetId`: every evening survives, the source is gone. */
export const mergeItems = db.transaction((sourceId: number, targetId: number): Item | null => {
  mergePlanStmt.run(targetId, sourceId);
  deleteItemStmt.run(sourceId);
  return getItem(targetId);
});

// ── plan ─────────────────────────────────────────────────────────────────────

const planRangeStmt = db.query<ItemRow & { date: string }, [string, string]>(
  `SELECT plan.date, ${ITEM_COLUMNS}
   FROM plan JOIN items ON items.id = plan.item_id
   WHERE plan.date BETWEEN ? AND ?
   ORDER BY plan.date, plan.position`,
);
const addToPlanStmt = db.query<null, [string, number, string]>(
  `INSERT OR IGNORE INTO plan (date, item_id, position)
   VALUES (?1, ?2, (SELECT COALESCE(MAX(position), 0) + 1 FROM plan WHERE date = ?3))`,
);
const removeFromPlanStmt = db.query<null, [string, number]>('DELETE FROM plan WHERE date = ? AND item_id = ?');

/** date → the plate of that evening, in the order the items were added. */
export function planBetween(from: string, to: string): Map<string, Item[]> {
  const plates = new Map<string, Item[]>();
  for (const { date, ...row } of planRangeStmt.all(from, to)) {
    const plate = plates.get(date) ?? [];
    plate.push(toItem(row));
    plates.set(date, plate);
  }
  return plates;
}

export const addToPlan = (date: string, itemId: number): void => void addToPlanStmt.run(date, itemId, date);
export const removeFromPlan = (date: string, itemId: number): void => void removeFromPlanStmt.run(date, itemId);

// ── pairs ────────────────────────────────────────────────────────────────────

const sharedEveningsStmt = db.query<{ id: number; partner_id: number; date: string }, [string]>(
  // The plate arrives as one bound JSON array: a variable IN list would mean
  // building SQL around values, and values are bound here, never written in.
  `SELECT other.item_id AS id, plate.item_id AS partner_id, other.date AS date
   FROM plan plate
   JOIN plan other ON other.date = plate.date AND other.item_id != plate.item_id
   WHERE plate.item_id IN (SELECT value FROM json_each(?))
   ORDER BY other.date`,
);

/**
 * Every evening on which an item shared a plate with one of `itemIds`, oldest
 * first. The evening being planned answers itself here — whatever is on it is
 * on the plate, and the plate is never its own suggestion.
 */
export const sharedEvenings = (itemIds: number[]) => sharedEveningsStmt.all(JSON.stringify(itemIds));

// ── effort grid ──────────────────────────────────────────────────────────────

const effortGridStmt = db.query<{ weekday: number; effort: Effort }, []>('SELECT weekday, effort FROM weekday_effort');
const setEffortStmt = db.query<null, [number, Effort]>(
  'INSERT INTO weekday_effort (weekday, effort) VALUES (?, ?) ON CONFLICT (weekday) DO UPDATE SET effort = excluded.effort',
);

/** weekday (1 = Monday) → level; days never touched are `normal`. */
export function effortGrid(): Record<number, Effort> {
  const grid: Record<number, Effort> = { 1: 'normal', 2: 'normal', 3: 'normal', 4: 'normal', 5: 'normal', 6: 'normal', 7: 'normal' };
  for (const { weekday, effort } of effortGridStmt.all()) grid[weekday] = effort;
  return grid;
}

export const setWeekdayEffort = (weekday: number, effort: Effort): void => void setEffortStmt.run(weekday, effort);
