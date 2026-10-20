// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and a fake Monica
// serving real answers: device and states, scene events at the event hour
// (once a day, restart included), errors, the scene action, the test action.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOUR,
  BASE_CONFIG,
  createAll,
  createClock,
  createWorld,
  deviceId,
} from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const states = (w) => {
  const ids = deviceId(w.gladys);
  return {
    today: w.fake.lastState(ids.feature('birthdays_today')),
    week: w.fake.lastState(ids.feature('birthdays_week')),
    reminders: w.fake.lastState(ids.feature('reminders_today')),
    days: w.fake.lastState(ids.feature('next_birthday_days')),
    next: w.fake.lastState(ids.feature('next_birthday')),
  };
};

const events = (w) =>
  w.fake.sceneEvents.map(
    ({ key, data }) => `${key}:${data.name ?? data.title}${data.days ? `:${data.days}` : ''}`,
  );

test('one Monica device, its states read from the real answers', async (t) => {
  const w = await world(t);
  assert.equal(w.fake.discoveredDevices.length, 1);
  const [device] = w.fake.discoveredDevices;
  assert.equal(device.name, 'Monica');
  assert.equal(device.external_id, deviceId(w.gladys).device);
  assert.equal(device.should_poll, false);
  assert.deepEqual(states(w), { today: 2, week: 4, reminders: 3, days: 0, next: 'Alice Martin' });
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.deepEqual(w.fake.transports.at(-1), {
    device_external_id: device.external_id,
    transport: 'local',
  });
  // Read only: never anything but GET, and pages of 100.
  assert.ok(w.server.requests.every((request) => request.method === 'GET'));
});

test('the scene events fire at the event hour, once a day, restart included', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock });
  assert.deepEqual(w.fake.sceneEvents, [], 'not before 08:00');

  clock.advance(HOUR); // 08:00 in Paris
  await w.hub.poll();
  assert.deepEqual(events(w), [
    'birthday_today:Alice Martin',
    'birthday_today:Bruno',
    'birthday_upcoming:Chloé Durand:4',
    'birthday_upcoming:Inès:6',
    'reminder_today:Anniversaire de mariage',
    'reminder_today:Appeler Bruno',
    'reminder_today:Prendre des nouvelles de Chloé',
  ]);
  assert.deepEqual(w.fake.sceneEvents[0].data, {
    name: 'Alice Martin',
    first_name: 'Alice',
    contact_id: 1,
    age: 36,
    date: '2026-10-20',
  });
  assert.equal(w.fake.sceneEvents[1].data.age, null, 'year unknown: no age');
  assert.deepEqual(w.fake.sceneEvents[4].data, {
    title: 'Anniversaire de mariage',
    reminder_id: 8,
    contact_name: 'Alice Martin',
    contact_id: 1,
  });

  clock.advance(HOUR);
  await w.hub.poll();
  assert.equal(w.fake.sceneEvents.length, 7, 'nothing twice');

  // A restart the same day: the fired events are on /data.
  await w.app.stop();
  const again = await world(t, { clock, dataDir: w.dataDir });
  clock.advance(HOUR);
  await again.hub.poll();
  assert.deepEqual(again.fake.sceneEvents, []);

  // The next day: Chloé in 3 days, Inès in 5; nothing before 08:00.
  clock.advance(21 * HOUR); // 07:00 on the 21st
  await again.hub.poll();
  assert.deepEqual(again.fake.sceneEvents, []);
  assert.deepEqual(states(again), {
    today: 0,
    week: 2,
    reminders: 0,
    days: 3,
    next: 'Chloé Durand',
  });
  clock.advance(HOUR);
  await again.hub.poll();
  assert.deepEqual(events(again), ['birthday_upcoming:Chloé Durand:3', 'birthday_upcoming:Inès:5']);
});

test('a reminder added later in the day fires at the next reading', async (t) => {
  const clock = createClock(Date.UTC(2026, 9, 20, 10));
  const w = await world(t, { clock });
  assert.equal(w.fake.sceneEvents.length, 7, 'past the event hour: the day fires at once');
  const reminder = structuredClone(w.server.reminders.find((r) => r.id === 4));
  w.server.reminders.push({ ...reminder, id: 99, title: 'Arroser les plantes' });
  clock.advance(HOUR);
  await w.hub.poll();
  assert.deepEqual(events(w).slice(7), ['reminder_today:Arroser les plantes']);
});

test('an event Gladys refuses is tried again at the next reading', async (t) => {
  const clock = createClock(Date.UTC(2026, 9, 20, 10));
  const w = await world(t, { clock, connect: false });
  const publish = w.gladys.publishSceneEvent.bind(w.gladys);
  let refuse = true;
  w.gladys.publishSceneEvent = async (key, data) => {
    if (refuse && key === 'birthday_upcoming') {
      throw new Error('HTTP 503');
    }
    return publish(key, data);
  };
  await w.gladys.connect();
  await w.app.ready;
  // The refused ones are skipped, the next ones still sent.
  assert.deepEqual(events(w), [
    'birthday_today:Alice Martin',
    'birthday_today:Bruno',
    'reminder_today:Anniversaire de mariage',
    'reminder_today:Appeler Bruno',
    'reminder_today:Prendre des nouvelles de Chloé',
  ]);
  assert.equal(w.hub.nextDelay(), 60_000, 'tried again within a minute');
  refuse = false;
  await w.hub.poll();
  assert.equal(w.fake.sceneEvents.length, 7);
  assert.equal(w.hub.nextDelay(), HOUR);
});

test('the timer wakes up at the event hour and at midnight', async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, poll_interval: '360' } });
  assert.equal(w.hub.nextDelay(), HOUR + 2_000, '07:00 → 08:00');
  w.clock.advance(15 * HOUR); // 22:00
  assert.equal(w.hub.nextDelay(), 2 * HOUR + 2_000, '22:00 → midnight');
  const hourly = await world(t);
  assert.equal(hourly.hub.nextDelay(), HOUR, 'never beyond the interval');
  hourly.server.online = false;
  await hourly.hub.poll();
  assert.equal(hourly.hub.nextDelay(), 60_000, 'a failure is retried within a minute');
});

test('errors: the status says why, the device turns unreachable, the data stay', async (t) => {
  const w = await world(t);
  w.server.online = false;
  await w.hub.poll();
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.equal(w.fake.connectionStatus.message.en, 'Monica does not answer');
  assert.equal(w.fake.transports.at(-1).transport, 'unreachable');
  assert.equal(states(w).today, 2);

  w.server.online = true;
  w.server.token = 'another';
  await w.hub.poll();
  assert.match(w.fake.connectionStatus.message.fr, /jeton d'accès refusé/);

  w.server.token = BASE_CONFIG.api_token;
  w.server.failWith = 429;
  await w.hub.poll();
  assert.equal(w.fake.connectionStatus.message.en, 'too many requests, retrying later');

  w.server.failWith = null;
  await w.hub.poll();
  assert.equal(w.fake.connectionStatus.connected, true);
  assert.equal(w.fake.transports.at(-1).transport, 'local');
});

test('an address that is not Monica 4, and a missing configuration', async (t) => {
  const html = await world(t, { config: { ...BASE_CONFIG, url: 'http://192.0.2.30/monica' } });
  assert.equal(html.fake.connectionStatus.connected, false);
  assert.equal(html.fake.discoveredDevices.length, 0);

  const empty = await world(t, { config: { language: 'en' } });
  assert.equal(empty.fake.connectionStatus.message.en, CONNECTION_NO_URL);
  const action = await empty.fake.sceneAction('read_week_birthdays', {});
  assert.equal(action.success, false);
  assert.match(action.error, /not configured/);
});
const CONNECTION_NO_URL = 'Enter the address of your Monica in the configuration.';

test('more than 100 contacts: every page is read', async (t) => {
  const clock = createClock();
  const w = await world(t, { clock, connect: false });
  const [alice] = w.server.contacts;
  for (let id = 100; id < 300; id += 1) {
    w.server.contacts.push({ ...structuredClone(alice), id, first_name: `C${id}` });
  }
  await w.gladys.connect();
  await w.app.ready;
  assert.equal(states(w).today, 202);
  assert.equal(w.server.requests.filter((request) => request.path === '/api/contacts').length, 3);
});

test('a device added in Gladys gets its states again, and the widget a refresh', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  const refreshes = w.fake.widgetRefreshes.length;
  await createAll(w);
  assert.equal(w.fake.states.length - before, 5);
  assert.ok(w.fake.widgetRefreshes.length > refreshes);
});

test('the language changes the feature names and the texts', async (t) => {
  const w = await world(t);
  await w.fake.configUpdated({ ...BASE_CONFIG, language: 'fr' });
  const [device] = w.fake.discoveredDevices;
  assert.deepEqual(
    device.features.map((feature) => feature.name),
    [
      "Anniversaires aujourd'hui",
      'Anniversaires sous 7 jours',
      'Rappels du jour',
      "Jours avant l'anniversaire",
      'Prochain anniversaire',
    ],
  );
});

test("read this week's birthdays: a sentence and a count", async (t) => {
  const w = await world(t, { config: { ...BASE_CONFIG, language: 'fr' } });
  const ack = await w.fake.sceneAction('read_week_birthdays', {});
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, {
    count: 4,
    text: "4 anniversaires dans les 7 prochains jours : Alice Martin (36 ans) aujourd'hui, Bruno aujourd'hui, Chloé Durand (10 ans) samedi et Inès lundi.",
  });
  w.clock.advance(10 * 24 * HOUR);
  const later = await w.fake.sceneAction('read_week_birthdays', {});
  assert.deepEqual(later.data.outputs, {
    count: 0,
    text: 'Aucun anniversaire dans les 7 prochains jours.',
  });
  w.server.online = false;
  w.clock.advance(10 * 60_000);
  const down = await w.fake.sceneAction('read_week_birthdays', {});
  assert.equal(down.success, false);
  assert.equal(down.error, 'Monica : Monica ne répond pas');
});

test('Test the connection reports what it found, or why it failed', async (t) => {
  const w = await world(t);
  const ok = await w.fake.action('test_connection', {});
  assert.equal(ok.success, true, ok.error);
  assert.equal(ok.data.message.en, 'Connected to Monica: 6 birthday(s) and 5 reminder(s) found.');
  w.server.token = 'another';
  const ko = await w.fake.action('test_connection', {});
  assert.equal(ko.success, false);
  assert.match(ko.error, /^Connection failed: access token refused/);
});

test('during an outage the counters still move on at midnight', async (t) => {
  const w = await world(t);
  w.server.online = false;
  w.clock.advance(19 * HOUR); // 02:00 on the 21st
  await w.hub.poll();
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.deepEqual(states(w), { today: 0, week: 2, reminders: 0, days: 3, next: 'Chloé Durand' });
});

test('the weekly sentence reuses data read minutes ago, in good grammar', async (t) => {
  const w = await world(t);
  const before = w.server.requests.length;
  const ack = await w.fake.sceneAction('read_week_birthdays', {});
  assert.equal(w.server.requests.length, before, 'no new reading');
  assert.match(
    ack.data.outputs.text,
    /Chloé Durand \(10 years\) on Saturday and Inès on Monday\.$/,
  );
});

test('a baby born this year has its first birthday next year', async (t) => {
  const w = await world(t, { connect: false });
  const baby = structuredClone(w.server.contact(1));
  baby.id = 50;
  baby.first_name = 'Bébé';
  baby.information.dates.birthdate.date = '2026-10-20T00:00:00Z';
  w.server.contacts.push(baby);
  await w.gladys.connect();
  await w.app.ready;
  assert.equal(states(w).today, 2);
});
