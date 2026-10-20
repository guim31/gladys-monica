// -----------------------------------------------------------------------------
// Birthdays, reminders and their next occurrence from a local day, on the real
// answers of Monica 4 (20/10/2026) and on the calendar's edge cases.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  localDay,
  localTime,
  nextBirthday,
  nextReminder,
  parseBirthdays,
  parseReminders,
  summarize,
} from '../src/monica/model.js';
import { parseServerUrl, normalizeConfig } from '../src/config.js';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`./fixtures/monica/${name}.json`, import.meta.url), 'utf8')).data;

const day = (year, month, d) => ({ year, month, day: d });
const TODAY = day(2026, 10, 20);

test('the birthdays of the real contacts: dead, age-only and unknown left out', () => {
  const birthdays = parseBirthdays(fixture('real-contacts'));
  assert.deepEqual(
    birthdays.map((b) => [b.contactId, b.name, b.month, b.day, b.year]),
    [
      [1, 'Alice Martin', 10, 20, 1990],
      [2, 'Bruno', 10, 20, null],
      [3, 'Chloé Durand', 10, 24, 2016],
      [5, 'Emma', 3, 15, 1985],
      [8, 'Hugo', 2, 29, 2000],
      [9, 'Inès', 10, 26, null],
    ],
  );
});

test('a partial or archived contact has no birthday', () => {
  const [alice] = fixture('real-contacts');
  assert.equal(parseBirthdays([{ ...alice, is_partial: true }]).length, 0);
  assert.equal(parseBirthdays([{ ...alice, is_active: false }]).length, 0);
  assert.equal(parseBirthdays([null, {}, { id: 'x' }]).length, 0);
});

test('the next birthday and the age turned', () => {
  const [alice, bruno, chloe, emma, hugo] = parseBirthdays(fixture('real-contacts'));
  assert.deepEqual(nextBirthday(alice, TODAY), { date: TODAY, days: 0, age: 36 });
  assert.deepEqual(nextBirthday(bruno, TODAY), { date: TODAY, days: 0, age: null });
  assert.deepEqual(nextBirthday(chloe, TODAY), { date: day(2026, 10, 24), days: 4, age: 10 });
  assert.deepEqual(nextBirthday(emma, TODAY), { date: day(2027, 3, 15), days: 146, age: 42 });
  // Born on 29 February: the 28th in a common year, the 29th in a leap year.
  assert.deepEqual(nextBirthday(hugo, TODAY).date, day(2027, 2, 28));
  assert.deepEqual(nextBirthday(hugo, day(2028, 1, 1)).date, day(2028, 2, 29));
  // The day after: next year.
  assert.equal(nextBirthday(alice, day(2026, 10, 21)).days, 364);
  assert.equal(nextBirthday(alice, day(2026, 10, 21)).age, 37);
});

test('the reminders of the real account: birthday reminders left out', () => {
  const reminders = parseReminders(fixture('real-reminders'));
  assert.deepEqual(
    reminders.map((r) => [r.id, r.title, r.type, r.every, r.contactName]),
    [
      [4, 'Appeler Bruno', 'one_time', 1, 'Bruno'],
      [5, 'Prendre des nouvelles de Chloé', 'week', 1, 'Chloé Durand'],
      [6, 'Envoyer une carte', 'month', 2, 'Emma'],
      [7, 'Rendre le livre', 'one_time', 1, 'David'],
      [8, 'Anniversaire de mariage', 'year', 1, 'Alice Martin'],
    ],
  );
});

test('the next occurrence of a reminder, today included', () => {
  const byId = Object.fromEntries(
    parseReminders(fixture('real-reminders')).map((reminder) => [reminder.id, reminder]),
  );
  assert.deepEqual(nextReminder(byId[4], TODAY), { date: TODAY, days: 0 });
  // Weekly from 13 October: the 20th (Monica's /upcoming already says the 27th).
  assert.deepEqual(nextReminder(byId[5], TODAY), { date: TODAY, days: 0 });
  assert.deepEqual(nextReminder(byId[5], day(2026, 10, 21)).date, day(2026, 10, 27));
  // Every two months from 23 October.
  assert.deepEqual(nextReminder(byId[6], TODAY), { date: day(2026, 10, 23), days: 3 });
  assert.deepEqual(nextReminder(byId[6], day(2026, 10, 24)).date, day(2026, 12, 23));
  assert.deepEqual(nextReminder(byId[6], day(2027, 1, 1)).date, day(2027, 2, 23));
  // One time, past: never again.
  assert.equal(nextReminder(byId[7], TODAY), null);
  assert.deepEqual(nextReminder(byId[8], TODAY), { date: TODAY, days: 0 });
});

test('a monthly reminder on the 31st falls on the last day of shorter months', () => {
  const reminder = { initial: day(2026, 1, 31), every: 1, type: 'month' };
  assert.deepEqual(nextReminder(reminder, day(2026, 2, 1)).date, day(2026, 2, 28));
  assert.deepEqual(nextReminder(reminder, day(2026, 3, 1)).date, day(2026, 3, 31));
  assert.deepEqual(nextReminder(reminder, day(2026, 4, 1)).date, day(2026, 4, 30));
  const every3Years = { initial: day(2020, 6, 1), every: 3, type: 'year' };
  assert.deepEqual(nextReminder(every3Years, day(2024, 1, 1)).date, day(2026, 6, 1));
  const future = { initial: day(2027, 1, 1), every: 1, type: 'week' };
  assert.deepEqual(nextReminder(future, TODAY), { date: day(2027, 1, 1), days: 73 });
});

test('the summary of the day', () => {
  const summary = summarize(
    parseBirthdays(fixture('real-contacts')),
    parseReminders(fixture('real-reminders')),
    TODAY,
  );
  assert.deepEqual(
    summary.today.map((b) => b.name),
    ['Alice Martin', 'Bruno'],
  );
  assert.deepEqual(
    summary.week.map((b) => [b.name, b.days]),
    [
      ['Alice Martin', 0],
      ['Bruno', 0],
      ['Chloé Durand', 4],
      ['Inès', 6],
    ],
  );
  assert.equal(summary.next.name, 'Alice Martin');
  assert.deepEqual(
    summary.remindersToday.map((r) => r.id),
    [8, 4, 5],
  );
  assert.deepEqual(
    summary.reminders.map((r) => [r.id, r.days]),
    [
      [8, 0],
      [4, 0],
      [5, 0],
      [6, 3],
    ],
  );
});

test('the local day and hour follow the time zone, daylight saving included', () => {
  // 20/10/2026 at 23:30 UTC is already the 21st in Paris.
  assert.deepEqual(localDay(Date.UTC(2026, 9, 20, 23, 30), 'Europe/Paris').date, day(2026, 10, 21));
  assert.equal(localTime(TODAY, 8, 'Europe/Paris'), Date.UTC(2026, 9, 20, 6));
  // Last Sunday of October: back to UTC+1.
  assert.equal(localTime(day(2026, 10, 25), 8, 'Europe/Paris'), Date.UTC(2026, 9, 25, 7));
  // 02:00 does not exist on 29/03/2026 in Paris: 03:00 instead.
  assert.equal(localTime(day(2026, 3, 29), 2, 'Europe/Paris'), Date.UTC(2026, 2, 29, 1));
  const { start, end } = localDay(Date.UTC(2026, 9, 25, 12), 'Europe/Paris');
  assert.equal(end - start, 25 * 60 * 60_000);
});

test('the address and the configuration are normalized', () => {
  assert.equal(parseServerUrl('192.0.2.30:8080'), 'http://192.0.2.30:8080');
  assert.equal(
    parseServerUrl('https://crm.example.org/monica/people/h:abc'),
    'https://crm.example.org/monica',
  );
  assert.equal(parseServerUrl('https://crm.example.org/api/contacts'), 'https://crm.example.org');
  assert.equal(parseServerUrl('https://user:pass@crm.example.org'), null);
  assert.equal(parseServerUrl('ftp://crm.example.org'), null);
  const config = normalizeConfig({ url: ' x ', api_token: ' Bearer abc ', event_hour: '25' });
  assert.equal(config.token, 'abc');
  assert.equal(config.eventHour, 8);
  assert.equal(config.pollIntervalMs, 60 * 60_000);
  assert.equal(config.language, 'fr');
  assert.equal(normalizeConfig({ event_hour: '0', poll_interval: '15' }).eventHour, 0);
});
