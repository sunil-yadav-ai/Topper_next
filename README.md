# Student Academic Resource Sharing Platform

This repository contains a Next.js JavaScript application with a Tailwind CSS
UI and native Next.js Route Handler APIs, backed by MongoDB/Mongoose. There is
no Express server; API requests, authentication, email notifications, password
recovery, uploads, and OCR workflows run in the Next.js Node.js runtime.

## Requirements

- Node.js 20.19+ or 22.12+
- npm
- MongoDB running locally, or a MongoDB connection string

## Run locally

1. Copy `backend/.env.example` to `backend/.env`.
2. Set `MONGODB_URI` if needed and generate a private `JWT_SECRET` of at least
   32 characters (for example, `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
   Set `FRONTEND_URL` to `http://localhost:3000` for local email links; the
   default already uses the Next.js development origin.
3. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
   `SMTP_PASSWORD`, and `EMAIL_FROM` in `backend/.env` for email notifications.
   Gmail defaults to `smtp.gmail.com:587` with STARTTLS; use a Google App
   Password for `SMTP_PASSWORD`. Run
   `npm run test-email --workspace=backend` to test SMTP connectivity without
   sending an email.
4. Copy `frontend/.env.example` to `frontend/.env` to configure the optional
   public settings. Keep secrets such as API keys in `backend/.env`, never in
   `NEXT_PUBLIC_*` variables.
5. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and
   `CLOUDINARY_API_SECRET` in `backend/.env` to enable private note uploads.
6. Create a Gemini API key in
   [Google AI Studio](https://aistudio.google.com/app/apikey) and set
   `GEMINI_API_KEY` in `backend/.env`. The key and all Gemini requests stay on
   the backend. The example uses the stable `gemini-3.5-flash-lite` model for
   OCR, syllabus analysis, verification, and tutoring; each feature can use a
   different supported model through its `GEMINI_*_MODEL` setting.
7. Set `OCR_ENCRYPTION_KEY` to a new random 32-byte base64 or 64-character
   hexadecimal key. Generate a base64 key with
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
   Preserve an existing key so previously encrypted OCR and syllabus records
   remain readable.
8. Set `MIN_VERIFIABLE_STATEMENTS` if the default minimum of five should change.
   The configurable `GEMINI_USER_DAILY_REQUEST_LIMIT` and
   `GEMINI_USER_MINUTE_REQUEST_LIMIT` defaults limit each student's Gemini API
   requests and are tracked atomically in MongoDB across backend instances.
   Review your active Google AI Studio project quotas; Gemini Free Tier is not
   unlimited.
9. Run `npm install` from the repository root.
10. Run `npm run dev` to start the Next.js application.

The Next.js application serves the frontend and API at `http://localhost:3000`;
its `GET /api/health` endpoint reports server and database readiness. Use
`npm run build` to build the application and `npm start` to run the production
build. API route handlers use Web `Request`/`Response` objects and initialize
MongoDB and the OCR worker inside the Next.js runtime.

## Frontend loading behavior

- The existing full-screen intro runs once when the app document loads and
  stores its completion in `sessionStorage`. Internal route changes and auth
  updates do not replay it; refreshing or opening a new tab starts a new intro.
- Lazy route transitions use the existing Topper logo loader instead of the
  full-screen intro. API `GET` requests share a delayed, non-blocking logo
  indicator that stays visible until all tracked requests succeed or fail.
- Loading animations respect `prefers-reduced-motion`, and request errors are
  left to the page's existing error handling rather than leaving a loader active.
- Run `npm test --workspace=frontend` to test API request loading aggregation.

## Search engine optimization

- The frontend uses explicit Next.js App Router pages with native `Link`,
  `useRouter`, and `usePathname` navigation. Public subject and resource pages
  render on the server and generate canonical, Open Graph, and Twitter metadata.
  `/robots.txt` and `/sitemap.xml` use Next.js metadata routes; no crawler-only
  routing layer is required.
- Frontend routes: `/`; `/subjects`, `/subjects/[slug]`, and
  `/subjects/[slug]/topics/[topicSlug]`; `/notes/[resourceId]` and its slug
  variant; `/question-papers/[resourceId]` and its slug variant; `/pyqs`,
  `/search`, `/resources/[resourceType]/[resourceId]`, `/advertising`, `/terms`,
  `/library`, `/practice`, `/uploads`, `/upload`, `/notifications`, `/syllabus`,
  `/dashboard` (redirects to `/search`), `/profile/[username]`, `/admin`,
  `/admin/dashboard`, `/login`, `/admin/login`, `/register`,
  `/forgot-password`, `/reset-password`, `/verify-email`, and
  `/resend-verification`. API handlers remain under `/api/*`.
- Set `FRONTEND_URL` to the public frontend origin (scheme and host, without a
  path) in the backend environment. It is used for canonical links and sitemap
  entries. The sitemap includes the home, question-paper, legal, sufficiently
  populated subject/topic, and published resource pages. Sitemap entries are
  queried from MongoDB when connected and refresh on request; the public
  resource endpoints cache briefly.
- Deploy the Next.js application as a Node.js server so its API route handlers
  can use MongoDB and the existing backend services. `NEXT_PUBLIC_API_BASE_URL`
  defaults to `/api` and should only be changed when intentionally using a
  separate API origin. Set the deployment root to the repository root (not
  `backend` or `frontend`): the npm workspace lockfile is at the repository
  root, and the Next.js app imports backend workspace code. Use `npm ci` to
  install, `npm run build` to build, and `npm start` to start the app. Use
  Node.js 20.19+ or 22.12+.
- Public resource pages read only published records with an explicit
  `visibility: "public"` value. Private, unpublished, unlisted, or legacy
  records without explicit public visibility are excluded. Pages expose
  resource metadata, not secure-storage URLs, uploader names, or student
  account data; opening the underlying file continues to require sign-in.
- `/search` and account, authentication, admin, profile, library, upload,
  notification, practice, syllabus, and authenticated resource-view pages are
  excluded from indexing. Search output pages canonicalize to the clean path;
  search itself is not included in the sitemap.
- To submit the sitemap, add and verify the production site in Google Search
  Console using the Domain DNS or URL-prefix HTML/file/DNS verification method
  available for your deployment. Then submit
  `https://YOUR_PUBLIC_DOMAIN/sitemap.xml` under **Sitemaps**. Check
  `https://YOUR_PUBLIC_DOMAIN/robots.txt`, use URL Inspection for important
  public pages, and resolve reported crawl/indexing issues. Submitting a
  sitemap does not guarantee indexing.

## Authentication

- Students register at `/register` with their academic profile. Student
  registration is the only public registration path; it never accepts a role.
- User roles are stored in MongoDB as `user` or `admin`; new accounts default
  to `user`, and registration/profile requests cannot set a role. On database
  connection, existing `student` role values are migrated to `user` without
  deleting accounts. To promote an account manually, change its `role` to
  `admin` in MongoDB Atlas or Compass. Admin authorization reloads the current
  database role for every protected API request, so changing a role takes
  effect immediately on the backend; reload or sign in again to refresh the
  frontend session view.
- Registered users have a unique public username and profile at
  `/profile/:username`. Public profiles show academic details and approved
  contributions only; email and password are never included. Profile changes
  use authenticated `PATCH /api/profiles/me` and cannot change roles. Existing
  accounts are assigned usernames when MongoDB connects. Profiles use initials
  when no photo is set. Owners may upload a JPG, PNG, or WebP profile photo
  (maximum 5 MB) through the same authenticated profile update endpoint; images
  are stored in the configured Cloudinary account.
- Email verification is optional and is not required to register or sign in.
- `/login` is for students; `/admin/login` is for provisioned administrators.
- Authenticated sessions use a signed JWT in an HttpOnly, SameSite cookie.
  Passwords are bcrypt-hashed. Optional verification and password-reset links
  are single-use, hashed in MongoDB, and expire after one hour. Transactional
  email is sent by the backend Nodemailer service.
- Provision an initial admin by temporarily setting `ADMIN_NAME`, `ADMIN_EMAIL`,
  and `ADMIN_PASSWORD` in `backend/.env`, then running
  `npm run create-admin --workspace=backend`. The command refuses to change an
  existing account's role. Remove the `ADMIN_*` values afterward.
- Auth endpoints are under `/api/auth`: `POST /register`, `/login`,
  `/admin/login`, `/logout`, `/verify-email`, `/resend-verification`,
  `/forgot-password`, and `/reset-password`; `GET /me` returns the signed-in
  user. Admin-only API routes use the `requireRole("admin")` middleware.
- Set `FRONTEND_URL` to the public frontend origin for email links and
  `CORS_ORIGIN` to the exact allowed browser origin. Set `NODE_ENV=production`
  when deployed so auth cookies use the `Secure` flag. Keep `.env` files and
  secrets out of source control.

## Student dashboard data

- `GET /api/dashboard` requires an authenticated student session and returns the
  current MongoDB profile, contribution counts, saved resources, and
  recent activity. Counts are aggregated from `Resource` documents owned by
  that student; there are no seeded or placeholder statistics.
- Resource records use `type` (`note`, `pyq`, or `other`), `status`
  (`pending`, `approved`, or `rejected`), `uploadedBy`, and `pointsAwarded`.
  Contributor points count only points on eligible contributions. A future upload
  and moderation workflow should create/update these resource records.
- `PATCH /api/dashboard/profile` updates editable student profile fields.
  Profile pictures are currently stored as validated HTTP(S) image URLs.
- `POST` and `DELETE /api/dashboard/saved-resources/:resourceId` save or remove
  published resource references. Profile edits and saved-resource changes are
  recorded in the MongoDB activity collection.

## Handwritten note uploads

- Students can upload PDF, JPG/JPEG, and PNG notes (maximum 10 MB) from
  `/upload` or their dashboard. The upload form captures title, description, department, batch,
  semester, subject, unit, and topic; department, batch, and semester default
  to the student's profile.
- `POST /api/notes` accepts multipart form data with a `file` field and the
  note metadata. `GET /api/notes` lists only the signed-in student's notes,
  and `DELETE /api/notes/:noteId` deletes only that student's note. Published
  files are viewed through the authenticated in-app resource viewer.
- Files are signature-checked and stored as authenticated Cloudinary assets.
  After the resource is saved, the backend sends the uploader an email
  confirmation through Nodemailer. Email delivery failures are logged and do
  not undo or fail a successful upload.
  Each upload creates a publicly visible `Note` immediately and a
  `NoteVerificationJob` of type `ai_handwritten_note` in the durable queued
  state. OCR and academic verification run independently of publication; the
  actual verification decision is retained and never changed to make the note
  public.
- A separate MongoDB-backed OCR worker splits PDFs into individual pages and
  sends each page (or each uploaded image) to Gemini through Google's official
  `@google/genai` SDK.
  It stores each page number, transcription, formulas, readability,
  confidence, and unclear regions in an AES-256-GCM encrypted MongoDB result.
  `GET /api/notes/:noteId/ocr` returns the decrypted structured result only to
  the note owner. OCR retries failures up to three times, records processing
  state, and never treats unclear handwriting as incorrect. Set
  `GEMINI_OCR_MODEL` to choose another supported multimodal model; OCR is not
  available until both the Gemini key and encryption key are configured.
- The worker then checks definitions, formulas, calculations, factual claims,
  explanations, contradictions, materially missing calculation steps, and
  subject relevance using the separate academic verification service.
  `ACADEMIC_REFERENCE_DOMAINS` controls which grounded citation domains can be
  used; `GEMINI_VERIFICATION_MODEL` selects the review model.
  Every finding includes the original statement, page, category, explanation,
  suggested correction, confidence, and cited verification evidence. A
  finding is `CONFIRMED_ERROR` only when its statement matches the OCR and it
  has a cited reference; unsupported or unclear findings remain `UNCERTAIN`.
  Results are encrypted separately in MongoDB and are available only to the
  owner at `GET /api/notes/:noteId/verification`. Review never edits notes or
  publishes them.
- Gemini quota and user limits stop processing without retrying requests that
  cannot succeed. After the applicable project quota or user limit resets, run
  `npm run retry-failed-note-ocr --workspace=backend -- --include-published --apply`.
  This requeues failed OCR for published notes without changing their
  publication or verification state. The same Gemini service powers the
  syllabus analyzer, verification, AI Practice, and the note tutor.
- Google Search grounding is disabled by default because Google's current
  pricing documentation marks it unavailable on the Gemini Free Tier for
  Gemini 3.5 Flash-Lite. In Free Tier mode the verifier still validates OCR
  provenance and produces a report, but cannot confirm factual errors without
  grounded citations; those findings remain `UNCERTAIN`. To enable grounded
  citations, use an eligible paid project and explicitly set
  `GEMINI_VERIFICATION_USE_GOOGLE_SEARCH=true`; search grounding has separate
  project quotas and may incur charges. Never treat model-generated URLs as
  citations unless they are present in Gemini's grounding metadata.
- Automatic decisions use only confirmed-error counts divided by the number
  of verifiable statements. Up to and including 5% is `APPROVED`; above 5%
  through 10% is `APPROVED_WITH_WARNING`; above 10% is `REJECTED`. Uncertain
  claims never count as errors. Unreadable pages contribute no verifiable
  statements; unreliable reviews and notes with fewer than
  `MIN_VERIFIABLE_STATEMENTS` are sent to `NEEDS_HUMAN_REVIEW`. No confidence
  score is used in the mistake-percentage calculation or approval thresholds.
- OCR and AI verification outcomes do not gate publication. Authenticated
  students can discover uploaded notes at `GET /api/notes/published`; failed
  OCR or a negative AI result remains visible as an accurate status to the
  uploader.
  Students receive a direct Nodemailer email decision after verification;
  email delivery failures are logged and do not undo the decision. Owners can
  resubmit a corrected file for a rejected note at
  `POST /api/notes/:noteId/resubmissions`; this creates a new revision
  and restarts OCR and verification. Original versions remain unchanged.
  Encrypted decision reports and revision history are available from the
  owner's verification endpoint and dashboard.

## Previous year question papers

- `/pyqs` provides public, free browsing and filtering by semester, subject,
  and examination year. Uploading, bookmarking, and
  reporting require an authenticated student session.
- Students upload papers from `/upload` or `/pyqs` with university, college,
  department, course, semester, subject, examination year, exam type, title,
  description, and a PDF/JPG/JPEG/PNG file (maximum 20 MB). Files are
  signature-checked and stored as authenticated Cloudinary assets using the
  existing Cloudinary configuration. Each paper records its original uploader
  and is published immediately. Authenticated students view papers in-app;
  permanent storage URLs are not returned by APIs.
- After MongoDB saves a paper, the backend sends the uploader a confirmation
  email through Nodemailer. Email delivery failures do not undo or fail the
  successful upload.
- The dedicated `/upload` form also accepts question-paper PDFs and images.
  Students can review uploaded notes and PYQs, including OCR/AI status,
  in the **My uploads** section of `/library`.
- The API includes `GET /api/pyqs`,
  `POST /api/pyqs`, `GET /api/pyqs/bookmarks`,
  `POST`/`DELETE /api/pyqs/:pyqId/bookmark`, and
  `POST /api/pyqs/:pyqId/reports`. Reports can flag incorrect or duplicate
  published papers. A student can submit one report per paper.
- No payment or subscription is required to browse papers.

## Academic resource search

- `/search` searches all published notes and PYQs, regardless of OCR or AI
  verification outcomes.
- Search supports subjects, topics, units, and full-text resource details,
  with filters for department, university, college, batch, semester, subject,
  unit, topic, and resource type. Suggestions are debounced in the interface;
  results support pagination and sorting by recent uploads or student helpful
  votes.
- Search normalizes spacing and word forms, tolerates one-edit spelling errors
  and partial words, and ranks exact, close, partial, then local semantic-alias
  matches. Notes are indexed from their metadata and encrypted OCR transcript;
  OCR stays encrypted at rest. Search candidates are retrieved through bounded
  MongoDB n-gram queries, and no external AI call is made for search keystrokes.
- `GET /api/search` accepts `q`, the academic filters, `resourceType` (`note`
  or `pyq`), `sort` (`recent` or `helpful`), `page`, and `limit`.
  `GET /api/search/suggestions?q=...` returns published subject, topic, unit,
  and title suggestions. Verified students can mark a resource helpful once
  with `POST /api/search/:resourceType/:resourceId/helpful`.
- MongoDB indexes support published-resource filters, academic facets,
  recent/helpful ordering, and fuzzy-search n-grams. Existing note OCR and
  resource metadata are indexed in batches on database startup.

## AI syllabus analysis

- Verified students can upload a PDF, JPG/JPEG, or PNG syllabus (up to 10 MB)
  at `/syllabus`. PDFs are limited to 50 pages. Text-based PDF pages are
  extracted directly; sparse, scanned, or image-containing pages and uploaded
  images use the configured Gemini multimodal model. Every page is accounted
  for.
- The backend organizes source-listed course, semester, subjects, codes, unit
  numbers, topics, and subtopics in bounded text chunks. OCR text and the
  outline are encrypted in MongoDB with `OCR_ENCRYPTION_KEY`; records are
  accessible only to the uploading student. The original syllabus file is not
  retained. Exact duplicate uploads by the same student reuse their existing
  analysis, while failed analyses may be retried.
- Students can review, add, remove, and correct extracted outline entries.
  Students can regenerate the outline from the stored, encrypted OCR text or
  copy the reviewed topics. Resource matching is not run until the
  student saves corrections and confirms the syllabus.
- Matching queries use published notes, including their encrypted OCR text,
  and relevant PYQs. Fuzzy topic matching uses note titles, descriptions,
  academic metadata, OCR text, and PYQ titles/descriptions. PYQs without
  topic-specific metadata remain subject-level matches. Missing-topic states
  come from actual database records; no placeholder resources are generated.
- APIs under `/api/syllabus-analyses` provide upload, owner-scoped list/detail,
  correction, source-grounded regeneration, and confirmation/resource matching.
  Configure `GEMINI_API_KEY` and `OCR_ENCRYPTION_KEY`;
  `GEMINI_SYLLABUS_MODEL` selects the syllabus model.

## AI Practice

- Authenticated students can start an adaptive tutor session at `/practice`.
  Department, course, semester, subject, and optional topic choices come from
  the student profile, accessible note and previous-paper metadata, and the
  student's confirmed syllabus outline; subject names are not seeded in the
  frontend.
- Questions are generated one at a time from readable OCR text in accessible,
  completed notes. A session cannot start without readable source material.
  The backend reuses the configured Gemini tutor model and structured-output
  service; API credentials remain server-side, and question answers are
  checked against source text before they are shown.
- Correct answers increase difficulty one step. Incorrect answers lower the
  next question by one step and reinforce the same concept; subsequent correct
  answers can restore the prior challenge. Free-text answers are evaluated
  semantically, while multiple-choice and true/false answers are checked
  against their generated answer keys.
- Practice records are stored per student in MongoDB, including questions,
  answers, outcomes, difficulty changes, concept mastery, score, and duration.
  The page includes session controls, a performance report, and saved history.
- `/api/ai-practice` exposes authenticated options, history, session start,
  answer, hint, explain, next-question, and end-session routes.

## Gemini validation and deployment

- Run the four feature suites with
  `npm run test --workspace=backend -- src/services/note-ocr.service.test.js src/services/syllabus-analysis.service.test.js src/services/note-verification.service.test.js src/services/ai-practice.service.test.js src/services/learning-tutor.service.test.js`.
  These tests use mocked Gemini responses; they do not prove that a live Google
  API key, project quota, or production network path is valid.
- For a live smoke test, configure a server-only `GEMINI_API_KEY`, supported
  model IDs, MongoDB, and `OCR_ENCRYPTION_KEY`, then exercise a small image/PDF
  note upload, syllabus upload, note verification, and `/practice` with an
  authenticated test account. Do not upload student documents to test accounts
  without consent.
- In deployment, set the Gemini variables only in the Next.js server
  environment, keep
  `GEMINI_API_KEY` out of `NEXT_PUBLIC_*` client variables, configure the
  production MongoDB connection and existing Cloudinary credentials, and
  preserve the existing `OCR_ENCRYPTION_KEY`. Review Google AI Studio quotas
  and usage before making the API public; the Free Tier has finite per-project
  limits and can be exhausted by multiple students.
- The selected model's [Gemini API pricing and data-use terms](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.5-flash-lite)
  currently indicate that Free Tier prompts and responses may be used to
  improve Google's products. Obtain appropriate disclosure/consent, do not send
  student names, contact details, account data, or other unnecessary personal
  information, and assess whether your deployment's document privacy needs
  require a paid tier with different data-use terms.

## Community note fact-checking

- Every published note in `/search` offers **Report mistake**. A verified
  student selects a page and category (incorrect definition, wrong formula,
  incorrect calculation, missing explanation, poor handwriting readability,
  or duplicate content), explains the issue, and can suggest a correction.
- `POST /api/notes/:noteId/reports` accepts `pageNumber`, `category`,
  `explanation`, and optional `suggestedCorrection`. Reports are accepted only
  for published notes. A student cannot report their own note;
  repeat reports for the same page and category are prevented.
- The original uploader receives an email notification and can respond from
  the dashboard. The reporting student and uploader can see the report and its
  correction history at `GET /api/notes/reports`; uploader responses use
  `POST /api/notes/reports/:reportId/response`.
- Administrators review open reports at `GET /api/notes/reports/review` and
  confirm or dismiss them with
  `PATCH /api/notes/reports/:reportId/review`. Status changes, responses, and
  review notes are retained in the report's correction history. Email
  notifications are sent directly through Nodemailer after each operation is
  saved; email failures are logged without undoing the saved operation.
- Submitting a report does not modify a note, approval decision, or contributor
  points. No contributor-point adjustment is made by this workflow after
  review either; confirming a report only records the reviewed outcome and
  notifies the involved students. The uploaded original remains unchanged.

## Student library

- Verified students can save published notes and PYQs to
  `GET /api/library?section=saved`. Bookmarks use the `Bookmark` MongoDB model
  and can be organized into named folders; the default folder is `Saved`.
- Create a bookmark with `POST /api/library/bookmarks` and JSON fields
  `resourceType` (`note` or `pyq`), `resourceId`, and optional `folder`.
  Move/organize it with `PATCH /api/library/bookmarks/:bookmarkId` and
  `{ "folder": "..." }`. Remove it with
  `DELETE /api/library/bookmarks/:bookmarkId` or
  `DELETE /api/library/bookmarks/:resourceType/:resourceId`.
- `/library` shows saved and recently accessed resources. View metadata is
  recorded per student and resource in MongoDB when they open a published
  note or PYQ. Removed or unpublished
  resources no longer appear in library results.
- `GET /api/search/resources/:resourceType/:resourceId/view` requires an
  authenticated student or admin and streams the private storage asset through
  the backend. The in-app PDF/image viewer has no download or print controls;
  browser viewing cannot prevent screenshots or all copying.
- Every resource remains free. The library adds no purchase, premium, or
  payment routes or gating.

## Contributor rewards

- Students can review point balances, contribution records, reward transactions,
  the points schedule, available platform points, and the contributor
  leaderboard in their dashboard. APIs are `GET /api/rewards/me` and
  `GET /api/rewards/leaderboard`; both require an authenticated student session.
  Student and admin history APIs accept a `page` query parameter for older
  transaction and contribution records.
- Points are credited after the applicable contribution event:
  AI-approved handwritten notes, successfully uploaded and published PYQs,
  administrator-confirmed academic corrections (the report author receives
  credit), and optional administrator-designated high-quality resources.
  Reports about readability or duplicate content do not qualify as academic
  corrections. Ad clicks, impressions, downloads, bookmarks, and visits never
  earn points.
- The default transparent schedule is 10 points per AI-approved handwritten note,
  8 per published PYQ, 5 per confirmed correction, and 15 for a high-quality
  resource bonus. Configure these values with the `REWARD_POINTS_*` variables.
  Admins can add or deduct up to 1,000 points per adjustment with a required
  reason; every change records its actor, reason, balance, and budget change.
- A finite point pool is initialized from `REWARD_BUDGET_POINTS` (default
  10,000) when the platform reward budget is first created. Rewards use an
  atomic available-budget check; if the pool is exhausted, a contribution is
  recorded without points. Admin point deductions return points to the
  available pool. Admins can designate a high-quality bonus only for an
  published note or PYQ, with a recorded review reason.
- Administrators can review the budget, contributions, and distribution
  history in the admin dashboard. API routes under `/api/rewards/admin`
  provide `GET /overview`, `POST /adjust` (student email, signed points, and
  reason), and `POST /quality-bonus` (published resource type/id and reason).
  The `Contribution`, `RewardAccount`, `RewardBudget`, and
  `RewardTransaction` records preserve the contribution and point history.
- Points do not unlock or purchase any resource. Notes and PYQs remain free;
  there are no paid notes, subscriptions, payment processing, or cash
  withdrawals. No cash-out feature is provided; any future payment or
  withdrawal feature requires a separate legal, tax, and platform review.

## Structure

```text
frontend/
  app/                Next.js App Router pages, API handlers, and shared layout
  src/
    components/       Reusable UI, auth forms, rewards, and dashboard components
    context/          Cookie-backed authentication state
    lib/              Centralized API client
    pages/            Login, registration, recovery, dashboard, PYQ, search, library, and syllabus screens
    index.css         Tailwind directives and global styles
  server/             Server-only API and SEO metadata helpers
  next.config.mjs     Next.js runtime and worker asset configuration
  tailwind.config.js  Tailwind content paths and theme
  postcss.config.js   Tailwind/Autoprefixer processing
  .env.example        Frontend environment variable example
backend/
  src/
    config/           Environment and database configuration
    controllers/      Authentication, dashboard, note-upload, syllabus, and health handlers
    middleware/       Authentication, authorization, and error handling
    models/           User, resource, note, syllabus, rewards, verification, OCR, notification, and activity models
    routes/           Auth, dashboard, note, syllabus, rewards, and health API routes
    scripts/          Admin provisioning command
    services/         Email, auth, secure storage, OCR, AI verification, and academic review services
    app.js            Web Request dispatcher for API and SEO routes
  .env.example        Backend environment variable example
```
#   T o p p e r _ n e x t  
 #   T o p p e r _ n e x t  
 