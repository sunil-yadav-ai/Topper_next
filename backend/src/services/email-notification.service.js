import { sendActionEmail } from "./email.service.js";
import {
  createBrandedEmail,
  createResourceUploadEmail,
} from "./email-templates.js";

function logEmailFailure(context, error) {
  const code = typeof error?.code === "string" ? error.code : "UNKNOWN";
  console.error(`Email ${context} failed (code: ${code}).`);
}

export async function sendEmailSafely({
  id,
  to,
  subject,
  text,
}) {
  try {
    await sendActionEmail({
      to,
      subject,
      text,
      html: createBrandedEmail({ subject, text }),
    });
    return true;
  } catch (error) {
    logEmailFailure(id, error);
    return false;
  }
}

export async function sendResourceUploadEmail({
  Model,
  resourceId,
  recipientEmail,
  studentName,
  resourceName,
  category,
  status,
  uploadedAt,
}) {
  try {
    const resource = await Model.findOneAndUpdate(
      { _id: resourceId, emailNotificationStatus: "pending" },
      { $set: { emailNotificationStatus: "sending" } },
      { new: true },
    );
    if (!resource) return false;
  } catch (error) {
    logEmailFailure(`upload notification claim for resource ${resourceId}`, error);
    return false;
  }

  try {
    const formattedDate = new Date(uploadedAt).toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const { text, html } = createResourceUploadEmail({
      studentName,
      resourceName,
      category,
      status,
      uploadedAt: formattedDate,
    });
    await sendActionEmail({
      to: recipientEmail,
      subject: `Topper upload confirmed: ${resourceName}`,
      text,
      html,
    });
  } catch (error) {
    logEmailFailure(`upload confirmation for resource ${resourceId}`, error);
    try {
      await Model.updateOne(
        { _id: resourceId, emailNotificationStatus: "sending" },
        { $set: { emailNotificationStatus: "failed" } },
      );
    } catch (updateError) {
      logEmailFailure(`upload notification status update for resource ${resourceId}`, updateError);
    }
    return false;
  }

  try {
    await Model.updateOne(
      { _id: resourceId, emailNotificationStatus: "sending" },
      {
        $set: {
          emailNotificationStatus: "sent",
          emailNotificationSentAt: new Date(),
        },
      },
    );
  } catch (error) {
    logEmailFailure(`upload notification status update for resource ${resourceId}`, error);
  }
  return true;
}
