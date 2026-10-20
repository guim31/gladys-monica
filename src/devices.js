// -----------------------------------------------------------------------------
// The Gladys device: one "Monica" device per Monica account.
//
// Identity: `account` / `account-<id>`, the id Monica gives the account of the
// token's user (stable): a new address or a new token for the same account
// keeps the device.
//
// Features (category/type couples of the core table, test/gladys-rules.test.js):
//   - birthdays today, birthdays within 7 days (today included), reminders
//     today: counter-sensor/integer;
//   - days until the next birthday: duration/integer, in days (0: today);
//   - next birthday: text/text, the contact's name ("None" without any
//     birthday: a text state is never empty).
//
// The device is published with should_poll: false: the integration reads
// Monica on its own timer (src/hub.js), every 15 minutes to 6 hours.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'account';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  BIRTHDAYS_TODAY: 'birthdays_today',
  BIRTHDAYS_WEEK: 'birthdays_week',
  REMINDERS_TODAY: 'reminders_today',
  NEXT_BIRTHDAY_DAYS: 'next_birthday_days',
  NEXT_BIRTHDAY: 'next_birthday',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.BIRTHDAYS_TODAY]: 'Birthdays today',
    [FEATURE_KEYS.BIRTHDAYS_WEEK]: 'Birthdays within 7 days',
    [FEATURE_KEYS.REMINDERS_TODAY]: 'Reminders today',
    [FEATURE_KEYS.NEXT_BIRTHDAY_DAYS]: 'Days until the next birthday',
    [FEATURE_KEYS.NEXT_BIRTHDAY]: 'Next birthday',
  },
  fr: {
    [FEATURE_KEYS.BIRTHDAYS_TODAY]: "Anniversaires aujourd'hui",
    [FEATURE_KEYS.BIRTHDAYS_WEEK]: 'Anniversaires sous 7 jours',
    [FEATURE_KEYS.REMINDERS_TODAY]: 'Rappels du jour',
    [FEATURE_KEYS.NEXT_BIRTHDAY_DAYS]: "Jours avant l'anniversaire",
    [FEATURE_KEYS.NEXT_BIRTHDAY]: 'Prochain anniversaire',
  },
  de: {
    [FEATURE_KEYS.BIRTHDAYS_TODAY]: 'Geburtstage heute',
    [FEATURE_KEYS.BIRTHDAYS_WEEK]: 'Geburtstage in 7 Tagen',
    [FEATURE_KEYS.REMINDERS_TODAY]: 'Erinnerungen heute',
    [FEATURE_KEYS.NEXT_BIRTHDAY_DAYS]: 'Tage bis zum Geburtstag',
    [FEATURE_KEYS.NEXT_BIRTHDAY]: 'Nächster Geburtstag',
  },
  es: {
    [FEATURE_KEYS.BIRTHDAYS_TODAY]: 'Cumpleaños hoy',
    [FEATURE_KEYS.BIRTHDAYS_WEEK]: 'Cumpleaños en 7 días',
    [FEATURE_KEYS.REMINDERS_TODAY]: 'Recordatorios de hoy',
    [FEATURE_KEYS.NEXT_BIRTHDAY_DAYS]: 'Días hasta el cumpleaños',
    [FEATURE_KEYS.NEXT_BIRTHDAY]: 'Próximo cumpleaños',
  },
};

// Published on "next birthday" when no contact has a known birthday.
export const NO_BIRTHDAY = { en: 'None', fr: 'Aucun', de: 'Keiner', es: 'Ninguno' };

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 10000;
const DAYS_MAX = 366;
const TEXT_MAX_LENGTH = 100;

const counter = (key, value) => ({
  key,
  definition: {
    category: DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    type: DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    min: 0,
    max: COUNTER_MAX,
  },
  value,
});

// Order = display order in Gladys.
const FEATURES = [
  counter(FEATURE_KEYS.BIRTHDAYS_TODAY, (summary) => summary.today.length),
  counter(FEATURE_KEYS.BIRTHDAYS_WEEK, (summary) => summary.week.length),
  counter(FEATURE_KEYS.REMINDERS_TODAY, (summary) => summary.remindersToday.length),
  {
    key: FEATURE_KEYS.NEXT_BIRTHDAY_DAYS,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.DURATION,
      type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
      unit: DEVICE_FEATURE_UNITS.DAYS,
      read_only: true,
      has_feedback: false,
      keep_history: false,
      min: 0,
      max: DAYS_MAX,
    },
    // No birthday at all: nothing to publish (a duration has no "none").
    value: (summary) => (summary.next ? summary.next.days : null),
  },
  {
    key: FEATURE_KEYS.NEXT_BIRTHDAY,
    text: true,
    definition: {
      category: DEVICE_FEATURE_CATEGORIES.TEXT,
      type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
      read_only: true,
      has_feedback: false,
      keep_history: false,
      // NOT NULL in the core, even for a text (422 on "Add to Gladys" otherwise).
      min: 0,
      max: 0,
    },
    value: (summary, language) =>
      (summary.next ? summary.next.name : (NO_BIRTHDAY[language] ?? NO_BIRTHDAY.en)).slice(
        0,
        TEXT_MAX_LENGTH,
      ),
  },
];

export const deviceIds = (gladys, accountId) =>
  gladys.externalIds(DEVICE_TYPE, `account-${accountId}`);

export function buildDevice(gladys, accountId, language = 'en') {
  const ids = deviceIds(gladys, accountId);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: 'Monica',
    external_id: ids.device,
    should_poll: false,
    features: FEATURES.map(({ key, definition }) => ({
      ...definition,
      name: names[key],
      external_id: ids.feature(key),
    })),
  };
}

/**
 * The states of every feature for a summary (src/monica/model.js), in the
 * `publishStates` format: `state` for a number, `text` for a text.
 * @returns {Array<{ device_feature_external_id: string, state?: number, text?: string }>}
 */
export function featureStates(ids, summary, language) {
  const states = [];
  for (const { key, value, text } of FEATURES) {
    const result = value(summary, language);
    if (result === null) {
      continue;
    }
    states.push(
      text
        ? { device_feature_external_id: ids.feature(key), text: result }
        : { device_feature_external_id: ids.feature(key), state: result },
    );
  }
  return states;
}
