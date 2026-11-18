# Gemini Decision Lab

A local test harness for Google's `gemini-decision-1` model on the **Decisions API**. Built with Vite, React, Tailwind CSS v4, and shadcn/ui.

The Decisions API returns calibrated probabilities instead of generated text. This app exercises all three question types (`noul`, `choice`, `score`) and scores the model against a labeled banking triage suite.

## Setup

1. Create a Gemini API key at <https://aistudio.google.com/api-keys>.
2. Add it to `.env` (already gitignored) or paste it into the app's key bar:

   ```bash
   VITE_GEMINI_API_KEY=AIza...
   ```

3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

4. Open <http://localhost:5173>.

The UI value wins over `.env`. A key pasted into the UI is stored in `sessionStorage` and disappears when the tab closes.

## What to try

- **Playground** — edit the shared input, attach up to five photos or PDFs, and run one request. Each answer shows the value, confidence, and full probability distribution. The OCBC preset is grounded against the mock customer DB by default.
- **Documents** — attach up to 20 PDFs or photos and classify each in its own request. Choose 1, 2, 3, or 5 parallel runs; results show completion, category, action, confidence, latency, and tokens per file. Add an optional customer lookup key per file to check it against the mock DB. Preview images inline and PDFs in the browser viewer.
- **Benchmark** — run 10 built-in support cases plus your own. It reports case accuracy, question accuracy, confidence calibration, latency, token usage, and estimated cost. Set repeats to 3 or 5 to check consistency. OCBC custom cases can include a mock DB lookup key and auto-scored DB questions.
- **Mock DB** — add, edit, delete, import, export, and reset the synthetic customer records used by the Playground and Documents. Add custom columns for fields such as account number. Changes are saved in this browser and apply immediately.
- **Request log** — inspect the last 20 request/response pairs. The key is never included, and attached media is shown as a size placeholder instead of raw base64.

## OCBC form template

The default Playground preset checks whether a document is an OCBC personal banking form, whether it is filled in, and then categorises it into:

- `account`
- `credit_card`
- `debit_card`
- `baby_bonus_card`
- `loans`
- `online_banking`

It also classifies the action (`apply`, `change`, `cancel`, `reissue`, `enrol`, `request`, `repay`, `other`). **Filled** means every field the form asks the applicant to complete has been completed, including a signature and date where required. Blank or partially completed forms are reported as not filled. The categories and form examples follow the **Find the forms you need** list on OCBC's Help and Support page. The template lives in `src/lib/ocbc-form-template.js`; attach a photo or PDF of the form, or paste its text.

The Playground OCBC preset also enables the mock DB and adds `customer_exists`, `form_accurate`, and `mismatched_field`. The Documents tab adds those questions per file when you provide a lookup key.

## Mock customer database

Edit the database in the **Mock DB** tab. The bundled defaults live in `src/data/mock-customers.json`; UI changes are stored in this browser's `localStorage` and apply immediately to new Playground and Documents runs.

- **Add / edit / delete** records in the table. Customer ID and name are required; IDs must be unique.
- **Add column** adds a custom field such as `account_number` to every record. Custom fields appear as extra table columns and inputs in the edit dialog. Remove a custom column with the × in its header.
- **Custom fields** are injected with the record and compared when the form contains the same field name. A single custom-field mismatch maps to the `other` option on `mismatched_field`.
- **Import JSON** accepts an array of records or `{ "customers": [...] }`; extra fields are preserved. **Export JSON** downloads the current list. **Reset to defaults** restores the bundled records.
- The Playground enables **Check against mock customer DB** for the OCBC preset. Lookup matches a record by customer ID (`CUST-1001`), NRIC/FIN, or email from the text input.
- The matching record is injected into the request as an authoritative `[Mock customer database]` block. The model then decides whether the customer exists and whether the submitted form fields match.
- Ground truth is computed locally from the current database, not from the model. Results show a field-by-field comparison and score three optional questions: `customer_exists`, `form_accurate`, and `mismatched_field`. Use **Add N DB questions** to add them to any Playground preset.
- Form fields can be JSON or `Field: value` lines. Name, NRIC/FIN, email, phone, address, and monthly income are compared. Phone formatting (`+65`, spaces) and `$` or commas in income are normalised.
- Attached PDFs and images are still sent to the model, but they are not parsed locally, so field-level scoring needs text form data. Include a customer ID, NRIC/FIN, or email in the Playground text to look up the record. In Documents, set the optional lookup key on each file. In Benchmark custom cases, set the optional mock DB lookup key on the case.
- Benchmark custom cases using the OCBC form category preset get the three DB questions automatically when a lookup key is set. Existence is always scored; form accuracy and mismatched field are scored when the case text contains comparable form fields.
- The data is **synthetic and public in the deployed app**. Never put real customer data in `mock-customers.json` or the Mock DB tab.
- Edits in the UI are stored in `localStorage`. If you change `src/data/mock-customers.json` directly, click **Reset to defaults** to reload the bundled file; otherwise the browser copy wins.

## Documents (per-file runs)

The **Documents** tab sends every file as a separate Decisions API request using the OCBC form template. It is not a single combined batch.

- Up to 20 files, 15 MB each.
- Parallel runs: 1, 2, 3 (default), or 5. Higher values use more quota and browser memory.
- **DB lookup key** is optional per file. Enter a customer ID, NRIC/FIN, or email to inject that customer's record and add the three DB questions to that file's request. The existence check is scored locally.
- **Preview** opens images inline and PDFs in the browser's viewer, with the text prompt and question set alongside.
- Results are per document: completion (complete/incomplete), category, action, OCBC-form check, review confidence, latency, and tokens.
- **Low confidence only** filters files below 60% confidence.
- **Copy CSV** and **Copy JSON** export the results; media data is never included. CSV includes the DB lookup, ground truth, model answers, and existence match.
- Field-level form accuracy is not scored for uploaded files because the PDF or image is not parsed locally. The model's `form_accurate` and `mismatched_field` answers are still returned when a lookup key is set.

## Custom benchmark cases

The **Benchmark** tab has a **Your cases** section. Add a case, give it an input, choose a question set, and set the answers you expect. Custom cases run alongside the built-in triage suite and count toward the same accuracy, calibration, latency, token, and cost summary.

- **Inputs:** text, one or more photos, one or more PDFs, or a combination. Attachments are sent as Decisions API media blocks.
- **Question sets:**
  - **Support triage** — `is_refund_request` (noul), `route_to` (choice), `urgency` (score).
  - **OCBC form category** — `is_ocbc_form` (noul), `is_form_filled` (noul), `form_category` (choice), `form_action` (choice). Add an optional **Mock DB lookup key** to include `customer_exists` (noul), `form_accurate` (noul), and `mismatched_field` (choice).
- **Expected answers** for the standard questions are fixed by you, not self-reported by the model. DB questions are scored automatically from the current mock DB and the case text: existence is always scored; form accuracy and mismatched field are scored when the text contains comparable form fields.
- **Limits:** up to 5 files per case, 15 MB each, 30 MB total.
- **Image detail:** `low`, `medium`, or `high` for image blocks.
- **Persistence:** custom cases are saved in the browser (IndexedDB), including attached files and the optional DB lookup key, so they survive a reload. They never leave the browser except when a run is sent to the API.
- **Preview** shows the full text, inline images or PDF viewer, expected answers (including auto-scored DB answers), and question definitions.
- Use **Edit** to change a case or **Delete** to remove it. Deleting is permanent for that browser.

The built-in cases are text-only. Media support is available through custom cases and the Documents tab.

## Deploy on Vercel

This is a static Vite app. The repository includes `vercel.json`, which sets the Vite framework, build command, and output directory.

- **Dashboard:** import the repository at <https://vercel.com/new>. Vercel uses `npm run build` and publishes `dist`.
- **CLI:** run `npx vercel` from the project root for a preview, then `npx vercel --prod` for production.
- **Environment variables:** none are required. Do not add `VITE_GEMINI_API_KEY` to Vercel. Production builds only expose `BUILD_*`, and visitors paste their own key into the key bar; it stays in `sessionStorage` for that tab.
- `.vercelignore` excludes `.env`, `.env.*`, `node_modules`, and `dist` from CLI uploads.
- The Decisions API allows browser requests from Vercel deployment origins, so no server proxy is needed for direct calls.

For a shared key that every visitor can use, do not ship it to the browser. Use a server-side proxy with authentication, rate limits, and a spend cap.

## Notes

- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/decisions`
- Model: `gemini-decision-1`
- Pricing: $0.10 per 1M input tokens, output tokens are free.
- `VITE_*` values are inlined into the client bundle. This is fine for local testing; don't deploy a real key.
- Production builds expose only `BUILD_*` env vars, so `VITE_GEMINI_API_KEY` from `.env` is never inlined into `dist`.
- The API supports images, audio, video, and PDFs. The Playground accepts **PNG, JPEG, WebP, HEIC, GIF, BMP, TIFF, and PDF**: up to 5 files, 15 MB each, 30 MB total. The Documents tab accepts up to 20 files, 15 MB each. Custom benchmark cases accept up to 5 files, 15 MB each, 30 MB total. Images use the selected `low` / `medium` / `high` detail level. Built-in benchmark cases remain text-only.

## Scripts

```bash
npm run dev      # start Vite
npm run build    # production build
npm run lint     # oxlint
npm run preview  # preview the build
```
