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
  removeFromPlan,
  setWeekdayEffort,
  updateItem,
  wasPlanned,
  type Component,
  type Effort,
  type Item,
  type ItemFields,
} from './db.ts';
import { isIsoDate, today, weekStart } from './dates.ts';
import { fillEvening, suggest } from './suggest.ts';
import { changed } from './sync.ts';
import { buildWeek } from './week.ts';
import { proposeWeek } from './propose.ts';

const bad = (message: string) => Response.json({ error: message }, { status: 400 });
const missing = () => Response.json({ error: 'not found' }, { status: 404 });
const done = () => new Response(null, { status: 204 });

const isEffort = (value: unknown): value is Effort => EFFORT_ORDER.includes(value as Effort);
const EFFORT_REFUSED = `effort must be one of ${EFFORT_ORDER.join(', ')}`;

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

/** Names are one item whatever their case: "reis" finds "Reis". */
const named = (name: string): Item | undefined =>
  listItems().find((item) => item.name.toLowerCase() === name.toLowerCase());

/**
 * The item a request asks for: every field the body names, checked, and
 * `base` for the ones it leaves out. A string is what to refuse it with.
 */
function readItem(fields: Record<string, unknown>, base: ItemFields): ItemFields | string {
  const name = fields.name === undefined ? base.name : cleanName(fields.name);
  if (!name) return 'name must be 1–60 characters';
  const effort = fields.effort === undefined ? base.effort : fields.effort;
  if (!isEffort(effort)) return EFFORT_REFUSED;
  const component = fields.component === undefined ? base.component : fields.component;
  if (!isComponent(component)) return `component must be null or one of ${COMPONENTS.join(', ')}`;
  const retired = fields.retired === undefined ? base.retired : fields.retired === true;
  return { name, effort, component, retired };
}

const asId = (value: string | undefined): number | null => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const routes = {
  '/api/week/:date/propose': {
    POST: (request: Request & { params: { date: string } }) => {
      const { date } = request.params;
      if (!isIsoDate(date)) return bad('date must be YYYY-MM-DD');
      const result = proposeWeek(date);
      if (result.filled > 0) changed();
      return Response.json(result);
    },
  },
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
      // No name in the base: a new item needs one from the body.
      const fields = readItem(await body(request), { name: '', effort: 'normal', component: null, retired: false });
      if (typeof fields === 'string') return bad(fields);
      const existing = named(fields.name);
      if (existing) return Response.json(existing);
      const item = createItem(fields.name, fields.effort, fields.component);
      changed();
      return Response.json(item, { status: 201 });
    },
  },

  '/api/items/:id': {
    PATCH: async (request: Request & { params: { id: string } }) => {
      const id = asId(request.params.id);
      const item = id === null ? null : getItem(id);
      if (!item) return missing();

      const fields = readItem(await body(request), item);
      if (typeof fields === 'string') return bad(fields);

      const clash = named(fields.name);
      if (clash && clash.id !== item.id) return Response.json({ error: 'name exists', item: clash }, { status: 409 });

      const updated = updateItem(item.id, fields) as Item;
      changed();
      return Response.json(updated);
    },

    // Deleting takes the item off every evening it was on — `plan` cascades —
    // so it is only offered where there is nothing to lose. An item the family
    // has actually eaten is retired instead: it keeps its evenings, it stops
    // being proposed, and it can come back.
    DELETE: (request: Request & { params: { id: string } }) => {
      const id = asId(request.params.id);
      if (id === null || !getItem(id)) return missing();
      if (wasPlanned(id)) {
        return Response.json({ error: 'item has been planned; retire it instead' }, { status: 409 });
      }
      deleteItem(id);
      changed();
      return done();
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
      changed();
      return done();
    },

    DELETE: (request: Request & { params: { date: string; itemId: string } }) => {
      const { date, itemId } = request.params;
      const id = asId(itemId);
      if (!isIsoDate(date) || id === null) return bad('date must be YYYY-MM-DD');
      removeFromPlan(date, id);
      changed();
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
      changed();
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
      if (!isEffort(effort)) return bad(EFFORT_REFUSED);
      setWeekdayEffort(weekday, effort);
      changed();
      return done();
    },
  },
};
