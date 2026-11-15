import assert from "node:assert/strict";
import test from "node:test";
import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { sendResourceUploadEmail } from "./email-notification.service.js";

test("sends one confirmation after claiming a saved upload and records delivery", async () => {
  const originalCreateTransport = nodemailer.createTransport;
  const oldSettings = {
    smtpUser: env.smtpUser,
    smtpPassword: env.smtpPassword,
    emailFrom: env.emailFrom,
  };
  let email;
  let status = "pending";
  const Model = {
    async findOneAndUpdate(filter, update) {
      assert.equal(filter.emailNotificationStatus, "pending");
      if (status !== "pending") return null;
      status = update.$set.emailNotificationStatus;
      return { _id: "resource-123" };
    },
    async updateOne(_filter, update) {
      status = update.$set.emailNotificationStatus;
    },
  };

  nodemailer.createTransport = () => ({
    async sendMail(message) {
      if (message.to === "failed@example.com") {
        throw Object.assign(new Error("SMTP password must not be logged"), {
          code: "EAUTH",
        });
      }
      email = message;
    },
  });
  env.smtpUser = "student@example.com";
  env.smtpPassword = "test-password";
  env.emailFrom = "Topper <student@example.com>";

  try {
    const sent = await sendResourceUploadEmail({
      Model,
      resourceId: "resource-123",
      recipientEmail: "student@example.com",
      studentName: "Ada Student",
      resourceName: "Calculus Notes",
      category: "Handwritten notes",
      status: "Successfully uploaded",
      uploadedAt: new Date("2026-11-02T16:30:00.000Z"),
    });

    assert.equal(sent, true);
    assert.equal(status, "sent");
    assert.equal(email.to, "student@example.com");
    assert.match(email.subject, /Calculus Notes/);
    assert.match(email.html, /Handwritten notes/);
    assert.match(email.html, /Successfully uploaded/);
    assert.match(email.html, /Uploaded:/);

    const duplicateSent = await sendResourceUploadEmail({
      Model,
      resourceId: "resource-123",
      recipientEmail: "student@example.com",
      studentName: "Ada Student",
      resourceName: "Calculus Notes",
      category: "Handwritten notes",
      status: "Successfully uploaded",
      uploadedAt: new Date("2026-11-02T16:30:00.000Z"),
    });

    assert.equal(duplicateSent, false);

    let failedStatus = "pending";
    const FailedModel = {
      async findOneAndUpdate(_filter, update) {
        if (failedStatus !== "pending") return null;
        failedStatus = update.$set.emailNotificationStatus;
        return { _id: "resource-456" };
      },
      async updateOne(_filter, update) {
        failedStatus = update.$set.emailNotificationStatus;
      },
    };
    const failedSend = await sendResourceUploadEmail({
      Model: FailedModel,
      resourceId: "resource-456",
      recipientEmail: "failed@example.com",
      studentName: "Ada Student",
      resourceName: "Failed Notes",
      category: "Handwritten notes",
      status: "Successfully uploaded",
      uploadedAt: new Date("2026-11-02T16:30:00.000Z"),
    });

    assert.equal(failedSend, false);
    assert.equal(failedStatus, "failed");
  } finally {
    nodemailer.createTransport = originalCreateTransport;
    Object.assign(env, oldSettings);
  }
});
