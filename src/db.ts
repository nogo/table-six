// Every SQL statement in the app. Callers get functions, never a query string
// — that keeps binding (and therefore escaping) in one file. The schema and
// its migrations live next door in `src/schema.ts`.
import { db } from './schema.ts';

export { db };

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
  /** Out of rotation: it keeps every evening it was on, it is never proposed. */
  retired: boolean;
  /** ISO date of the latest evening this item is planned for, or null. */
  last_used: string | null;
};

// ── items ────────────────────────────────────────────────────────────────────

const ITEM_COLUMNS = `
  items.id, items.name, items.vegetarian, items.effort, items.component, items.retired,
  (SELECT MAX(plan.date) FROM plan WHERE plan.item_id = items.id) AS last_used
`;

type ItemRow = {
  id: number;
  name: string;
  vegetarian: number;
  effort: Effort;
  component: Component | null;
  retired: number;
  last_used: string | null;
};

const toItem = (row: ItemRow): Item => ({
  ...row,
  vegetarian: row.vegetarian === 1,
  retired: row.retired === 1,
});

/** The inventory, most recently planned first — the order `Bestand` shows. */
const listItemsStmt = db.query<ItemRow, []>(
  `SELECT ${ITEM_COLUMNS} FROM items ORDER BY last_used DESC NULLS LAST, items.name COLLATE NOCASE`,
);
const getItemStmt = db.query<ItemRow, [number]>(`SELECT ${ITEM_COLUMNS} FROM items WHERE items.id = ?`);
const insertItemStmt = db.query<{ id: number }, [string, number, Effort, Component | null]>(
  'INSERT INTO items (name, vegetarian, effort, component) VALUES (?, ?, ?, ?) RETURNING id',
);
const updateItemStmt = db.query<null, [string, number, Effort, Component | null, number, number]>(
  'UPDATE items SET name = ?, vegetarian = ?, effort = ?, component = ?, retired = ? WHERE id = ?',
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

/** Everything an item is, in one go — the PATCH route fills in what it kept. */
export type ItemFields = {
  name: string;
  vegetarian: boolean;
  effort: Effort;
  component: Component | null;
  retired: boolean;
};

export function updateItem(id: number, fields: ItemFields): Item | null {
  const { name, vegetarian, effort, component, retired } = fields;
  updateItemStmt.run(name, vegetarian ? 1 : 0, effort, component, retired ? 1 : 0, id);
  return getItem(id);
}

export const deleteItem = (id: number): void => void deleteItemStmt.run(id);

const wasPlannedStmt = db.query<{ one: number }, [number]>('SELECT 1 AS one FROM plan WHERE item_id = ? LIMIT 1');

/**
 * Has this item ever been on an evening? Deleting one that has takes those
 * evenings with it — `plan` cascades — so that is the line between deleting
 * an item and retiring it.
 */
export const wasPlanned = (id: number): boolean => wasPlannedStmt.get(id) !== null;

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
