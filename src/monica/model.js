// -----------------------------------------------------------------------------
// From Monica's answers to what the integration shows: birthdays and reminders
// as calendar dates, their next occurrence from a local day, and the counters
// of that day. Pure functions, no network.
//
// Monica stores dates without a time (`1990-10-20T00:00:00Z`): only the
// calendar date counts, compared with the local day of Gladys (TZ).
//
// Birthdays (`information.dates.birthdate` of a contact):
//   - `is_age_based`: only an age was typed, the date is made up: no birthday;
//   - `is_year_unknown`: day and month only, the year is meaningless: no age;
//   - a dead (`is_dead`), partial (`is_partial`, a relative without a page) or
//     archived (`is_active: false`) contact is left out;
//   - born on 29 February: celebrated on 28 February in a common year.
//
// Reminders: the ones Monica creates itself for birthdays (`delible: false`,
// "Wish happy birthday to…") are left out, the birthdays already cover them.
// The next occurrence is computed here from `initial_date`, `frequency_type`
// (`one_time`, `week`, `month`, `year`) and `frequency_number`: Monica's own
// `/reminders/upcoming` leaves out the reminders of the current day. A
// monthly reminder on the 31st falls on the last day of shorter months.
// -----------------------------------------------------------------------------

const DAY_MS = 86_400_000;

// --- Time zone ---------------------------------------------------------------------

const partsFormatters = new Map();

function zonedParts(ms, timeZone) {
  let format = partsFormatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    partsFormatters.set(timeZone, format);
  }
  return Object.fromEntries(
    format.formatToParts(new Date(ms)).map(({ type, value }) => [type, Number(value)]),
  );
}

/** Offset of `timeZone` from UTC at `ms`, in milliseconds. */
function offsetAt(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** UTC instant of a local wall-clock hour of a local calendar day (DST-safe). */
export function localTime({ year, month, day }, hour, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour);
  const first = guess - offsetAt(guess, timeZone);
  let at = guess - offsetAt(first, timeZone);
  // Where the clocks jump at midnight (Chile, Cuba), 00:00 does not exist and
  // the instant found is 23:00 the day before: the day starts an hour later.
  // (An hour skipped in the night lands on the first hour after the jump.)
  if (zonedParts(at, timeZone).day !== day) {
    at += 60 * 60_000;
  }
  return at;
}

/** A time zone Intl knows, else the one of the process. */
export function resolveTimeZone(timeZone) {
  try {
    if (timeZone) {
      new Intl.DateTimeFormat('en-US', { timeZone });
      return timeZone;
    }
  } catch {
    // fall through
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** The local calendar day holding `now`, with its start and end (exclusive). */
export function localDay(now, timeZone) {
  const p = zonedParts(now, timeZone);
  const date = { year: p.year, month: p.month, day: p.day };
  return {
    date,
    start: localTime(date, 0, timeZone),
    end: localTime(addDays(date, 1), 0, timeZone),
  };
}

// --- Calendar dates ----------------------------------------------------------------

const dayNumber = ({ year, month, day }) => Date.UTC(year, month - 1, day) / DAY_MS;

function fromDayNumber(n) {
  const d = new Date(n * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export const addDays = (date, days) => fromDayNumber(dayNumber(date) + days);
export const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);
export const isoDate = ({ year, month, day }) =>
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The date `months` months after `date`, its day clamped to the end of the month. */
function addMonths(date, months) {
  const index = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

/** `YYYY-MM-DD…` → calendar date, null when absent or not a date. */
export function parseDate(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return null;
  }
  const [year, month, day] = match.slice(1).map(Number);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return null;
  }
  return { year, month, day };
}

// --- Contacts and birthdays --------------------------------------------------------

/** The name shown and sent to the scenes: first and last name, never the nickname. */
export function contactName(contact) {
  const name = [contact?.first_name, contact?.last_name]
    .filter((part) => typeof part === 'string' && part.trim() !== '')
    .map((part) => part.trim())
    .join(' ');
  if (name) {
    return name;
  }
  // complete_name may carry a "⚰" or a "(nickname)": the bare first word is enough.
  const complete = typeof contact?.complete_name === 'string' ? contact.complete_name.trim() : '';
  return complete || `#${contact?.id ?? '?'}`;
}

/**
 * The known birthdays among Monica's contacts.
 * @param {Array<object>} contacts `data` of GET /api/contacts
 * @returns {Array<{ contactId: number, name: string, firstName: string, month: number, day: number, year: number|null }>}
 */
export function parseBirthdays(contacts) {
  const birthdays = [];
  for (const contact of Array.isArray(contacts) ? contacts : []) {
    if (!contact || !Number.isInteger(contact.id)) {
      continue;
    }
    if (contact.is_dead === true || contact.is_partial === true || contact.is_active === false) {
      continue;
    }
    // `information.dates.birthdate` in /contacts, `information.birthdate` in
    // the contact embedded in a reminder.
    const birthdate = contact.information?.dates?.birthdate ?? contact.information?.birthdate;
    if (!birthdate || birthdate.is_age_based === true) {
      continue;
    }
    const date = parseDate(birthdate.date);
    if (!date) {
      continue;
    }
    const name = contactName(contact);
    birthdays.push({
      contactId: contact.id,
      name,
      firstName:
        typeof contact.first_name === 'string' && contact.first_name.trim()
          ? contact.first_name.trim()
          : name,
      month: date.month,
      day: date.day,
      year: birthdate.is_year_unknown === true ? null : date.year,
    });
  }
  return birthdays;
}

/** The birthday of `birthday` in `year` (29 February → 28 in a common year). */
function birthdayIn(birthday, year) {
  return {
    year,
    month: birthday.month,
    day: Math.min(birthday.day, daysInMonth(year, birthday.month)),
  };
}

/**
 * The next birthday, `today` included.
 * @returns {{ date: object, days: number, age: number|null }}
 */
export function nextBirthday(birthday, today) {
  let date = birthdayIn(birthday, today.year);
  if (daysBetween(today, date) < 0) {
    date = birthdayIn(birthday, today.year + 1);
  }
  const age = birthday.year === null ? null : date.year - birthday.year;
  return { date, days: daysBetween(today, date), age: age !== null && age >= 0 ? age : null };
}

// --- Reminders -----------------------------------------------------------------------

const FREQUENCIES = new Set(['one_time', 'week', 'month', 'year']);

/**
 * Monica's reminders, birthday reminders left out.
 * @param {Array<object>} reminders `data` of GET /api/reminders
 */
export function parseReminders(reminders) {
  const parsed = [];
  for (const reminder of Array.isArray(reminders) ? reminders : []) {
    if (!reminder || !Number.isInteger(reminder.id) || reminder.delible === false) {
      continue;
    }
    const initial = parseDate(reminder.initial_date);
    if (!initial || !FREQUENCIES.has(reminder.frequency_type)) {
      continue;
    }
    if (reminder.contact?.is_dead === true) {
      continue;
    }
    const every = Number.isInteger(reminder.frequency_number) ? reminder.frequency_number : 1;
    parsed.push({
      id: reminder.id,
      title:
        typeof reminder.title === 'string' && reminder.title.trim()
          ? reminder.title.trim()
          : `#${reminder.id}`,
      contactId: Number.isInteger(reminder.contact?.id) ? reminder.contact.id : null,
      contactName: reminder.contact ? contactName(reminder.contact) : '',
      type: reminder.frequency_type,
      every: Math.max(1, every),
      initial,
    });
  }
  return parsed;
}

/**
 * The next occurrence of a reminder, `today` included; null for a one-time
 * reminder already past.
 * @returns {{ date: object, days: number }|null}
 */
export function nextReminder(reminder, today) {
  const { initial, every, type } = reminder;
  const late = daysBetween(initial, today);
  let date = initial;
  if (late > 0) {
    switch (type) {
      case 'one_time':
        return null;
      case 'week': {
        const step = 7 * every;
        date = addDays(initial, Math.ceil(late / step) * step);
        break;
      }
      case 'month':
      case 'year': {
        const step = type === 'month' ? every : 12 * every;
        const months = (today.year - initial.year) * 12 + (today.month - initial.month);
        let k = Math.max(0, Math.floor(months / step));
        date = addMonths(initial, k * step);
        while (daysBetween(today, date) < 0) {
          k += 1;
          date = addMonths(initial, k * step);
        }
        break;
      }
      default:
        return null;
    }
  }
  return { date, days: daysBetween(today, date) };
}

// --- Summary of a day -------------------------------------------------------------

export const WEEK_DAYS = 7;

const byDaysThenName = (a, b) => a.days - b.days || a.name.localeCompare(b.name);

/**
 * Everything the device, the widget and the scenes show for a local day.
 * @param {ReturnType<typeof parseBirthdays>} birthdays
 * @param {ReturnType<typeof parseReminders>} reminders
 * @param {{ year: number, month: number, day: number }} today
 */
export function summarize(birthdays, reminders, today) {
  const upcoming = birthdays
    .map((birthday) => ({ ...birthday, ...nextBirthday(birthday, today) }))
    .sort(byDaysThenName);
  const nextReminders = reminders
    .map((reminder) => {
      const next = nextReminder(reminder, today);
      return next ? { ...reminder, ...next, name: reminder.title } : null;
    })
    .filter(Boolean)
    .sort(byDaysThenName);
  return {
    /** Every birthday, the next occurrence first. */
    birthdays: upcoming,
    today: upcoming.filter((birthday) => birthday.days === 0),
    // Today and the six days after it.
    week: upcoming.filter((birthday) => birthday.days < WEEK_DAYS),
    next: upcoming[0] ?? null,
    /** Every reminder still ahead, the next occurrence first. */
    reminders: nextReminders,
    remindersToday: nextReminders.filter((reminder) => reminder.days === 0),
  };
}
