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

/** @param {string} name @param {{vegetarian?: boolean, effort?: string}} [fields] */
export const createItem = (name, fields = {}) => send('POST', '/api/items', { name, ...fields });

/** @param {number} id @param {{name?: string, vegetarian?: boolean, effort?: string}} fields */
export const patchItem = (id, fields) => send('PATCH', `/api/items/${id}`, fields);

/** @param {number} id */
export const deleteItem = (id) => send('DELETE', `/api/items/${id}`);

/** @param {number} id @param {number} into fold `id` into `into`, keeping every evening */
export const mergeItem = (id, into) => send('POST', `/api/items/${id}/merge`, { into });

/** @param {string} date @param {number} itemId */
export const addToPlan = (date, itemId) => send('PUT', `/api/plan/${date}/${itemId}`);

/** @param {string} date @param {number} itemId */
export const removeFromPlan = (date, itemId) => send('DELETE', `/api/plan/${date}/${itemId}`);

/** @param {number} weekday 1 = Monday @param {string} effort */
export const setWeekdayEffort = (weekday, effort) => send('PUT', `/api/effort/${weekday}`, { effort });
