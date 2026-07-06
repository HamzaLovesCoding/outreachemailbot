/**
 * One-time local OAuth flow. Run with: npm run authorize
 *
 * Needs client_id and client_secret in the environment (or a local .env).
 * Opens a browser, you approve the gmail.send + gmail.readonly scopes, and
 * the refresh token is printed so you can save it as the GMAIL_REFRESH_TOKEN
 * secret. Never commit the token anywhere.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { createOAuthClient } from "../src/gmail.js";

const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open";
  spawn(cmd, [url], { stdio: "ignore", detached: true }).on("error", () => {
    /* fall back to the printed URL */
  });
}

async function main(): Promise<void> {
  const client = createOAuthClient(REDIRECT_URI);
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force a refresh token even if previously authorized
    scope: SCOPES,
  });

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const error = url.searchParams.get("error");
      const authCode = url.searchParams.get("code");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        error
          ? `<h2>Authorization failed: ${error}</h2>`
          : "<h2>Authorized! You can close this tab and return to the terminal.</h2>",
      );
      server.close();
      if (error) reject(new Error(`OAuth error: ${error}`));
      else if (authCode) resolve(authCode);
      else reject(new Error("No code in OAuth callback"));
    });
    server.listen(PORT, () => {
      console.log("Opening browser for Google sign-in...");
      console.log(`If it doesn't open, visit:\n\n${authUrl}\n`);
      openBrowser(authUrl);
    });
  });

  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh token returned. Remove this app's access at https://myaccount.google.com/permissions and run again.",
    );
  }

  console.log("\nSuccess! Save this as your GMAIL_REFRESH_TOKEN secret");
  console.log("(GitHub repo -> Settings -> Secrets and variables -> Actions):\n");
  console.log(tokens.refresh_token);
  console.log("\nDo not commit this value to the repository.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
