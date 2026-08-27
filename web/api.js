// The one seam to the server. Components never fetch — they call this.
// Every mutation is a request; the server broadcasts what changed and the
// clients refetch. No optimistic state, no merge.

/** @param {string} path @param {RequestInit} [options] */
async function request(path, options) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  if (!response.ok) throw new Error(`${options?.method ?? 'GET'} ${path} → ${response.status}`);
  return response.status === 204 ? null : response.json();
}

/** @param {string} path @param {unknown} body */
const send = (method, path, body) =>
  request(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

/** @param {string} [start] ISO date of any day in the week; omitted = this week */
export const getWeek = (start) => request(`/api/week${start ? `?start=${start}` : ''}`);

export const getItems = () => request('/api/items');

/** The inventory ranked for one evening, each item with its reason.
 *  @param {string} date */
export const getSuggestions = (date) => request(`/api/suggestions/${date}`);

/** @param {string} name @param {{vegetarian?: boolean, effort?: string, component?: string | null}} [fields] */
export const createItem = (name, fields = {}) => send('POST', '/api/items', { name, ...fields });

/** @param {number} id
 *  @param {{name?: string, vegetarian?: boolean, effort?: string, component?: string | null, retired?: boolean}} fields */
export const patchItem = (id, fields) => send('PATCH', `/api/items/${id}`, fields);

/** Only for an item nobody has cooked; one that has been on an evening is
 *  retired with `patchItem(id, { retired: true })` instead.
 *  @param {number} id */
export const deleteItem = (id) => send('DELETE', `/api/items/${id}`);

/** @param {string} date @param {number} itemId */
export const addToPlan = (date, itemId) => send('PUT', `/api/plan/${date}/${itemId}`);

/** Let the app propose the evening. Only ever fills a day that is still empty.
 *  @param {string} date */
export const fillDay = (date) => send('POST', `/api/plan/${date}/fill`);

/** @param {string} date @param {number} itemId */
export const removeFromPlan = (date, itemId) => send('DELETE', `/api/plan/${date}/${itemId}`);

/** @param {number} weekday 1 = Monday @param {string} effort */
export const setWeekdayEffort = (weekday, effort) => send('PUT', `/api/effort/${weekday}`, { effort });
