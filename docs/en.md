# Monica

Bring the birthdays and reminders of your [Monica](https://www.monicahq.com)
(the open source personal CRM) into Gladys: whose birthday is today, who
celebrates within the week, which reminders fall today. A scene can send you
a message on the morning of a birthday, warn you a week ahead to buy a
present, and Gladys can read out the birthdays of the week.

> **Feedback welcome.** This integration was tested against a real Monica 4
> server (official Docker image `monica:4`, October 2026), not yet in everyday
> use. If something does not work as described, please say so on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-monica/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- A **self-hosted Monica 4** (the `monica:4` Docker image or a 4.x install),
  reachable from Gladys. Monica 5 ("chandler") has no API yet: it is not
  supported.
- A **personal access token** of a Monica user. In Monica: **Settings** →
  **API** → **Personal access tokens** → **Create new token**, give it a name
  (`Gladys`) and copy it: Monica shows it only once. The integration only
  reads: it never changes anything in Monica.

## Set up

1. In Gladys, **Integrations** → install **Monica**.
2. In the **Configuration** screen of the integration:
   - **Address**: the address of Monica as in your browser, e.g.
     `http://192.168.1.20:8080` or `https://monica.example.org`;
   - **Personal access token**: the token created above;
   - **Time of the scene events** (8:00 by default): when the birthdays and
     reminders of the day fire their scene triggers;
   - **Refresh interval** (1 hour by default, 15 minutes to 6 hours);
   - **Accept self-signed certificates**: only for your own server in
     `https://` with a self-signed certificate;
   - **Language of the feature names**: French by default.
3. **Test the connection**: Gladys reads Monica and says how many birthdays
   and reminders it found.
4. In the **Discovery** tab, add the **Monica** device.

Monica allows 60 requests a minute per token. A reading takes one request per
100 contacts and per 100 reminders, plus one: far below, even for a large
address book.

## Devices

One **Monica** device per Monica account, with these features:

| Feature                      | What it says                                                          |
| ---------------------------- | --------------------------------------------------------------------- |
| Birthdays today              | contacts whose birthday is today                                      |
| Birthdays within 7 days      | birthdays from today to 6 days from now                               |
| Reminders today              | Monica reminders falling today (birthday reminders aside)             |
| Days until the next birthday | 0 when it is today                                                    |
| Next birthday                | the name of the next person to celebrate, "None" without any birthday |

What counts as a birthday:

- a contact with a known birth date; when only the day and month are known,
  there is no age;
- contacts who passed away, archived contacts and partial contacts
  (relatives without their own page) are left out, as well as birth dates
  typed as an age only ("about 40 years old");
- born on 29 February: celebrated on 28 February in a common year.

What counts as a reminder: every reminder of Monica (one time, every N weeks,
months or years), except the "Wish happy birthday" reminders Monica creates
for each birthday, already counted as birthdays. A monthly reminder on the
31st falls on the last day of shorter months.

## Dashboard

The **Upcoming birthdays** widget shows two tiles (birthdays today, reminders
today), the next six birthdays with when they fall and the age turned, and
the reminders of the next 7 days with their contact. Add it to a dashboard
from **Edit** → **Add a widget**. When Monica does not answer, the widget
keeps the last known data under a short notice.

## Scenes

### Triggers

The events of the day fire **once a day**, at the **time of the scene
events** chosen in the configuration (or at the first reading after it, if
Gladys or Monica were down). A birthday or a reminder added later in the day
fires at the next reading. The variables carry names: think of who reads the
messages you send with them.

- **Birthday today (Monica)**: a contact has a birthday today. Optional
  filter: **Name** (first and last name exactly as in Monica). Variables:
  name, first name, age turned (empty if the year is unknown), birthday date,
  Monica contact number.
- **Birthday in N days (Monica)**: a contact's birthday is N days away.
  Required field **Days before the birthday**, from 1 (the day before) to 30;
  optional filter **Name**. Same variables, plus the days left.
- **Reminder today (Monica)**: a reminder falls today. Optional filter:
  **Reminder title** (exact title). Variables: reminder title, contact name,
  Monica reminder number, Monica contact number.

### Actions

- **Read this week's birthdays (Monica)**: Monica is read again, then the
  action returns a **Sentence**, such as "4 birthdays in the next 7 days:
  Alice Martin (36 years) today, Bruno today, Chloé Durand (10 years) Saturday
  and Inès Monday.", and the **Number of birthdays**, to send by message or to
  say aloud. The sentence uses the language chosen in the configuration.

### Scene ideas

- **Birthday message**: trigger "Birthday today (Monica)" → send a message
  "Today is the birthday of {{name}}" (and its age, when known).
- **Present reminder**: trigger "Birthday in N days (Monica)" with 7 days →
  message "{{name}} celebrates in a week: think of the present".
- **Monday morning**: every Monday at 8:00 → "Read this week's birthdays
  (Monica)" → say the sentence on the speaker of the kitchen, or send it.
- **Call reminder**: trigger "Reminder today (Monica)" → message "Reminder:
  {{title}} ({{contact_name}})".

## Troubleshooting

- **"Monica does not answer"**: check the address (port included) and that
  Gladys reaches it: Gladys runs in Docker, `localhost` is not your server.
- **"access token refused (revoked or expired?)"**: create a new personal
  access token in Monica and paste it in the configuration.
- **"no Monica 4 API at this address"**: the address points at something
  else, or at Monica 5, which has no API.
- **"the address redirects"**: Monica forces HTTPS: type the `https://`
  address.
- **"certificate refused"**: tick "Accept self-signed certificates" for your
  own server.
- **A birthday is missing**: check in Monica that the contact has a birth
  date (not only an age), is not archived nor marked as passed away.
- **No scene event**: the events fire at the time chosen in the
  configuration, once a day; the logs never show names (`LOG_LEVEL=debug`
  for the details of a reading).

## Limits

- Monica 4 only; Monica 5 is not supported (no API).
- Read only: no contact, birthday or reminder is created or changed from
  Gladys.
- The scene events of the day fire once a day, not at the time of the
  reminder (Monica reminders have a date, not a time).
- The next occurrence of a reminder is computed by the integration from its
  start date and frequency, like Monica does.
- One Monica account per integration (the one of the token).
