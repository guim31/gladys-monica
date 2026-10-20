// -----------------------------------------------------------------------------
// The `upcoming` widget: valid for the core (budget, status rows), in every
// language, before and after an outage, and without configuration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createWorld } from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, language = 'en') {
  const ack = await w.fake.widgetGet('upcoming', { language });
  assert.equal(ack.success, true, ack.error);
  const { content: result } = ack.data;
  assert.doesNotThrow(() => validateWidgetContent(result));
  const components = result.components;
  assert.ok(components.length <= 8, 'at most 8 components');
  assert.ok(components.filter((c) => c.type === 'text').length <= 2, 'at most 2 texts');
  for (const item of components.filter((c) => c.type === 'status').flatMap((c) => c.items)) {
    assert.ok(item.label.length <= 40 && String(item.value).length <= 40, item.label);
  }
  return components;
}

test('tiles, the next birthdays and the reminders of the week', async (t) => {
  const w = await world(t);
  const [birthdays, reminders, nextBirthdays, nextReminders] = await content(w);
  assert.equal(birthdays.value, 2);
  assert.equal(reminders.value, 3);
  assert.deepEqual(
    nextBirthdays.items.map((item) => `${item.label} | ${item.value}`),
    [
      'Alice Martin | today · 36 years',
      'Bruno | today',
      'Chloé Durand | Saturday · 10 years',
      'Inès | Monday',
      'Hugo | 28 Feb · 27 years',
      'Emma | 15 Mar · 42 years',
    ],
  );
  assert.deepEqual(
    nextReminders.items.map((item) => `${item.label} | ${item.value}`),
    [
      'Anniversaire de mariage | today · Alice Martin',
      'Appeler Bruno | today · Bruno',
      'Prendre des nouvelles de Chloé | today · Chloé Durand',
      'Envoyer une carte | Friday · Emma',
    ],
  );
});

test('the widget speaks the four languages', async (t) => {
  const w = await world(t);
  for (const [language, label] of [
    ['fr', "aujourd'hui · 36 ans"],
    ['de', 'heute · 36 Jahre'],
    ['es', 'hoy · 36 años'],
  ]) {
    const components = await content(w, language);
    assert.equal(components[2].items[0].value, label);
  }
});

test('an outage keeps the last data, under a caption', async (t) => {
  const w = await world(t);
  w.server.online = false;
  await w.hub.poll();
  const components = await content(w);
  assert.equal(components[0].type, 'text');
  assert.match(components[0].text, /last known data/);
  assert.equal(components[1].value, 2);
});

test('without configuration or answer, a sentence says what to do', async (t) => {
  const empty = await world(t, { config: { language: 'en' } });
  const [text] = await content(empty);
  assert.match(text.text, /Enter the address of your Monica/);

  const down = await createWorld({ connect: false });
  t.after(() => down.app.stop());
  down.server.online = false;
  await down.gladys.connect();
  await down.app.ready;
  const [message] = await content(down);
  assert.match(message.text, /Monica does not answer/);
});

test('nothing known: one sentence under the tiles', async (t) => {
  const w = await world(t, { connect: false });
  w.server.contacts = [];
  w.server.reminders = [];
  await w.gladys.connect();
  await w.app.ready;
  const components = await content(w);
  assert.equal(components.length, 3);
  assert.match(components[2].text, /No birthday or reminder/);
});
