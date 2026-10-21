# CLAUDE.md

Working rules for AI agents (Claude, Jules, ChatGPT) in this repository. Read [`README.md`](README.md) first for how the app works, and [`DECISION_LOG.md`](DECISION_LOG.md) for why the rules are what they are. This file does not repeat them.

## The owner approves every change

- **Do not write, change or push code without the owner's explicit go-ahead for that specific change.** This includes "preliminary" drafts, branches, commits and pull requests. Investigating, reading code and proposing a plan in chat are fine; editing files is not until the owner says so.
- Approval for one change does not carry over to the next one. Ask again.
- Documentation changes follow the same rule: draft the text for review first, then commit only after approval.
- Never merge, enable auto-merge, or push to `main`. A push to `main` deploys straight to the live Apps Script project (see "Deployment" in the README).

## Scope and intended behavior

- The lottery rules in `DECISION_LOG.md` are the authority. The current code shows what is built, not necessarily what is intended. When code and the decision log disagree, report the conflict and ask; do not silently pick one.
- Older planning material (the ChatGPT Q&A and the original Jules prompt, which refer to the old repo name `Wakeboardsam/Vacation-Selector`) is superseded wherever the decision log says otherwise. Notably: notifications are WhatsApp through WAHA, not Twilio SMS.
- Keep each change small: one problem per branch and pull request, no unrelated refactors or renames.
- Do not hard-code the participant count, the year, or holiday dates. The roster and calendar change every year.
- The spreadsheet is the source of truth. Server functions reread the sheet before validating and writing; do not add long-lived caches of assignments.
- Keep sheet tab names and column headers stable. If a header must change, add an in-place migration in `Schema.gs` (as was done for "Resend SMS" → "Resend WhatsApp") so an existing workbook keeps working.

## Apps Script constraints

- This is a Google Apps Script project (V8 runtime) deployed with `clasp`. Files are `.gs` (server) and `.html` (client: `Index.html`, `JS.html`, `CSS.html`). All `.gs` files share one global scope, so function names must be unique across files.
- `.claspignore` pushes only `.gs`, `.js`, `.html` and `appsscript.json`. Markdown files are ignored, so documentation never reaches Apps Script. Do not add files that `clasp push` would choke on.
- Writes that change selections or queue state go through `withScriptLock` (`Concurrency.gs`).
- Secrets (WAHA URL, API key, session, admin phone) live in Script Properties. Never put them in code, tests, logs, notification text or participant-facing responses. Phone numbers in logs stay masked.

## Testing

- There is no local test runner. Tests run inside Apps Script: `runRegressionTests` (`Tests.gs`) and `runWahaUnitTests` (`WhatsAppTests.gs`), started from the Apps Script editor by the owner.
- The editor only sees code after it is merged to `main`, so the owner runs the tests **after** merging. Never tell the owner to run them before merging. Before opening a pull request, check the change as far as this environment allows (for example, running the `.gs` files under Node with Apps Script stubs) and say exactly what was run.
- Add or update tests in those files for any behavior change. Do not delete, skip or weaken existing tests or assertions.
- Report exactly what was and was not run. If the tests could not be run from this environment, say so and list the functions the owner should run.

## Decision log and README

- Add a `DECISION_LOG.md` entry whenever a lottery rule, phase order, eligibility rule or notification behavior is decided or changed. Keep earlier entries and their dates unchanged; supersede them with a new entry instead of editing them.
- Keep `README.md` accurate. When a change alters behavior the README describes, update it in the same pull request, and remove the **[Planned]** tag from items that are now built.

## Review and reporting

- Back every reported problem with evidence: file and line, the scenario that triggers it, and whether a test shows it or it is reasoning only. Mark anything unproven as **needs verification**.
- Use a feature branch off `main` and open a pull request only when the owner asks. The owner reviews and merges.
