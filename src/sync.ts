// The socket only says that something changed; the clients refetch what they
// show over HTTP. SQLite stays the truth, so a broadcast that never arrives
// costs nothing. There are no scopes: a household's week, inventory and one
// ranking are three small requests, and knowing which of them a write moved
// was knowledge kept in two places that drifted apart.

let publisher: () => void = () => {};

/** The server hands in its broadcast once it is listening. */
export const onChange = (fn: () => void): void => void (publisher = fn);

/** Call after every write that went through — never after a refused one. */
export const changed = (): void => publisher();
