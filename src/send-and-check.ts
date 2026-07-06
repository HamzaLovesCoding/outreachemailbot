/**
 * Daily sponsorship outreach run. Executed once a day by GitHub Actions.
 *
 * Order of operations (per run):
 *   A. Check threads of every "sent"/"followed_up" contact. Any external
 *      reply => status "responded", contact is permanently finished.
 *   B. "sent" contacts with no reply after FOLLOW_UP_AFTER_DAYS get exactly
 *      one follow-up in the same thread => status "followed_up".
 *   C. Up to MAX_INITIAL_SENDS_PER_RUN "not_sent" contacts get the initial
 *      email with attachments => status "sent".
 *
 * HARD RULE: this bot never composes a reply to an incoming message. Its only
 * outbound actions are the single initial email and the single follow-up.
 * Once a contact is "responded" no code path here touches them again.
 */
import { gmail_v1 } from "googleapis";
import {
  ATTACHMENTS_DIR,
  CONTACTS_CSV_PATH,
  DRY_RUN,
  FOLLOW_UP_AFTER_DAYS,
  MAX_INITIAL_SENDS_PER_RUN,
  SEND_DELAY_MAX_MS,
  SEND_DELAY_MIN_MS,
  getSenderContact,
  getSenderName,
} from "./config.js";
import { Contact, loadContacts, saveContacts } from "./contacts.js";
import {
  getGmail,
  getMyEmail,
  inspectThread,
  loadAttachments,
  sendFollowUpEmail,
  sendInitialEmail,
} from "./gmail.js";
import {
  FOLLOW_UP_SUBJECT,
  INITIAL_SUBJECT,
  followUpBody,
  initialBody,
} from "./templates.js";

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysSince(isoDate: string): number {
  const then = Date.parse(isoDate);
  if (Number.isNaN(then)) return 0;
  return (Date.now() - then) / (24 * 60 * 60 * 1000);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Random 2–5 minute pause before every send after the first, so the run
 * never looks like a burst of automated mail.
 */
let sentAnythingThisRun = false;
async function staggerBeforeSend(): Promise<void> {
  if (!sentAnythingThisRun) return;
  const ms =
    SEND_DELAY_MIN_MS +
    Math.floor(Math.random() * (SEND_DELAY_MAX_MS - SEND_DELAY_MIN_MS + 1));
  log(`Waiting ${(ms / 60000).toFixed(1)} min before next send...`);
  if (!DRY_RUN) await sleep(ms);
}

function persist(contacts: Contact[]): void {
  if (!DRY_RUN) saveContacts(CONTACTS_CSV_PATH, contacts);
}

async function checkForReplies(
  gmail: gmail_v1.Gmail,
  contacts: Contact[],
  myEmail: string,
): Promise<void> {
  const toCheck = contacts.filter(
    (c) => (c.status === "sent" || c.status === "followed_up") && c.threadId,
  );
  log(`Phase A: checking ${toCheck.length} thread(s) for replies`);

  for (const contact of toCheck) {
    try {
      const info = await inspectThread(gmail, contact.threadId, myEmail);
      if (info.hasExternalReply) {
        contact.status = "responded";
        persist(contacts);
        log(`REPLY DETECTED from ${contact.name} <${contact.email}> — marked responded; no further contact ever`);
      }
    } catch (err) {
      // On any doubt, do nothing: skipping is always safe, sending is not.
      log(`WARNING: could not check thread for ${contact.email}: ${String(err)}`);
    }
  }
}

async function sendFollowUps(
  gmail: gmail_v1.Gmail,
  contacts: Contact[],
  myEmail: string,
  senderName: string,
): Promise<void> {
  const due = contacts.filter(
    (c) =>
      c.status === "sent" &&
      c.threadId &&
      c.sentDate &&
      daysSince(c.sentDate) >= FOLLOW_UP_AFTER_DAYS,
  );
  log(`Phase B: ${due.length} contact(s) due a follow-up (${FOLLOW_UP_AFTER_DAYS}+ days, no reply)`);

  for (const contact of due) {
    try {
      // Staggered sends mean up to hours can pass since Phase A ran, so
      // re-check the thread immediately before sending. A reply arriving in
      // that window must still suppress the follow-up.
      const info = await inspectThread(gmail, contact.threadId, myEmail);
      if (info.hasExternalReply) {
        contact.status = "responded";
        persist(contacts);
        log(`REPLY DETECTED (late) from ${contact.name} <${contact.email}> — follow-up cancelled, marked responded`);
        continue;
      }

      await staggerBeforeSend();
      log(`Sending follow-up to ${contact.name} <${contact.email}>`);
      if (!DRY_RUN) {
        await sendFollowUpEmail(gmail, {
          from: myEmail,
          to: contact.email,
          subject: FOLLOW_UP_SUBJECT,
          text: followUpBody(contact.name, senderName),
          threadId: contact.threadId,
          inReplyTo: info.firstMessageId,
        });
      }
      sentAnythingThisRun = true;
      contact.status = "followed_up";
      contact.followUpDate = todayISO();
      persist(contacts);
      log(`Follow-up sent to ${contact.email}; status=followed_up`);
    } catch (err) {
      log(`ERROR: follow-up to ${contact.email} failed: ${String(err)} — status unchanged, will retry next run`);
    }
  }
}

async function sendInitialEmails(
  gmail: gmail_v1.Gmail,
  contacts: Contact[],
  myEmail: string,
  senderName: string,
  senderContact: string,
): Promise<void> {
  const batch = contacts
    .filter((c) => c.status === "not_sent")
    .slice(0, MAX_INITIAL_SENDS_PER_RUN);
  const remaining = contacts.filter((c) => c.status === "not_sent").length;
  log(`Phase C: sending initial email to ${batch.length} of ${remaining} remaining not_sent contact(s) (cap ${MAX_INITIAL_SENDS_PER_RUN}/run)`);

  const attachments = loadAttachments(ATTACHMENTS_DIR);
  log(`Attachments: ${attachments.map((a) => a.filename).join(", ")}`);

  for (const contact of batch) {
    try {
      await staggerBeforeSend();
      log(`Sending initial email to ${contact.name} <${contact.email}>`);
      let threadId = "dry-run-thread-id";
      if (!DRY_RUN) {
        threadId = await sendInitialEmail(gmail, {
          from: myEmail,
          to: contact.email,
          subject: INITIAL_SUBJECT,
          text: initialBody(contact.name, senderName, senderContact),
          attachments,
        });
      }
      sentAnythingThisRun = true;
      contact.status = "sent";
      contact.threadId = threadId;
      contact.sentDate = todayISO();
      persist(contacts);
      log(`Initial email sent to ${contact.email}; threadId=${threadId}; status=sent`);
    } catch (err) {
      log(`ERROR: initial email to ${contact.email} failed: ${String(err)} — status unchanged, will retry next run`);
    }
  }
}

async function main(): Promise<void> {
  if (DRY_RUN) log("DRY RUN — nothing will be sent or written");

  const contacts = loadContacts(CONTACTS_CSV_PATH);
  log(`Loaded ${contacts.length} contacts from ${CONTACTS_CSV_PATH}`);

  const gmail = getGmail();
  const myEmail = await getMyEmail(gmail);
  const senderName = getSenderName();
  const senderContact = getSenderContact();
  log(`Authenticated as ${myEmail}`);

  await checkForReplies(gmail, contacts, myEmail);
  await sendFollowUps(gmail, contacts, myEmail, senderName);
  await sendInitialEmails(gmail, contacts, myEmail, senderName, senderContact);

  const counts: Record<string, number> = {};
  for (const c of contacts) counts[c.status] = (counts[c.status] ?? 0) + 1;
  log(`Run complete. Status counts: ${JSON.stringify(counts)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
