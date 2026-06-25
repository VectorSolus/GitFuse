import { google } from "googleapis";

import { requiredResendConfig, sendEmail } from "./resend";

export type TransactionalEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

function requiredGmailConfig() {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
  const senderEmail = process.env.GMAIL_SENDER_EMAIL?.trim();

  const missing = [
    ["GMAIL_CLIENT_ID", clientId],
    ["GMAIL_CLIENT_SECRET", clientSecret],
    ["GMAIL_REFRESH_TOKEN", refreshToken],
    ["GMAIL_SENDER_EMAIL", senderEmail],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(
      `Gmail email provider is missing required environment variables: ${missing.join(", ")}`,
    );
  }

  return {
    clientId: clientId as string,
    clientSecret: clientSecret as string,
    refreshToken: refreshToken as string,
    senderEmail: senderEmail as string,
  };
}

function sanitizeHeader(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function encodeSubject(value: string) {
  return `=?UTF-8?B?${Buffer.from(sanitizeHeader(value), "utf8").toString("base64")}?=`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildGmailMessage(input: TransactionalEmailInput, senderEmail: string) {
  const senderName = sanitizeHeader(process.env.GMAIL_FROM_NAME ?? "GitFuse");
  const html =
    input.html ??
    `<div style="white-space:pre-wrap">${escapeHtml(input.text)}</div>`;
  const message = [
    `From: ${senderName} <${sanitizeHeader(senderEmail)}>`,
    `To: ${sanitizeHeader(input.to)}`,
    `Subject: ${encodeSubject(input.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
  ].join("\r\n");

  return Buffer.from(message, "utf8").toString("base64url");
}

function htmlForInput(input: TransactionalEmailInput) {
  return (
    input.html ??
    `<div style="white-space:pre-wrap">${escapeHtml(input.text)}</div>`
  );
}

async function sendWithGmail(input: TransactionalEmailInput) {
  const config = requiredGmailConfig();
  const auth = new google.auth.OAuth2(config.clientId, config.clientSecret);
  auth.setCredentials({ refresh_token: config.refreshToken });

  const gmail = google.gmail({ version: "v1", auth });
  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: buildGmailMessage(input, config.senderEmail),
    },
  });
}

async function sendWithResend(input: TransactionalEmailInput) {
  requiredResendConfig();

  await sendEmail({
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: htmlForInput(input),
  });
}

export async function sendTransactionalEmail(
  input: TransactionalEmailInput,
): Promise<void> {
  const provider = process.env.EMAIL_PROVIDER?.trim().toLowerCase();

  if (provider === "gmail") {
    await sendWithGmail(input);
    return;
  }

  if (provider === "resend") {
    await sendWithResend(input);
    return;
  }

  if (!provider && process.env.RESEND_API_KEY?.trim()) {
    await sendWithResend(input);
    return;
  }

  if (process.env.NODE_ENV !== "production" && !provider) {
    console.info("[transactional-email]", {
      to: input.to,
      subject: input.subject,
      text: input.text,
    });
    return;
  }

  throw new Error(
    provider
      ? `Email provider "${provider}" is not configured.`
      : "No transactional email provider is configured.",
  );
}
