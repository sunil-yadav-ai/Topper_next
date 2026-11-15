import { verifyEmailConnection } from "../services/email.service.js";

try {
  await verifyEmailConnection();
  console.log("SMTP connection verified successfully.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
