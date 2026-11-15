import assert from "node:assert/strict";
import test from "node:test";
import { createResourceUploadEmail } from "./email-templates.js";

test("creates branded upload confirmations and escapes dynamic HTML content", () => {
  const email = createResourceUploadEmail({
    studentName: "Ada <script>",
    resourceName: "Calculus & Algebra",
    category: "Notes",
    status: "Successfully uploaded",
    uploadedAt: "Nov 2, 2026, 10:00 pm",
  });

  assert.match(email.html, /Topper/);
  assert.match(email.html, /Upload confirmed/);
  assert.match(email.html, /Ada &lt;script&gt;/);
  assert.match(email.html, /Calculus &amp; Algebra/);
  assert.match(email.html, /Category: Notes/);
  assert.match(email.html, /Status: Successfully uploaded/);
  assert.match(email.text, /Uploaded: Nov 2, 2026, 10:00 pm/);
  assert.match(email.text, /Your upload was received successfully/);
});
