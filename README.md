# Penguin Empire Sponsorship Outreach Bot

Daily Gmail automation for FRC sponsorship outreach: sends the initial ask
(with the sponsorship packet + photos attached), watches each thread for a
reply, and sends **at most one** follow-up after 7 quiet days.

**Hard rule:** the bot never replies to a business. The moment any message
from someone other than the sending account appears in a thread, that
contact is marked `responded` and is permanently off-limits to the bot —
humans take over from there.

## How a daily run works (`src/send-and-check.ts`)

1. **Check replies** — every `sent` / `followed_up` contact's Gmail thread is
   inspected. Any external message ⇒ status `responded`, done forever.
2. **Follow-ups** — `sent` contacts with no reply after 7+ days get one
   follow-up in the same thread ⇒ `followed_up`. The thread is re-checked
   immediately before sending, so a reply arriving mid-run still cancels it.
3. **Initial sends** — up to **15** `not_sent` contacts per run get the
   intro email with all files from `Emailattachments/` attached ⇒ `sent`.

Every send is separated by a random 2–5 minute wait, and `data/contacts.csv`
is rewritten after every single action.

## One-time setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in `client_id` / `client_secret`
   (and the other OAuth fields) from your GCP Desktop-app credentials.
3. `npm run authorize` — sign in with the sending account, then save the
   printed refresh token.
4. In the GitHub repo, add these **Actions secrets**: `client_id`,
   `project_id`, `auth_uri`, `token_uri`, `auth_provider_x509_cert_url`,
   `client_secret`, `GMAIL_REFRESH_TOKEN`, plus `SENDER_NAME` and
   `SENDER_CONTACT` for the signature.
5. Commit and push — `.github/workflows/daily-send.yml` runs daily at
   16:00 UTC (or trigger it manually from the Actions tab). After each run
   it commits the updated `data/contacts.csv` back to the repo, which is how
   state survives between runs. If you edit the CSV by hand, pull first.

## Local commands

```bash
npm run send              # run one full daily cycle now
DRY_RUN=true npm run send # log everything, send/write nothing (still needs real creds)
npm run typecheck
```

## Mock testing (no Google account needed)

`MOCK_MODE=true` replaces the Gmail API with an in-memory fake
(`src/mockGmail.ts`), so you can watch a full run — batching, staggering,
reply detection, the one-time follow-up, the permanent `responded` lock —
without any credentials and without sending a single real email.

```bash
cp scripts/mock-data/contacts.seed.csv scripts/mock-data/contacts.csv
MOCK_MODE=true \
  CONTACTS_CSV_PATH=scripts/mock-data/contacts.csv \
  MAX_INITIAL_SENDS_PER_RUN=2 \
  SEND_DELAY_MIN_MS=50 SEND_DELAY_MAX_MS=150 \
  npm run send
```

The seed CSV has one contact of each kind — `not_sent`, a quiet `sent`
contact due for follow-up, a `sent` contact whose thread already has a
reply, a too-recent `sent` contact, an already-`followed_up` contact, and
an already-`responded` contact — so one run exercises every branch. Run the
same command again on the same (now-updated) CSV to confirm nothing repeats:
no second follow-up, no re-sent initial emails. When done, delete or
re-copy `scripts/mock-data/contacts.csv` from the seed file to reset it —
the seed file itself is never modified by the script.

## Contact statuses (`data/contacts.csv`)

| status        | meaning                                            |
| ------------- | -------------------------------------------------- |
| `not_sent`    | queued; will get the initial email in a future run |
| `sent`        | initial email sent; watching thread for a reply    |
| `followed_up` | one follow-up sent; still watching, no more sends  |
| `responded`   | business replied — bot never touches them again    |
