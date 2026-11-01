# QR production project logs

## Cook workflow

1. Scan **Scan to start / finish** on the assigned prep recipe/lot or banquet food line. Daily worksheets and weekly banquet packets may first ask you to choose the lot or event project.
2. Sign in. The app returns to the scanned project, including the prep print multiplier when present.
3. Check the recipe, lot/event, target date, planned quantity and cook name/initials. Tap **Start project** when work begins.
4. Work normally. The start timestamp is stored on the server; closing the tab or reloading does not reset it. Scanning again opens the existing job.
5. Once the project is finished, enter actual yield and its unit, add shift/quality notes, confirm labeling/dating, and tap **Finish & submit for review**. Explain zero output in the notes and confirm that no product needed labeling.

The signed-in starter and finisher are recorded separately from the cook name/initials. Staff can finish their own jobs; managers/admins can finish another cook’s job. Submitted results and timestamps are preserved. Ask an admin to document a correction during review if something was entered incorrectly.

Each printed prep lot or banquet food line has one job. Repeat scans reopen it. Prep lots shared across destination venues refer to the same physical batch; check the combined planned quantity on the phone. A changed print multiplier does not create another timer after a job has started.

## Admin review

Open **Daily Prep → Review project logs**, select the target date, and open a project. The record includes start/finish timestamps, elapsed time, cook, original planned and actual quantities, and notes. The date is the planned prep/event date; the timestamps record when the work actually happened.

Confirm the reviewed yield/unit and add a review note. Any yield correction requires an explanation; the cook’s original submitted value remains intact alongside the reviewed result. Mark the job reviewed when the facts are checked. Unfinished jobs must first be finished by their cook or a manager/admin.

For prep, the daily worksheet lists the jobs awaiting review. A finished, reviewed job that matches every request in a worksheet recipe group offers **Use reviewed cook result**. This copies the reviewed yield, cook and original shift notes. It does not fill destination deliveries or substitute elapsed time for labor. Check allocations, waste, supplied ingredients, labor, and charges through the existing preview/save workflow. If a job covers only part of a recipe group, review the records and enter the combined results manually.

Unreviewed prep jobs block production confirmation for that recipe/day and day finalization. Reviewing a job itself creates no production batch, transfer, charge, or inventory movement. Banquet logs remain project records and do not enter the prep transfer ledger.

## Reading the timing data

Elapsed time is finish minus start, using server timestamps. It includes unattended cooking, waiting and interruptions. It is useful for understanding how long a project occupies the schedule; it is not automatically hands-on person-minutes or an accounting labor charge. Original and reviewed yields remain available for comparing batch sizes.

## Deployment and printing

- Apply `20261031000000_production_job_logs` with `prisma migrate deploy` before serving this application version. It adds the job table, relations, validation checks, and audit-protection trigger. Existing orders, snapshots and ledger values are not rewritten.
- Normal `npm start` applies committed migrations before starting the server. Do not substitute `db push`; it omits the protection trigger.
- Configure `APP_BASE_URL` to the public HTTPS origin phones can reach, for example `https://mise.example.com`. The auth origin and then the request origin are fallbacks. A local preview using localhost will produce localhost links unless the public origin is configured.
- Codes contain project links, not a login bypass. A cook must sign in. QR generation runs locally in the application; no external QR service receives the link.
- Existing paper without a QR remains usable. Open **Daily Prep → Start / finish a production project** to find a printed lot or active banquet project.

## Verification

`npm test` includes QR option, timing, yield validation, return-link and public-origin checks. `npm run test:transactions` uses a disposable PostgreSQL database and checks concurrent starts, repeat submissions, permissions, review gates, protected audit facts and unchanged accounting until an admin confirms production.

After a production build, run `PRODUCTION_JOBS_BROWSER_SMOKE=1 PREP_BROWSER_SMOKE=1 bash scripts/test-prep-postgres.sh` with the existing Playwright module/executable overrides. It checks the complete mobile workflow and generates two print samples in `/tmp/production-job-review` (or `JOB_REVIEW_DIR`).
