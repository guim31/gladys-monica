// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Monica on a fake
// network, a temporary /data, a manual clock and the Paris time zone, with
// the integration wired on top through registerHandlers. No timer runs unless
// `timers: true` (with node:test mock timers): the tests read Monica with
// `world.hub.poll()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { FakeMonica, TOKEN, createNetwork } from './fakeMonica.js';

// The integration logs its lifecycle; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const URL_1 = 'http://192.0.2.30';
export const TIME_ZONE = 'Europe/Paris';
// The fixtures were captured on 20/10/2026. The tests start that day at
// 07:00 in Paris (05:00 UTC), before the default event hour (08:00).
export const START = Date.UTC(2026, 9, 20, 5, 0, 0);
export const HOUR = 60 * 60_000;

export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const BASE_CONFIG = { url: URL_1, api_token: TOKEN, language: 'en' };

/**
 * @param {object} [options]
 * @param {FakeMonica} [options.server]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 */
export async function createWorld({
  clock = createClock(),
  server,
  config = BASE_CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-monica-')),
  timings = {},
  timers = false,
} = {}) {
  const monica = server ?? new FakeMonica();
  const network = createNetwork({ [URL_1]: monica });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
    timeZone: TIME_ZONE,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, server: monica, app, hub: app.hub, clock, dataDir };
}

// Account 3 of the fixtures.
export const deviceId = (gladys) => gladys.externalIds('account', 'account-3');

/** Add every discovered device in Gladys, as the user would. */
export async function createAll(world) {
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
}

export { FakeMonica, TOKEN };
