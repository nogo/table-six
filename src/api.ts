// The JSON API. Every mutation the family can make goes through here — the
// server is the only writer, SQLite is the truth.
import {
  COMPONENTS,
  EFFORT_ORDER,
  addToPlan,
  createItem,
  deleteItem,
  getItem,
  listItems,
  mergeItems,
  removeFromPlan,
  setWeekdayEffort,
  updateItem,
  type Component,
  type Effort,
  type Item,
} from './db.ts';
import { isIsoDate, today, weekStart } from './dates.ts';
import { fillEvening, suggest } from './suggest.ts';
import { publish } from './sync.ts';
import { buildWeek } from './week.ts';

const bad = (message: string) => Response.json({ error: message }, { status: 400 });
const missing = () => Response.json({ error: 'not found' }, { status: 404 });
const done = () => new Response(null, { status: 204 });

const isEffort = (value: unknown): value is Effort => EFFORT_ORDER.includes(value as Effort);

/** An item nobody has sorted yet is `null`, and that is a legitimate value. */
const isComponent = (value: unknown): value is Component | null =>
  value === null || COMPONENTS.includes(value as Component);

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Item names are compared and stored trimmed — " Reis " and "Reis" are one item. */
const cleanName = (value: unknown): string | null => {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return name.length > 0 && name.length <= 60 ? name : null;
};

const asId = (value: string | undefined): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const routes = {
  // One week, Monday to Sunday. `start` is any day inside it.
  '/api/week': (request: Request) => {
    const start = new URL(request.url).searchParams.get('start') ?? today();
    if (!isIsoDate(start)) return bad('start must be YYYY-MM-DD');
    return Response.json(buildWeek(weekStart(start)));
  },

  // The ranked inventory for one evening, each item with the reason it sits
  // where it sits. Searching stays on the client: this is the order, not a
  // filter.
  '/api/suggestions/:date': (request: Request & { params: { date: string } }) => {
    const { date } = request.params;
    if (!isIsoDate(date)) return bad('date must be YYYY-MM-DD');
    return Response.json(suggest(date));
  },

  '/api/items': {
    // The inventory in suggestion order: most recently planned first.
    GET: () => Response.json(listItems()),

    // Creating is as cheap as planning: a name is enough. A name that already
    // exists hands back the item it names instead of refusing — the search
    // field creates and finds through the same gesture.
    POST: async (request: Request) => {
      const fields = await body(request);
      const name = cleanName(fields.name);
      if (!name) return bad('name must be 1–60 characters');
      const effort = fields.effort === undefined ? 'normal' : fields.effort;
      if (!isEffort(effort)) return bad(`effort must be one of ${EFFORT_ORDER.join(', ')}`);
      const component = fields.component === undefined ? null : fields.component;
      if (!isComponent(component)) return bad(`component must be null or one of ${COMPONENTS.join(', ')}`);
      const existing = listItems().find((item) => item.name.toLowerCase() === name.toLowerCase());
      if (existing) return Response.json(existing);
      const item = createItem(name, fields.vegetarian === true, effort, component);
      publish('items');
      return Response.json(item, { status: 201 });
    },
  },

  '/api/items/:id': {
    PATCH: async (request: Request & { params: { id: string } }) => {
      const id = asId(request.params.id);
      const item = id === null ? null : getItem(id);
      if (!item) return missing();

      const fields = await body(request);
      const name = fields.name === undefined ? item.name : cleanName(fields.name);
      if (!name) return bad('name must be 1–60 characters');
      const effort = fields.effort === undefined ? item.effort : fields.effort;
      if (!isEffort(effort)) return bad(`effort must be one of ${EFFORT_ORDER.join(', ')}`);
      const vegetarian = fields.vegetarian === undefined ? item.vegetarian : fields.vegetarian === true;
      const component = fields.component === undefined ? item.component : fields.component;
      if (!isComponent(component)) return bad(`component must be null or one of ${COMPONENTS.join(', ')}`);

      const clash = listItems().find(
        (other) => other.id !== item.id && other.name.toLowerCase() === name.toLowerCase(),
      );
      if (clash) return Response.json({ error: 'name exists', item: clash }, { status: 409 });

      const updated = updateItem(item.id, name, vegetarian, effort, component) as Item;
      publish('items'); // a name travels onto every board it is planned on
      return Response.json(updated);
    },

    // Deleting an item takes it off every evening it was on. That is the point:
    // the inventory is curated, and a mistake should leave no trace.
    DELETE: (request: Request & { params: { id: string } }) => {
      const id = asId(request.params.id);
      if (id === null || !getItem(id)) return missing();
      deleteItem(id);
      publish('items');
      return done();
    },
  },

  // Fold the many spellings of one item together without losing an evening.
  '/api/items/:id/merge': {
    POST: async (request: Request & { params: { id: string } }) => {
      const source = asId(request.params.id);
      const target = asId(String((await body(request)).into));
      if (source === null || target === null || source === target) return bad('into must be another item');
      if (!getItem(source) || !getItem(target)) return missing();
      const merged = mergeItems(source, target) as Item;
      publish('items');
      return Response.json(merged);
    },
  },

  // One tap adds, one tap removes — written immediately, nothing to confirm.
  '/api/plan/:date/:itemId': {
    PUT: (request: Request & { params: { date: string; itemId: string } }) => {
      const { date, itemId } = request.params;
      const id = asId(itemId);
      if (!isIsoDate(date)) return bad('date must be YYYY-MM-DD');
      if (id === null || !getItem(id)) return missing();
      addToPlan(date, id);
      publish(`week:${weekStart(date)}`);
      return done();
    },

    DELETE: (request: Request & { params: { date: string; itemId: string } }) => {
      const { date, itemId } = request.params;
      const id = asId(itemId);
      if (!isIsoDate(date) || id === null) return bad('date must be YYYY-MM-DD');
      removeFromPlan(date, id);
      publish(`week:${weekStart(date)}`);
      return done();
    },
  },

  // Propose an evening rather than pick it item by item. It writes straight
  // into the plan — every item is one tap away from gone, so there is nothing
  // to confirm and nothing to undo.
  '/api/plan/:date/fill': {
    POST: (request: Request & { params: { date: string } }) => {
      const { date } = request.params;
      if (!isIsoDate(date)) return bad('date must be YYYY-MM-DD');
      fillEvening(date);
      publish(`week:${weekStart(date)}`);
      return done();
    },
  },

  // The level belongs to the weekday, not to the date: setting it here sets it
  // for every Wednesday.
  '/api/effort/:weekday': {
    PUT: async (request: Request & { params: { weekday: string } }) => {
      const weekday = Number(request.params.weekday);
      const { effort } = await body(request);
      if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return bad('weekday must be 1–7');
      if (!isEffort(effort)) return bad(`effort must be one of ${EFFORT_ORDER.join(', ')}`);
      setWeekdayEffort(weekday, effort);
      publish('weeks'); // the level recurs, so every week on every screen moved
      return done();
    },
  },
};
