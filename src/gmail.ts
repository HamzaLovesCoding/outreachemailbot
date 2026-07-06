import fs from "node:fs";
import path from "node:path";
import { google, gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type { Attachment } from "nodemailer/lib/mailer/index.js";
import { getOAuthConfig, getRefreshToken } from "./config.js";

export function createOAuthClient(redirectUri?: string): OAuth2Client {
  const cfg = getOAuthConfig();
  return new google.auth.OAuth2({
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    redirectUri,
    endpoints: {
      oauth2AuthBaseUrl: cfg.authUri,
      oauth2TokenUrl: cfg.tokenUri,
    },
  });
}

export function getGmail(): gmail_v1.Gmail {
  const auth = createOAuthClient();
  auth.setCredentials({ refresh_token: getRefreshToken() });
  return google.gmail({ version: "v1", auth });
}

/** The authenticated account's email address — used to tell our own thread messages from real replies. */
export async function getMyEmail(gmail: gmail_v1.Gmail): Promise<string> {
  const profile = await gmail.users.getProfile({ userId: "me" });
  const email = profile.data.emailAddress;
  if (!email) throw new Error("Could not determine authenticated Gmail address");
  return email;
}

function header(
  message: gmail_v1.Schema$Message,
  name: string,
): string | undefined {
  return message.payload?.headers?.find(
    (h) => h.name?.toLowerCase() === name.toLowerCase(),
  )?.value ?? undefined;
}

export interface ThreadInfo {
  /** True if ANY message in the thread was not sent by us — i.e. the business replied. */
  hasExternalReply: boolean;
  /** RFC 2822 Message-ID of the first (our initial) message, for reply threading. */
  firstMessageId?: string;
}

export async function inspectThread(
  gmail: gmail_v1.Gmail,
  threadId: string,
  myEmail: string,
): Promise<ThreadInfo> {
  const res = await gmail.users.threads.get({
    userId: "me",
    id: threadId,
    format: "metadata",
    metadataHeaders: ["From", "Message-ID"],
  });
  const messages = res.data.messages ?? [];
  const mine = myEmail.toLowerCase();

  const hasExternalReply = messages.some((m) => {
    const from = (header(m, "From") ?? "").toLowerCase();
    // A message with no From header, or from any address other than ours,
    // counts as a reply. Err on the side of "responded": the worst outcome
    // of a false positive is one skipped follow-up; of a false negative,
    // an unwanted email to someone who already answered.
    return !from.includes(mine);
  });

  return {
    hasExternalReply,
    firstMessageId: messages.length > 0 ? header(messages[0], "Message-ID") : undefined,
  };
}

async function buildMimeMessage(options: {
  from: string;
  to: string;
  subject: string;
  text: string;
  attachments?: Attachment[];
  inReplyTo?: string;
  references?: string;
}): Promise<Buffer> {
  const mail = new MailComposer({
    from: options.from,
    to: options.to,
    subject: options.subject,
    text: options.text,
    attachments: options.attachments,
    inReplyTo: options.inReplyTo,
    references: options.references,
  });
  return mail.compile().build();
}

/** Load every file in the attachments directory as a nodemailer attachment. */
export function loadAttachments(dir: string): Attachment[] {
  return fs
    .readdirSync(dir)
    .filter((f) => !f.startsWith("."))
    .sort()
    .map((f) => ({
      filename: f,
      content: fs.readFileSync(path.join(dir, f)),
    }));
}

/** Send the one-and-only initial email. Returns the new Gmail threadId. */
export async function sendInitialEmail(
  gmail: gmail_v1.Gmail,
  args: {
    from: string;
    to: string;
    subject: string;
    text: string;
    attachments: Attachment[];
  },
): Promise<string> {
  const mime = await buildMimeMessage(args);
  // Media upload (message/rfc822) instead of a base64 JSON body: the plain
  // endpoint rejects requests over ~5MB, and the attachments alone exceed that.
  const res = await gmail.users.messages.send({
    userId: "me",
    media: { mimeType: "message/rfc822", body: mime },
    requestBody: {},
  });
  const threadId = res.data.threadId;
  if (!threadId) throw new Error(`Gmail returned no threadId for send to ${args.to}`);
  return threadId;
}

/** Send the one-and-only follow-up, as a reply inside the existing thread. */
export async function sendFollowUpEmail(
  gmail: gmail_v1.Gmail,
  args: {
    from: string;
    to: string;
    subject: string;
    text: string;
    threadId: string;
    inReplyTo?: string;
  },
): Promise<void> {
  const mime = await buildMimeMessage({
    from: args.from,
    to: args.to,
    subject: args.subject,
    text: args.text,
    inReplyTo: args.inReplyTo,
    references: args.inReplyTo,
  });
  await gmail.users.messages.send({
    userId: "me",
    media: { mimeType: "message/rfc822", body: mime },
    requestBody: { threadId: args.threadId },
  });
}
