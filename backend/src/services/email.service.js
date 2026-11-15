import nodemailer from "nodemailer";
import { env } from "../config/env.js";

let transporter;

function emailError(code, message) {
  const error = new Error(message);
  error.code = `EMAIL_${code}`;
  error.statusCode = 503;
  error.expose = true;
  return error;
}

function isEmailError(error) {
  return typeof error?.code === "string" && error.code.startsWith("EMAIL_");
}

function getSmtpFailure(error) {
  switch (error?.code) {
    case "EAUTH":
      return emailError(
        "SMTP_AUTHENTICATION_FAILED",
        "SMTP authentication failed. Check SMTP_USER and SMTP_PASSWORD. For Gmail, use an App Password.",
      );
    case "ECONNECTION":
    case "ECONNREFUSED":
    case "ECONNRESET":
    case "EDNS":
    case "ETIMEDOUT":
    case "ESOCKET":
      return emailError(
        "SMTP_CONNECTION_FAILED",
        "Could not connect to the SMTP server. Check SMTP_HOST, SMTP_PORT, and your network connection.",
      );
    case "ETLS":
    case "CERT_HAS_EXPIRED":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
      return emailError(
        "SMTP_TLS_FAILED",
        "The secure SMTP connection failed. Check SMTP_HOST, SMTP_PORT, and SMTP_SECURE.",
      );
    default:
      return emailError(
        "SMTP_OPERATION_FAILED",
        "Email delivery failed. Check the SMTP settings and run the SMTP connection test.",
      );
  }
}

function getTransporter() {
  const missingSettings = [
    ["SMTP_HOST", env.smtpHost],
    ["SMTP_USER", env.smtpUser],
    ["SMTP_PASSWORD", env.smtpPassword],
    ["EMAIL_FROM", env.emailFrom],
  ]
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);

  if (missingSettings.length > 0) {
    throw emailError(
      "CONFIGURATION_MISSING",
      `Email delivery is not configured. Set ${missingSettings.join(", ")} in backend/.env. For Gmail, use an App Password for SMTP_PASSWORD.`,
    );
  }

  transporter ??= nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpSecure,
    requireTLS: env.smtpPort === 587 && !env.smtpSecure,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: { user: env.smtpUser, pass: env.smtpPassword },
  });

  return transporter;
}

export async function sendActionEmail({ to, subject, text, html }) {
  try {
    await getTransporter().sendMail({
      from: env.emailFrom,
      to,
      subject,
      text,
      html,
    });
  } catch (error) {
    if (isEmailError(error)) throw error;
    throw getSmtpFailure(error);
  }
}

export async function verifyEmailConnection() {
  try {
    await getTransporter().verify();
  } catch (error) {
    if (isEmailError(error)) throw error;
    throw getSmtpFailure(error);
  }
}
