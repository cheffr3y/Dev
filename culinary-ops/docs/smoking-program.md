# Smoking program

Operations → **Smoking** opens dated smoker runs and searchable cook history. A run holds independent product lots, so brisket, chicken, cheese and other products retain their own method, probes, checkpoints and actual yields. The product suggestions cover brisket, pork shoulder, ribs, whole chicken, cheddar cheese and jalapeño cheddar sausage; custom product names work too.

## Record a cook

1. Create a run with its date, venue, equipment and responsible cook. Date/venue identify the run and remain fixed; use a new run if that identity was entered incorrectly.
2. Add a lot per product/batch. Choose hot or cold smoking, configure the kitchen's procedure and targets, and assign the cook/probes. Managers can maintain reusable procedures on the history page. Applying one copies its current settings; future template edits leave existing lots unchanged. The application supplies no default cooking temperatures.
3. Optionally link a recipe and an existing production project. The recipe's name, version, yield and instructions are captured with the lot. The project link returns to the existing start/finish/review workflow; smoking records do not create a second timer, complete the project or post its yield.
4. Attach thermometer screenshots, photos and supporting PDFs to the run or a lot. Open a source image beside **Edit lot / enter summary and actuals**. Select the source, choose **Read photo locally**, check/correct the draft and confirm its product/probe assignment before saving. Manual entry is available without OCR. PDFs and handwritten sheets use manual entry.
5. Record timestamped load, wrap, pull, rest, hold, cool or other check readings as the procedure requires. Entry uses the device's local clock; history displays Central Time. A reported device duration is separate from these timestamps and optional hands-on labor minutes.
6. Enter raw, optional trimmed and finished usable quantities, trim/waste and quality notes. Weight/count yields use recognized compatible units (for example lb/oz or kg/g). Volumes, unknown packages, mixed families and zero raw amounts have no calculated yield. Planned output comparison uses the same conversion rules. None of this changes recipe standards, inventory or accounting.
7. Submit the lot, then have a manager/admin explicitly review it. The source preset, target, peak and timer never change lot status automatically. Missing checkpoints remain visible; applicability follows the kitchen's configured procedure.

Choose **Print smoke sheets** for all lots or **Print this lot** for one. Each lot has a scannable link back to its own record, including after signing in with an expired session, separate planned settings, temperature/time/probe write-in cells, yield, notes and initials. Standard short lots print one US Letter page each; lengthy procedures/readings may continue. Handwriting cells remain at least 28px tall, including squeeze mode.

Use product, date range, venue, smoker and cook filters to compare the newest 100 matching runs, including reported duration, finished yield and quality. **Repeat this setup** copies planned procedures and captured recipes into a new dated run, assigning copied lots to the current cook. Actuals, readings, photos, linked production jobs, and review sign-off are cleared.

## Access, corrections and source records

Managers/admins can read all runs, assign cooks, maintain procedures and review lots. Staff can read runs at their current home venue, runs they created, or runs with a lot assigned to them. Staff can create runs at their home venue and edit lots they created or are assigned. Only the run creator or a manager can change run details or attach run-wide documents. Other staff can attach documents to their own lot. Every API checks current database assignments, including file access.

Corrections require a reason. Before/after facts, actor identity/name, revision and time are append-only, and original readings remain available in correction history. Source documents are immutable; duplicate content in the same run returns the original upload and preserves its lot/uploader attribution. A shared chart can be referenced in another lot's summary in the same run after the probe assignment is confirmed.

Lot changes and new readings reopen the record. Changed run details and new supporting documents reopen submitted/reviewed affected lots. Concurrent saves reject a stale revision; refresh before applying the correction again. A durable request receipt prevents duplicate records when a successful response is lost and the user retries. Reusing an operation identifier for different data is rejected.

Photos/PDFs are limited to 8 MB and compacted into authenticated database storage with a preview. PNG screenshots retain lossless text and chart pixels, within the 2600px limit. JPEGs use quality 88. Download returns this stored source representation. Images are limited to 60 megapixels; multi-page documents use PDF. Private file responses have no-store caching and no-sniff/sandbox headers. Smoke tables add no writes to the stock, accounting, production-job or historical packet tables.

## Local OCR and validation limits

Tesseract.js 7.0.0 and English data 1.0.0 are pinned dependencies. `postinstall` and `build` copy their worker, all core fallbacks and language data into ignored `public/ocr/`, together with attribution and a SHA-256 asset manifest. The deployed app serves these assets itself; no CDN, device account, paid AI API or external image processing is used. Image decoding, border-based dark/light normalization, resizing and OCR occur in the browser worker. The parser pairs labels with nearby values rather than relying on fixed device coordinates. Ambiguous/missing/low-confidence results remain blank. Cancel, engine failure, timeout and retry retain manual entry and existing values.

The October 31 supplied screenshot was actually processed in Chromium: **Breast: Well Done**, **2026-10-31**, **165°F**, **382 minutes**, and **144.8°F** all matched, with the unit checked separately (six summary fields). Desktop recognition measured **0.5 seconds** in the final local run; a 390px browser with four-times main-thread CPU throttling measured **0.6 seconds**. Those timings include worker initialization but use local asset delivery and a desktop CPU; worker throttling is not a physical-phone benchmark. First-use mobile downloads/network conditions and physical iPhone/Safari performance still need field measurement. Other thermometer layouts and handwritten recognition have not been validated. The original chart remains an image; no graph samples or threshold times are reconstructed.

Verification on November 1, 2026: production webpack build/TypeScript, 213 unit checks, 47 disposable-PostgreSQL checks, smoking browser acceptance and workspace regression passed. Browser coverage includes real OCR output and same-origin-only requests, confirmation, duplicate uploads, private file round trip/access, interrupted-response retry, mixed hot/cold products/probes, checkpoints, 390px layout, cancellation/retry/failure, repeat resets, independently decoded QR codes and sign-in return to the scanned lot, and a two-page PDF for two short lots. Database checks cover current roles/venues/assignment, original-reading retention, append-only guards, conflicting edits, source attribution, review invalidation, frozen recipe/project captures, and unchanged inventory/accounting/project rows.

## Deployment and repeatable checks

Normal `npm start` applies `20261102000000_smoking_program` using `prisma migrate deploy`, then starts Next. The migration only creates the six smoking tables, their relations/indexes, and smoking-specific audit guards. No data backfill or historical rewrites are required. OCR assets must be generated during install/build, not committed as binaries.

```bash
npm run build
npm test
npm run test:transactions
SMOKE_OCR_FIXTURE=/absolute/path/to/real-thermometer.png \
  PREP_BROWSER_SMOKE=1 BROWSER_SUITES="smoking workspace" npm run test:transactions
```

The fixture path is explicit so private user screenshots are never committed. The smoking suite requires the supplied reference layout/values for the release benchmark. Shared Playwright/browser executable overrides work as described in [repository-structure.md](repository-structure.md).
