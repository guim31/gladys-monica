# Monica for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings the birthdays and reminders of a self-hosted
[Monica](https://www.monicahq.com) 4 (the open source personal CRM) into
Gladys, over the local network: counters on a device, scene triggers on the
morning of a birthday, N days before it and on the day of a reminder, a
"birthdays of the week" sentence, and a dashboard widget.

> **Feedback welcome.** The integration was checked against a real Monica 4
> server (official Docker image `monica:4`, October 2026), but not yet in
> everyday use with a real Gladys. Please report what works and what does not
> in the [issues](https://github.com/guim31/gladys-monica/issues).

## Features

- **A "Monica" device** with five features: _birthdays today_, _birthdays
  within 7 days_, _reminders today_, _days until the next birthday_ and the
  _next birthday_ (the person's name).
- **Scene triggers**, once a day at a chosen time (8:00 by default):
  _Birthday today_, _Birthday in N days_ (1 to 30) and _Reminder today_; the
  name, first name, age turned, date, or the reminder title and contact as
  variables. Once each, across restarts.
- **Scene action** _Read this week's birthdays_: a sentence for a message or
  a voice announcement, and the number of birthdays.
- **Dashboard widget** "Upcoming birthdays": tiles for today, the next six
  birthdays with the age turned, the reminders of the next 7 days.
- Read only: the integration never changes anything in Monica.
- **Privacy**: names and dates never reach the logs, at any level; they go to
  Gladys only (states, scene variables, widget).
- A **Test the connection** button, a connection status that names the
  problem, and a transport badge.
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later (widgets, scene triggers and actions).
- A **self-hosted Monica 4.x**, reachable from Gladys, and a **personal
  access token** of one of its users (Monica → Settings → API → Personal
  access tokens). Monica 5 ("chandler") has no API yet and is not supported.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-monica`
   (or install **Monica** from the catalog once it is listed).
2. In **Configuration**, enter the address of Monica
   (`http://192.168.1.20:8080`, `https://monica.example.org`…) and the token.
   Save, then click **Test the connection**.
3. Open the **Discover** tab and add the device.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

The integration uses the REST API of Monica 4, `/api`, with the token in the
`Authorization: Bearer` header, read only:

| Request                               | Use                                  |
| ------------------------------------- | ------------------------------------ |
| `GET /api/me`                         | the account of the token (device id) |
| `GET /api/contacts?limit=100&page=N`  | birth dates of the contacts          |
| `GET /api/reminders?limit=100&page=N` | reminders, start date and frequency  |

Monica is read on a timer of the container (15 minutes to 6 hours, 1 hour by
default), plus at local midnight and at the event time; the device is
published with `should_poll: false`. The next occurrence of each birthday and
reminder is computed locally in the time zone of Gladys: Monica's own
`/reminders/upcoming` leaves out the reminders of the current day. Monica's
automatic "Wish happy birthday" reminders (`delible: false`) are left out, the
birthdays cover them. The scene events already fired today are kept in
`/data/monica-state.json` (keys only: no name, no date).

## Checked on a real Monica, and what was not

Checked against the official `monica:4` image with MariaDB 11 in a Docker
network: an account, a token, nine contacts (birthdays today, in four and six
days, without a year, on 29 February, a dead contact, an age-only birth date,
none) and reminders (one time, weekly, every two months, yearly, past)
created through the API. The real answers are in `test/fixtures/monica/` and
drive the tests; the integration ran in its own container under the Gladys
sandbox limits (read-only root, no capabilities, 256 MB) against that server,
against the SDK's fake Gladys.

Not checked: a real Gladys instance, a Monica behind a reverse proxy with a
path prefix, a token created from the web interface (the test token came from
an OAuth password grant of the same Passport server; both are Bearer tokens).

## Limitations

- Monica 4 only; read only.
- Scene events once a day at the chosen time, not at the time of the reminder
  (Monica reminders have a date only).
- Up to 50 pages of 100 contacts and of 100 reminders are read.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and an in-memory Monica (`test/helpers/fakeMonica.js`) built from real
answers. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Monica](https://github.com/monicahq/monica) by Régis Freyd, Alexis Saettler
  and contributors (AGPL-3.0): the integration only talks to its API; no code
  was copied. The cover uses the Monica panda from its
  [repository](https://github.com/monicahq/monica) (`public/img/monica_reverse.svg`,
  branch `4.x`) to name the service.
- No Home Assistant integration was used: there is no official one for Monica.
- The architecture and the conformity tests follow
  [gladys-vikunja](https://github.com/guim31/gladys-vikunja) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Monica or
Monicahq. The Monica name and logo belong to their owners.

## License

Apache-2.0
