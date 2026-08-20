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
