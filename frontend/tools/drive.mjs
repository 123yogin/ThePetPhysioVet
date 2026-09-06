// Drives the running app inside the Android WebView over the Chrome DevTools
// Protocol. Screenshots prove a screen rendered; only a DOM query proves its
// controls are reachable, which is what CLAUDE.md's shell-unification note
// insists on after an overflow-only sweep once passed a completely unusable nav.
const CDP_PORT = process.env.CDP_PORT || 9222;

async function target() {
  const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json`);
  const pages = await res.json();
  const page = pages.find((p) => p.type === 'page' && p.webSocketDebuggerUrl);
  if (!page) throw new Error('no debuggable page; is the app running?');
  return page.webSocketDebuggerUrl;
}

export async function connect() {
  const ws = new globalThis.WebSocket(await target());
  await new Promise((ok, fail) => {
    ws.addEventListener('open', ok, { once: true });
    ws.addEventListener('error', fail, { once: true });
  });

  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    const slot = pending.get(msg.id);
    if (!slot) return;
    pending.delete(msg.id);
    msg.error ? slot.fail(new Error(msg.error.message)) : slot.ok(msg.result);
  });

  const send = (method, params = {}) =>
    new Promise((ok, fail) => {
      const msgId = ++id;
      pending.set(msgId, { ok, fail });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression: `(async () => { ${expression} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? 'evaluate threw');
    }
    return res.result.value;
  };

  // Screenshots a CSS-pixel rect. adb screencap frames the whole device, which
  // makes it guesswork whether something sits under the status bar or is simply
  // scrolled; a clip rect answers that exactly.
  const capture = async (clip) => {
    const res = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { ...clip, scale: 1 },
      captureBeyondViewport: false,
    });
    return Buffer.from(res.data, 'base64');
  };

  return { evaluate, capture, close: () => ws.close() };
}
