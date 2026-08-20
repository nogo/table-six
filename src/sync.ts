// The socket only says what changed; the clients refetch it over HTTP.
// SQLite stays the truth, so a broadcast that never arrives costs nothing.

/** `items`, `weeks` (every week: a level or a name moved), `week:2026-08-17`. */
export type Scope = string;

let publisher: (scope: Scope) => void = () => {};

/** The server hands in its broadcast once it is listening. */
export const onPublish = (fn: (scope: Scope) => void): void => void (publisher = fn);

export const publish = (scope: Scope): void => publisher(scope);
