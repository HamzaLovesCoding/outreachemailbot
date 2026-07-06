import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";

export type ContactStatus = "not_sent" | "sent" | "followed_up" | "responded";

export interface Contact {
  name: string;
  email: string;
  status: ContactStatus;
  threadId: string;
  sentDate: string; // YYYY-MM-DD, empty until initial email is sent
  followUpDate: string; // YYYY-MM-DD, empty until follow-up is sent
}

const COLUMNS = [
  "name",
  "email",
  "status",
  "threadId",
  "sentDate",
  "followUpDate",
] as const;

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "not_sent",
  "sent",
  "followed_up",
  "responded",
]);

export function loadContacts(csvPath: string): Contact[] {
  const raw = fs.readFileSync(csvPath, "utf8");
  const rows: Record<string, string>[] = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return rows.map((row, i) => {
    const status = row.status || "not_sent";
    if (!VALID_STATUSES.has(status)) {
      throw new Error(
        `Row ${i + 2} of ${csvPath}: unknown status "${status}" for ${row.email}`,
      );
    }
    if (!row.email) {
      throw new Error(`Row ${i + 2} of ${csvPath}: missing email`);
    }
    return {
      name: row.name ?? "",
      email: row.email,
      status: status as ContactStatus,
      threadId: row.threadId ?? "",
      sentDate: row.sentDate ?? "",
      followUpDate: row.followUpDate ?? "",
    };
  });
}

/**
 * Persist all contacts. Written atomically (temp file + rename) so a crash
 * mid-write can never leave a truncated CSV behind.
 */
export function saveContacts(csvPath: string, contacts: Contact[]): void {
  const csv = stringify(contacts, { header: true, columns: [...COLUMNS] });
  const tmpPath = path.join(
    path.dirname(csvPath),
    `.${path.basename(csvPath)}.tmp`,
  );
  fs.writeFileSync(tmpPath, csv, "utf8");
  fs.renameSync(tmpPath, csvPath);
}
