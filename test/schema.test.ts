import { expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { migrate } from '../src/schema.ts';

const columns = (db: Database, table: string): string[] =>
  db.query<{ name: string }, [string]>('SELECT name FROM pragma_table_info(?)').all(table).map((row) => row.name);

const version = (db: Database): number =>
  db.query<{ user_version: number }, []>('PRAGMA user_version').get()!.user_version;

/** The database as it was before `component` and `retired`: what the family runs. */
function beforeTheLedger(): Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE items (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL COLLATE NOCASE UNIQUE,
      vegetarian INTEGER NOT NULL DEFAULT 0,
      effort     TEXT NOT NULL DEFAULT 'normal',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO items (name) VALUES ('Kartoffeln'), ('Brokkoli');
  `);
  return db;
}

test('an empty database comes out with the whole schema', () => {
  const db = new Database(':memory:');
  migrate(db);

  expect(columns(db, 'items')).toContain('component');
  expect(columns(db, 'items')).toContain('retired');
  expect(columns(db, 'items')).not.toContain('vegetarian');
  expect(columns(db, 'plan')).toEqual(['date', 'item_id', 'position']);
  expect(columns(db, 'weekday_effort')).toEqual(['weekday', 'effort']);
  expect(version(db)).toBe(3);
});

test('a database from before the ledger gets the missing columns and keeps its items', () => {
  const db = beforeTheLedger();
  migrate(db);

  expect(columns(db, 'items')).toContain('component');
  expect(columns(db, 'items')).toContain('retired');
  expect(columns(db, 'items')).not.toContain('vegetarian');
  expect(db.query<{ n: number }, []>('SELECT count(*) AS n FROM items').get()!.n).toBe(2);
  expect(version(db)).toBe(3);
});

test('migrating a second time changes nothing', () => {
  const db = beforeTheLedger();
  migrate(db);
  db.exec("UPDATE items SET component = 'base' WHERE name = 'Kartoffeln'");

  migrate(db);

  expect(db.query<{ component: string | null }, [string]>('SELECT component FROM items WHERE name = ?').get('Kartoffeln'))
    .toEqual({ component: 'base' });
  expect(version(db)).toBe(3);
});

test('a step that throws leaves the database at the version it had', () => {
  const db = new Database(':memory:');
  migrate(db);

  expect(() =>
    db.transaction(() => {
      db.exec('ALTER TABLE items ADD COLUMN nonsense TEXT');
      db.exec('PRAGMA user_version = 4');
      throw new Error('half a step');
    })(),
  ).toThrow('half a step');

  expect(columns(db, 'items')).not.toContain('nonsense');
  expect(version(db)).toBe(3);
});

test('the draft migration keeps a version two plan intact', () => {
  const db = beforeTheLedger();
  migrate(db);
  db.exec("DROP TABLE drafts; PRAGMA user_version = 2; INSERT INTO plan VALUES ('2026-10-26', 1, 1)");
  migrate(db);
  expect(columns(db, 'drafts')).toEqual(['id', 'date', 'proposed_on', 'items']);
  expect(db.query('SELECT * FROM plan').all()).toEqual([{ date: '2026-10-26', item_id: 1, position: 1 }]);
  expect(version(db)).toBe(3);
  db.close();
});
