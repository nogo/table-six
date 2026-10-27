// The socket is an accelerator, never a dependency: it says that something
// changed, the client refetches what it shows over HTTP. If it never connects, everything still works
// — the same reload runs on focus and on reconnect.
import { reload } from './app.js';

const RETRY = 3000;

/** @type {WebSocket | null} */
let socket = null;

function connect() {
  if (socket && socket.readyState <= WebSocket.OPEN) return;
  socket = new WebSocket(`ws://${location.host}/ws`);
  socket.addEventListener('open', () => reload()); // whatever changed while it was down
  socket.addEventListener('message', () => reload()); // the only message is `changed`
  socket.addEventListener('close', () => setTimeout(connect, RETRY));
  socket.addEventListener('error', () => socket?.close());
}

export function startSync() {
  connect();
  // Coming back to the app is the other moment the week can be stale.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    connect();
    reload();
  });
}
