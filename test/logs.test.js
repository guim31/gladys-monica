// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only. A normal reading writes nothing, a failure that repeats is logged
// once, and its end once. Never the access token, never a contact's name or
// a reminder's title, at any level (privacy: Monica is a personal CRM).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOUR, TOKEN, createClock, createWorld } from './helpers/world.js';

function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  t.mock.method(console, 'warn', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

async function world(t, options = {}) {
  const w = await createWorld({ clock: createClock(), ...options });
  t.after(() => w.app.stop());
  return w;
}

test('a normal reading cycle writes nothing at info', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  assert.ok(
    logs.texts().some((text) => text.includes('Connected to Monica')),
    'the start is logged',
  );
  logs.clear();
  for (let i = 0; i < 5; i += 1) {
    w.clock.advance(HOUR);
    w.server.contact(5).first_name = `Emma ${i}`;
    await w.hub.poll();
  }
  assert.ok(w.fake.sceneEvents.length > 0, 'the events of the day fired meanwhile');
  assert.deepEqual(logs.texts(), []);
});

test('an outage is logged once, and once when Monica is back', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.server.online = false;
  for (let i = 0; i < 6; i += 1) {
    w.clock.advance(60_000);
    await w.hub.poll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  logs.clear();
  w.server.online = true;
  await w.hub.poll();
  await w.hub.poll();
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /answers again after 5 min/);
});

test('never a name, a title or the token, even at debug', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await world(t);
  w.clock.advance(3 * HOUR);
  await w.hub.poll();
  await w.fake.sceneAction('read_week_birthdays', {});
  await w.fake.action('test_connection', {});
  await w.fake.widgetGet('upcoming');
  w.server.failWith = 500;
  await w.hub.poll();
  assert.ok(w.fake.sceneEvents.length > 0);
  const text = logs.texts().join('\n');
  for (const secret of [TOKEN, 'Alice', 'Martin', 'Bruno', 'Chlo', 'Appeler', 'mariage', '1990']) {
    assert.ok(!text.includes(secret), `the logs show "${secret}"`);
  }

  const refused = await world(t, {
    config: { url: 'http://192.0.2.30', api_token: 'secret-wrong-token' },
  });
  await refused.hub.poll();
  assert.ok(!logs.texts().join('\n').includes('secret-wrong-token'), 'never a refused token');
});
