// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, the "Test the connection" report, the sentence
// of the "Read this week's birthdays" action. Four languages, the four of the
// Gladys interface; German says "du", Spanish "usted". test/i18n.test.js
// checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './monica/client.js';

export const pick = (text, language) => text?.[language] ?? text?.en ?? '';

/** `{ en, fr, de, es }` from a function of the language. */
export const allLanguages = (render) =>
  Object.fromEntries(['en', 'fr', 'de', 'es'].map((language) => [language, render(language)]));

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your Monica in the configuration.',
    fr: "Saisissez l'adresse de votre Monica dans la configuration.",
    de: 'Gib die Adresse deines Monica in der Konfiguration ein.',
    es: 'Introduzca la dirección de su Monica en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.20:8080',
    fr: 'Adresse incomprise, ex. http://192.168.1.20:8080',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.20:8080',
    es: 'Dirección no válida, p. ej. http://192.168.1.20:8080',
  },
  noToken: {
    en: 'Enter a Monica personal access token in the configuration (Settings, API).',
    fr: "Saisissez un jeton d'accès personnel Monica dans la configuration (Settings, API).",
    de: 'Gib in der Konfiguration ein persönliches Monica-Zugriffstoken ein (Settings, API).',
    es: 'Introduzca un token de acceso personal de Monica en la configuración (Settings, API).',
  },
};

// One short explanation per error kind (src/monica/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'Monica does not answer',
    fr: 'Monica ne répond pas',
    de: 'Monica antwortet nicht',
    es: 'Monica no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: tick "Accept self-signed certificates"',
    fr: 'certificat refusé : cochez « Accepter les certificats auto-signés »',
    de: 'Zertifikat abgelehnt: Aktiviere „Selbstsignierte Zertifikate akzeptieren“',
    es: 'certificado rechazado: marque «Aceptar certificados autofirmados»',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'access token refused (revoked or expired?)',
    fr: "jeton d'accès refusé (révoqué ou expiré ?)",
    de: 'Zugriffstoken abgelehnt (widerrufen oder abgelaufen?)',
    es: 'token de acceso rechazado (¿revocado o caducado?)',
  },
  [ERROR_KINDS.NOT_MONICA]: {
    en: 'no Monica 4 API at this address',
    fr: 'aucune API Monica 4 à cette adresse',
    de: 'keine Monica-4-API unter dieser Adresse',
    es: 'no hay ninguna API de Monica 4 en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.RATE_LIMIT]: {
    en: 'too many requests, retrying later',
    fr: 'trop de requêtes, nouvel essai plus tard',
    de: 'zu viele Anfragen, neuer Versuch später',
    es: 'demasiadas solicitudes, se reintentará más tarde',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

export const ACTION_TEXT = {
  notConfigured: {
    en: 'Monica is not configured: enter its address and an access token.',
    fr: "Monica n'est pas configuré : saisissez son adresse et un jeton d'accès.",
    de: 'Monica ist nicht eingerichtet: Gib seine Adresse und ein Zugriffstoken ein.',
    es: 'Monica no está configurado: introduzca su dirección y un token de acceso.',
  },
};

export const REPORT_TEXT = {
  en: {
    ok: (birthdays, reminders) =>
      `Connected to Monica: ${birthdays} birthday(s) and ${reminders} reminder(s) found.`,
    failed: (reason) => `Connection failed: ${reason}.`,
  },
  fr: {
    ok: (birthdays, reminders) =>
      `Connecté à Monica : ${birthdays} anniversaire(s) et ${reminders} rappel(s) trouvés.`,
    failed: (reason) => `Échec de la connexion : ${reason}.`,
  },
  de: {
    ok: (birthdays, reminders) =>
      `Mit Monica verbunden: ${birthdays} Geburtstag(e) und ${reminders} Erinnerung(en) gefunden.`,
    failed: (reason) => `Verbindung fehlgeschlagen: ${reason}.`,
  },
  es: {
    ok: (birthdays, reminders) =>
      `Conectado a Monica: ${birthdays} cumpleaños y ${reminders} recordatorio(s) encontrados.`,
    failed: (reason) => `La conexión ha fallado: ${reason}.`,
  },
};

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/** Weekday name of a calendar date, in the language. */
export function weekday(date, language) {
  return new Intl.DateTimeFormat(LOCALES[language] ?? 'en-GB', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
}

/** Short date of a calendar date (`24 Oct`), in the language. */
export function shortDate(date, language) {
  return new Intl.DateTimeFormat(LOCALES[language] ?? 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
}

/** When a birthday or a reminder falls: today, tomorrow, or a weekday or date. */
export const WHEN_TEXT = {
  en: { today: 'today', tomorrow: 'tomorrow', inDays: (n) => `in ${n} days` },
  fr: { today: "aujourd'hui", tomorrow: 'demain', inDays: (n) => `dans ${n} jours` },
  de: { today: 'heute', tomorrow: 'morgen', inDays: (n) => `in ${n} Tagen` },
  es: { today: 'hoy', tomorrow: 'mañana', inDays: (n) => `dentro de ${n} días` },
};

export function when(item, language) {
  const texts = WHEN_TEXT[language] ?? WHEN_TEXT.en;
  if (item.days === 0) {
    return texts.today;
  }
  if (item.days === 1) {
    return texts.tomorrow;
  }
  return item.days < 7 ? weekday(item.date, language) : texts.inDays(item.days);
}

export const AGE_TEXT = {
  en: (age) => `${age} ${age === 1 ? 'year' : 'years'}`,
  fr: (age) => `${age} ${age <= 1 ? 'an' : 'ans'}`,
  de: (age) => `${age} ${age === 1 ? 'Jahr' : 'Jahre'}`,
  es: (age) => `${age} ${age === 1 ? 'año' : 'años'}`,
};

// The sentence of the "Read this week's birthdays" scene action.
export const WEEK_TEXT = {
  en: {
    none: 'No birthday in the next 7 days.',
    one: 'One birthday in the next 7 days: ',
    many: (n) => `${n} birthdays in the next 7 days: `,
    and: ' and ',
  },
  fr: {
    none: 'Aucun anniversaire dans les 7 prochains jours.',
    one: 'Un anniversaire dans les 7 prochains jours : ',
    many: (n) => `${n} anniversaires dans les 7 prochains jours : `,
    and: ' et ',
  },
  de: {
    none: 'In den nächsten 7 Tagen hat niemand Geburtstag.',
    one: 'Ein Geburtstag in den nächsten 7 Tagen: ',
    many: (n) => `${n} Geburtstage in den nächsten 7 Tagen: `,
    and: ' und ',
  },
  es: {
    none: 'Ningún cumpleaños en los próximos 7 días.',
    one: 'Un cumpleaños en los próximos 7 días: ',
    many: (n) => `${n} cumpleaños en los próximos 7 días: `,
    and: ' y ',
  },
};
