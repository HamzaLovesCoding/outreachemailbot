import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** OAuth client settings, from the env vars mirroring Google's credentials JSON. */
export function getOAuthConfig() {
  return {
    clientId: required("client_id"),
    clientSecret: required("client_secret"),
    projectId: process.env.project_id ?? "",
    authUri: process.env.auth_uri ?? "https://accounts.google.com/o/oauth2/auth",
    tokenUri: process.env.token_uri ?? "https://oauth2.googleapis.com/token",
    authProviderX509CertUrl:
      process.env.auth_provider_x509_cert_url ??
      "https://www.googleapis.com/oauth2/v1/certs",
  };
}

export function getRefreshToken(): string {
  return required("GMAIL_REFRESH_TOKEN");
}

export function getSenderName(): string {
  return process.env.SENDER_NAME ?? "Hamza Wadera";
}

export function getSenderContact(): string {
  return process.env.SENDER_CONTACT ?? "penguinempiremarketing@gmail.com";
}

/** Max number of INITIAL emails sent per run. */
export const MAX_INITIAL_SENDS_PER_RUN = Number(
  process.env.MAX_INITIAL_SENDS_PER_RUN ?? 15,
);

/** Days to wait after the initial email before the single follow-up. */
export const FOLLOW_UP_AFTER_DAYS = Number(
  process.env.FOLLOW_UP_AFTER_DAYS ?? 7,
);

/** Random stagger between individual sends: 2–5 minutes by default. */
export const SEND_DELAY_MIN_MS = Number(
  process.env.SEND_DELAY_MIN_MS ?? 2 * 60 * 1000,
);
export const SEND_DELAY_MAX_MS = Number(
  process.env.SEND_DELAY_MAX_MS ?? 5 * 60 * 1000,
);

/** When true, logs every action but sends nothing and writes nothing. */
export const DRY_RUN = process.env.DRY_RUN === "true";

/**
 * When true, replaces the Gmail API with an in-memory fake (src/mockGmail.ts)
 * so the full daily run can be tested with no Google credentials and no real
 * emails. Combine with CONTACTS_CSV_PATH pointing at a throwaway CSV.
 */
export const MOCK_MODE = process.env.MOCK_MODE === "true";
export const MOCK_SENDER_EMAIL =
  process.env.MOCK_SENDER_EMAIL ?? "penguinempiremarketing@example.com";

export const CONTACTS_CSV_PATH = process.env.CONTACTS_CSV_PATH ?? "data/contacts.csv";
export const ATTACHMENTS_DIR = process.env.ATTACHMENTS_DIR ?? "Emailattachments";
