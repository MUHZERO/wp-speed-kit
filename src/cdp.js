function errorMessage(error) {
  return error?.message || String(error);
}

export async function connectPage(port) {
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then(async (response) => {
    if (!response.ok) throw new Error(`Chrome target discovery failed: ${response.status}`);
    return response.json();
  });
  const target = targets.find(({ type }) => type === 'page');
  if (!target) throw new Error('Chrome has no page target');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;
  let closed = false;

  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }
    for (const handler of listeners.get(message.method) || []) handler(message.params);
  });
  const rejectPending = (reason) => {
    if (closed) return;
    closed = true;
    for (const { reject } of pending.values()) reject(new Error(reason));
    pending.clear();
  };
  socket.addEventListener('close', () => rejectPending('CDP connection closed'));
  socket.addEventListener('error', (event) => rejectPending(`CDP connection error: ${errorMessage(event.error)}`));
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', (event) => reject(event.error || new Error('CDP connection failed')), { once: true });
  });

  return {
    send(method, params = {}) {
      if (closed) return Promise.reject(new Error('CDP connection closed'));
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try {
          socket.send(JSON.stringify({ id, method, params }));
        } catch (error) {
          pending.delete(id);
          reject(error);
        }
      });
    },
    on(event, handler) {
      const handlers = listeners.get(event) || [];
      handlers.push(handler);
      listeners.set(event, handlers);
    },
    close() {
      rejectPending('CDP connection closed');
      socket.close();
    },
  };
}
