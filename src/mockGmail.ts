/**
 * In-memory stand-in for the Gmail API, used only when MOCK_MODE=true.
 * Implements just the three methods the rest of the code calls
 * (getProfile, threads.get, messages.send) so a full daily run can be
 * exercised with zero Google credentials and zero real emails.
 */
import { gmail_v1 } from "googleapis";
import { MOCK_SENDER_EMAIL } from "./config.js";

interface MockMessage {
  from: string;
  messageId: string;
}

const threads = new Map<string, MockMessage[]>();
let nextNewThreadId = 1;

function seedThread(threadId: string, messages: MockMessage[]): void {
  threads.set(threadId, messages);
}

// Pre-seeded so the sample CSV (scripts/mock-data/contacts.seed.csv) can
// reference these thread IDs and demonstrate reply detection without any
// send happening first.
seedThread("mock-thread-replied-1", [
  { from: MOCK_SENDER_EMAIL, messageId: "<seed-initial-replied@mock>" },
  { from: "owner@quietcafe.example", messageId: "<seed-reply@mock>" },
]);
seedThread("mock-thread-quiet-1", [
  { from: MOCK_SENDER_EMAIL, messageId: "<seed-initial-quiet@mock>" },
]);
seedThread("mock-thread-recent-1", [
  { from: MOCK_SENDER_EMAIL, messageId: "<seed-initial-recent@mock>" },
]);
seedThread("mock-thread-followedup-1", [
  { from: MOCK_SENDER_EMAIL, messageId: "<seed-initial-followedup@mock>" },
  { from: MOCK_SENDER_EMAIL, messageId: "<seed-followup-followedup@mock>" },
]);

export function createMockGmail(): gmail_v1.Gmail {
  const client = {
    users: {
      getProfile: async () => ({ data: { emailAddress: MOCK_SENDER_EMAIL } }),

      threads: {
        get: async ({ id }: { id: string }) => {
          const messages = threads.get(id) ?? [];
          return {
            data: {
              messages: messages.map((m) => ({
                payload: {
                  headers: [
                    { name: "From", value: m.from },
                    { name: "Message-ID", value: m.messageId },
                  ],
                },
              })),
            },
          };
        },
      },

      messages: {
        send: async ({
          requestBody,
        }: {
          requestBody?: { threadId?: string };
        }) => {
          const threadId =
            requestBody?.threadId ?? `mock-thread-new-${nextNewThreadId++}`;
          const messageId = `<mock-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2)}@mock>`;
          const existing = threads.get(threadId) ?? [];
          existing.push({ from: MOCK_SENDER_EMAIL, messageId });
          threads.set(threadId, existing);
          return { data: { threadId, id: messageId } };
        },
      },
    },
  };
  return client as unknown as gmail_v1.Gmail;
}
