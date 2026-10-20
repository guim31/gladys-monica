// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `upcoming`.
//
// The use case: the hallway tablet says whose birthday is coming and which
// Monica reminders fall today, without opening Monica.
//
// Budget (8 components, 2 texts): two tiles (birthdays today, reminders
// today), a status list of the next birthdays (with the age they turn) and a
// status list of the reminders of the next 7 days. The figures are values,
// not bound to device features, so the widget works before the device is
// added.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from './hub.js';
import { AGE_TEXT, pick, shortDate, when } from './texts.js';

const MAX_BIRTHDAYS = 6;
const MAX_REMINDERS = 5;
// Reminders shown: today and the six days after it.
const REMINDER_DAYS = 7;

export const TEXT = {
  configure: {
    en: 'Enter the address of your Monica and an access token in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre Monica et un jeton d'accès dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines Monica und ein Zugriffstoken in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su Monica y un token de acceso en la configuración de la integración.',
  },
  noAnswer: {
    en: 'Monica does not answer: see the Configuration screen of the integration.',
    fr: "Monica ne répond pas : voir l'écran Configuration de l'intégration.",
    de: 'Monica antwortet nicht: Sieh dir die Konfiguration der Integration an.',
    es: 'Monica no responde: consulte la pantalla de configuración de la integración.',
  },
  stale: {
    en: 'Monica does not answer: last known data.',
    fr: 'Monica ne répond pas : dernières données connues.',
    de: 'Monica antwortet nicht: zuletzt bekannte Daten.',
    es: 'Monica no responde: últimos datos conocidos.',
  },
  nothing: {
    en: 'No birthday or reminder known in Monica.',
    fr: 'Aucun anniversaire ni rappel connu dans Monica.',
    de: 'Kein Geburtstag und keine Erinnerung in Monica bekannt.',
    es: 'Ningún cumpleaños ni recordatorio conocido en Monica.',
  },
  birthdays: {
    en: 'Birthdays today',
    fr: 'Anniversaires du jour',
    de: 'Geburtstage heute',
    es: 'Cumpleaños hoy',
  },
  reminders: {
    en: 'Reminders today',
    fr: 'Rappels du jour',
    de: 'Erinnerungen heute',
    es: 'Recordatorios hoy',
  },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: t(text, language) }],
  };
}

/** Today, tomorrow, a weekday within the week, else a short date. */
function whenShort(item, language) {
  return item.days < 7 ? when(item, language) : shortDate(item.date, language);
}

function birthdayRow(birthday, language) {
  const age = AGE_TEXT[language] ?? AGE_TEXT.en;
  const parts = [whenShort(birthday, language)];
  if (birthday.age !== null) {
    parts.push(age(birthday.age));
  }
  return {
    label: fit(birthday.name, 40),
    icon: 'gift',
    value: fit(parts.join(' · '), 40),
    color: birthday.days === 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
  };
}

function reminderRow(reminder, language) {
  const parts = [whenShort(reminder, language)];
  if (reminder.contactName) {
    parts.push(reminder.contactName);
  }
  return {
    label: fit(reminder.title, 40),
    icon: 'bell',
    value: fit(parts.join(' · '), 40),
    color: reminder.days === 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
  };
}

async function get(hub, { language = 'en' } = {}) {
  if (!hub.client) {
    return message(TEXT.configure, language);
  }
  if (hub.readAt === 0) {
    return message(TEXT.noAnswer, language);
  }
  const summary = hub.summary();
  const components = [];
  if (hub.error) {
    components.push({ type: 'text', variant: 'caption', text: t(TEXT.stale, language) });
  }
  components.push(
    {
      type: 'value',
      value: summary.today.length,
      label: t(TEXT.birthdays, language),
      icon: 'gift',
      color: summary.today.length > 0 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    },
    {
      type: 'value',
      value: summary.remindersToday.length,
      label: t(TEXT.reminders, language),
      icon: 'bell',
      color: summary.remindersToday.length > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
  );
  const reminders = summary.reminders.filter((reminder) => reminder.days < REMINDER_DAYS);
  if (summary.birthdays.length === 0 && reminders.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(TEXT.nothing, language) });
    return { ttl_seconds: 300, components };
  }
  if (summary.birthdays.length > 0) {
    components.push({
      type: 'status',
      items: summary.birthdays
        .slice(0, MAX_BIRTHDAYS)
        .map((birthday) => birthdayRow(birthday, language)),
    });
  }
  if (reminders.length > 0) {
    components.push({
      type: 'status',
      items: reminders.slice(0, MAX_REMINDERS).map((reminder) => reminderRow(reminder, language)),
    });
  }
  return { ttl_seconds: 300, components };
}

// The widget has no button: nothing to act on.
async function action(hub, { actionKey }) {
  throw new Error(`Unknown action ${actionKey}`);
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
