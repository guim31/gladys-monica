# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.1] - 2026-10-22

### Security

- Rebuilt on Node.js 24.22.1, the October 2026 security release (remote code
  execution in the Brotli decoder, CVE-2026-111497; TLS hostname and DNS
  fixes).

## [1.0.0] - 2026-10-20

### Added

- A "Monica" device: birthdays today, birthdays within 7 days, reminders
  today, days until the next birthday and the name of the next person to
  celebrate, read from a self-hosted Monica 4 with a personal access token.
- Scene triggers, once a day at a chosen time: birthday today, birthday in N
  days (1 to 30) and reminder today, with the name, age, date or reminder
  title as variables.
- Scene action "Read this week's birthdays": a sentence and a count, for a
  message or a voice announcement.
- Dashboard widget "Upcoming birthdays": today's figures, the next birthdays
  with the age turned and the reminders of the week.
- A "Test the connection" button and a connection status that names the
  problem; every text in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-monica/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/guim31/gladys-monica/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/guim31/gladys-monica/releases/tag/v1.0.0
