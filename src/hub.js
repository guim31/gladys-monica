// -----------------------------------------------------------------------------
// The Monica hub: reads the instance on a timer of the container, publishes
// the counters of the device when they change, and fires the scene events of
// the day (a birthday today, a birthday in N days, a reminder today) once,
// at the hour chosen in the configuration.
//
// Gladys never polls the device (should_poll: false): the interval goes up to
// 6 hours, beyond the fixed list of the core scheduler, and the scene events
// must fire even when no device was added. The timer also wakes up at the
// event hour and at local midnight, so the events and the counters move on
// time whatever the interval.
//
// Privacy: contact names and dates never reach the logs, at any level; only
// counts do. They go to Gladys (states, scene variables, widget) only.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { hostOf } from './config.js';
import { buildDevice, deviceIds, featureStates } from './devices.js';
import { ERROR_KINDS, MonicaClient, MonicaError } from './monica/client.js';
import {
  isoDate,
  localDay,
  localTime,
  parseBirthdays,
  parseReminders,
  resolveTimeZone,
  summarize,
} from './monica/model.js';
import {
  ACTION_TEXT,
  AGE_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  WEEK_TEXT,
  allLanguages,
  pick,
  when,
} from './texts.js';

const logger = createLogger({ name: 'monica-hub' });

export const WIDGET_KEY = 'upcoming';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  BIRTHDAY_TODAY: 'birthday_today',
  BIRTHDAY_UPCOMING: 'birthday_upcoming',
  REMINDER_TODAY: 'reminder_today',
});

// "Birthday in N days" fires for N from 1 to this (the trigger's `days` field).
export const UPCOMING_MAX_DAYS = 30;

export const HUB_TIMINGS = {
  // A failed read is tried again this soon, whatever the interval.
  retryMs: 60_000,
  // Read this long after midnight or the event hour.
  wakeSlackMs: 2_000,
  // Never read more often than this.
  minDelayMs: 10_000,
  // Re-send unchanged values this often: Gladys shows "no recent value" after 48 h.
  heartbeatMs: 12 * 60 * 60_000,
};

// Data younger than this are used as is by "Read this week's birthdays".
const FRESH_MS = 5 * 60_000;
// Names read out by the "Read this week's birthdays" action.
const MAX_NAMES = 10;

export class MonicaHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/monica/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   * @param {string} [options.timeZone] defaults to TZ, set by the Gladys supervisor
   */
  constructor({ gladys, store, request, timers = true, timings, now, timeZone }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.timeZone = resolveTimeZone(timeZone ?? process.env.TZ);
    this.config = null;
    this.client = null;
    this.reset();
    this.saved = { scope: null, day: null, fired: [] };
    this.connection = null;
    this.devicesSignature = null;
    this.widgetSignature = null;
    this.transport = null;
    this.timer = null;
    this.polling = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  reset() {
    this.accountId = null;
    this.birthdays = [];
    this.reminders = [];
    this.error = null;
    this.downSince = null;
    this.readAt = 0;
    this.connectedLogged = false;
    this.eventsPending = false;
    // Another account means another device: its transport is sent again.
    this.transport = null;
  }

  // --- Logs ------------------------------------------------------------------
  // Info keeps the lifecycle only (connected, lost, back). A problem that
  // repeats is logged once, then at debug until it clears.

  problem(key, message, level = 'warn') {
    if (this.warned.has(key)) {
      logger.debug(message);
      return;
    }
    this.warned.add(key);
    logger[level](message);
  }

  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  get language() {
    return this.config?.language ?? 'en';
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = {
      scope: typeof saved.scope === 'string' ? saved.scope : null,
      day: typeof saved.day === 'string' ? saved.day : null,
      fired: Array.isArray(saved.fired) ? saved.fired.filter((key) => typeof key === 'string') : [],
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.connection = null;
    this.devicesSignature = null;
    this.transport = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    const same =
      previous &&
      previous.url === config.url &&
      previous.token === config.token &&
      previous.allowSelfSigned === config.allowSelfSigned;
    if (!same) {
      this.reset();
      this.client =
        config.url && config.token
          ? new MonicaClient({
              url: config.url,
              token: config.token,
              insecure: config.allowSelfSigned,
              request: this.request,
            })
          : null;
    }
    // A new language: the device is published again.
    this.devicesSignature = null;
    this.gladys.forgetPublishedStates?.();
    await this.poll();
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.polling?.catch(() => {});
    await this.store.flush();
  }

  schedule(delay) {
    clearTimeout(this.timer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.timer = setTimeout(() => {
      this.poll().catch((err) => this.problem('poll', `Reading failed: ${err.message}`, 'error'));
    }, delay);
  }

  /** The interval, shortened to the event hour or local midnight. */
  nextDelay() {
    if (this.error || this.eventsPending) {
      return Math.min(this.config.pollIntervalMs, this.timings.retryMs);
    }
    const now = this.now();
    const day = localDay(now, this.timeZone);
    const moments = [day.end, localTime(day.date, this.config.eventHour, this.timeZone)];
    const ahead = moments.filter((moment) => moment > now);
    const wake = Math.min(...ahead) - now + this.timings.wakeSlackMs;
    return Math.max(this.timings.minDelayMs, Math.min(this.config.pollIntervalMs, wake));
  }

  // --- Reading ---------------------------------------------------------------

  /** One reading at a time: a call during a reading waits for it, then reads. */
  poll() {
    const run = async () => {
      try {
        await this.read();
      } finally {
        this.schedule(this.nextDelay());
      }
    };
    this.polling = (this.polling ?? Promise.resolve()).catch(() => {}).then(run);
    return this.polling;
  }

  async read() {
    if (!this.client) {
      await this.publishConnectionStatus();
      return;
    }
    const now = this.now();
    const { client } = this;
    try {
      const accountId = this.accountId ?? (await client.me()).account.id;
      const contacts = await client.contacts();
      const reminders = await client.reminders();
      if (client !== this.client) {
        // The configuration changed during the reading: these are the old
        // instance's data; the new one is being read.
        return;
      }
      this.accountId = accountId;
      this.birthdays = parseBirthdays(contacts);
      this.reminders = parseReminders(reminders);
      this.readAt = now;
      this.recovered(now);
      logger.debug(
        `Read ${contacts.length} contact(s), ${this.birthdays.length} birthday(s), ${this.reminders.length} reminder(s)`,
      );
    } catch (err) {
      if (client !== this.client) {
        return;
      }
      this.failed(err, now);
    }
    if (this.readAt !== 0) {
      await this.publishDevices();
      // The counters are computed locally: from the cached data during an
      // outage too, so they move on at midnight (the device shows unreachable).
      await this.publishStates();
      if (!this.error) {
        await this.fireEvents(now);
      }
    }
    await this.publishTransport();
    await this.publishConnectionStatus();
    this.refreshWidget();
  }

  recovered(now) {
    const host = hostOf(this.config.url);
    if (this.downSince !== null) {
      const minutes = Math.round((now - this.downSince) / 60_000);
      this.resolved('read', `Monica at ${host} answers again after ${minutes} min`);
    }
    if (!this.connectedLogged) {
      this.connectedLogged = true;
      logger.info(
        `Connected to Monica at ${host}: ${this.birthdays.length} birthday(s), ${this.reminders.length} reminder(s)`,
      );
    }
    this.error = null;
    this.downSince = null;
  }

  failed(err, now) {
    const kind = err instanceof MonicaError ? err.kind : ERROR_KINDS.HTTP;
    this.error = { kind, message: err.message };
    this.downSince ??= now;
    this.problem('read', `Monica at ${hostOf(this.config.url)}: ${err.message}`, 'error');
  }

  /** The birthdays and reminders seen from the local day holding `now`. */
  summary(now = this.now()) {
    return summarize(this.birthdays, this.reminders, localDay(now, this.timeZone).date);
  }

  // --- Publishing to Gladys --------------------------------------------------

  ids() {
    return this.accountId === null ? null : deviceIds(this.gladys, this.accountId);
  }

  async publishDevices() {
    if (this.accountId === null) {
      return;
    }
    const devices = [buildDevice(this.gladys, this.accountId, this.language)];
    const signature = JSON.stringify(devices);
    if (signature === this.devicesSignature) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesSignature = signature;
      this.resolved('devices');
    } catch (err) {
      this.problem('devices', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab. */
  async rediscover() {
    this.devicesSignature = null;
    await this.poll();
  }

  /** The user added the device: the states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    this.gladys.forgetPublishedStates?.(device?.external_id);
    if (!this.error && this.readAt !== 0) {
      await this.publishStates();
    }
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  async publishStates() {
    const ids = this.ids();
    if (!ids) {
      return;
    }
    try {
      // Only the changes, and every value again after `heartbeatMs`.
      await this.gladys.publishChangedStates(featureStates(ids, this.summary(), this.language), {
        heartbeat: this.timings.heartbeatMs,
      });
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async publishTransport() {
    const ids = this.ids();
    if (!ids) {
      return;
    }
    const transport = this.error ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL;
    if (transport === this.transport) {
      return;
    }
    try {
      await this.gladys.publishTransports([{ external_id: ids.device, transport }]);
      this.transport = transport;
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  connectionStatus() {
    if (!this.config.url) {
      return {
        connected: false,
        message: this.config.urlTyped ? CONNECTION_TEXT.invalidUrl : CONNECTION_TEXT.noUrl,
      };
    }
    if (!this.config.token) {
      return { connected: false, message: CONNECTION_TEXT.noToken };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  refreshWidget() {
    const signature = JSON.stringify([
      this.error?.kind ?? null,
      this.birthdays,
      this.reminders,
      isoDate(localDay(this.now(), this.timeZone).date),
    ]);
    if (signature !== this.widgetSignature) {
      this.widgetSignature = signature;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  // --- Scene events ----------------------------------------------------------

  /**
   * The events of the local day, from the event hour on, each one once a day
   * (the keys already fired are persisted under /data: a restart does not
   * repeat them). A birthday or a reminder added later in the day fires at
   * the next reading.
   */
  async fireEvents(now) {
    const day = localDay(now, this.timeZone);
    if (now < localTime(day.date, this.config.eventHour, this.timeZone)) {
      return;
    }
    // The Monica account, not the address: http:// → https:// on the same
    // server does not send the day again.
    const scope = `account-${this.accountId}`;
    const dayKey = isoDate(day.date);
    if (this.saved.scope !== scope || this.saved.day !== dayKey) {
      this.saved = { scope, day: dayKey, fired: [], fresh: true };
    }
    const fired = new Set(this.saved.fired);
    const summary = this.summary(now);
    const events = [];
    for (const birthday of summary.today) {
      events.push({
        id: `birthday:${birthday.contactId}`,
        key: TRIGGERS.BIRTHDAY_TODAY,
        data: this.birthdayData(birthday),
      });
    }
    for (const birthday of summary.birthdays) {
      if (birthday.days >= 1 && birthday.days <= UPCOMING_MAX_DAYS) {
        events.push({
          id: `upcoming:${birthday.contactId}`,
          key: TRIGGERS.BIRTHDAY_UPCOMING,
          data: { ...this.birthdayData(birthday), days: birthday.days },
        });
      }
    }
    for (const reminder of summary.remindersToday) {
      events.push({
        id: `reminder:${reminder.id}`,
        key: TRIGGERS.REMINDER_TODAY,
        data: {
          title: reminder.title,
          reminder_id: reminder.id,
          contact_name: reminder.contactName,
          contact_id: reminder.contactId,
        },
      });
    }
    if (this.saved.fresh) {
      // A new day or instance: written even if nothing fires.
      delete this.saved.fresh;
      this.store.save(this.saved);
    }
    this.eventsPending = false;
    for (const { id, key, data } of events) {
      if (fired.has(id)) {
        continue;
      }
      if (!(await this.fire(key, data))) {
        // Gladys refused (busy, restarting?): tried again within a minute
        // (nextDelay); the next events are still sent.
        this.eventsPending = true;
        continue;
      }
      fired.add(id);
      // Saved after each event (writes are coalesced): a crash in the middle
      // of a burst does not send the first ones again.
      this.saved = { scope, day: dayKey, fired: [...fired] };
      this.store.save(this.saved);
    }
  }

  birthdayData(birthday) {
    return {
      name: birthday.name,
      first_name: birthday.firstName,
      contact_id: birthday.contactId,
      age: birthday.age,
      date: isoDate(birthday.date),
    };
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.resolved('scene-event');
      return true;
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
      return false;
    }
  }

  // --- Commands --------------------------------------------------------------

  /** A Monica error, in words for the user (the server's text stays in the logs). */
  explain(kind) {
    const language = this.language;
    const colon = language === 'fr' ? ' : ' : ': ';
    return new Error(`Monica${colon}${pick(ERROR_TEXT[kind], language)}`);
  }

  /**
   * This week's birthdays (today and the six days after it), as a sentence
   * for a message or a voice announcement.
   */
  async week() {
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.notConfigured, this.language));
    }
    // Data read in the last minutes are used as is: a scene right after a
    // reading neither waits for Monica nor spends its request quota.
    if (this.error || this.readAt === 0 || this.now() - this.readAt > FRESH_MS) {
      await this.poll();
    }
    if (this.error) {
      throw this.explain(this.error.kind);
    }
    const language = this.language;
    const texts = WEEK_TEXT[language] ?? WEEK_TEXT.en;
    const age = AGE_TEXT[language] ?? AGE_TEXT.en;
    const { week } = this.summary();
    if (week.length === 0) {
      return { count: 0, text: texts.none };
    }
    const items = week.slice(0, MAX_NAMES).map((birthday) => {
      const years = birthday.age === null ? '' : ` (${age(birthday.age)})`;
      return `${birthday.name}${years} ${when(birthday, language, { sentence: true })}`;
    });
    const more = week.length - items.length;
    if (more > 0) {
      items.push(`+${more}`);
    }
    const list =
      items.length === 1
        ? items[0]
        : `${items.slice(0, -1).join(', ')}${texts.and}${items[items.length - 1]}`;
    const head = week.length === 1 ? texts.one : texts.many(week.length);
    return { count: week.length, text: `${head}${list}.`.slice(0, 1000) };
  }

  /** The "Test the connection" action: read now, report. */
  async testConnection() {
    await this.poll();
    const status = this.connectionStatus();
    if (!status.connected) {
      const message = allLanguages((language) =>
        REPORT_TEXT[language].failed(pick(status.message, language)),
      );
      throw new Error(message[this.language]);
    }
    return allLanguages((language) =>
      REPORT_TEXT[language].ok(this.birthdays.length, this.reminders.length),
    );
  }
}
