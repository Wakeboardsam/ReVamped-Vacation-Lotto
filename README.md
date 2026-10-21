# ReVamped Vacation Lotto

A Google Apps Script web app, backed by one Google Sheet, that runs a workplace's yearly lottery for vacation weeks, weekend on-call coverage, official holiday coverage, and voluntary transfers of weekend and holiday duty. Participants log in with their name and PIN, pick when it is their turn, and are notified over WhatsApp.

Agent working rules are in [`CLAUDE.md`](CLAUDE.md). The lottery rules and the reasons behind them are in [`DECISION_LOG.md`](DECISION_LOG.md); where this README and the decision log disagree about intent, the decision log wins.

**How to read this guide.** Untagged statements describe what the current code does (checked against `main` on 2026-10-20). Three tags mark gaps:

- **[Planned]** — approved in the decision log but not built yet.
- **[Decision pending]** — the owner has not decided yet; the text says what the code does meanwhile.
- **[Gap]** — the code differs from the decision log and needs a decision or a fix.

## Contents

1. [The yearly flow](#the-yearly-flow)
2. [Phases in detail](#phases-in-detail)
3. [The spreadsheet](#the-spreadsheet)
4. [Notifications](#notifications)
5. [Code map](#code-map)
6. [Deployment](#deployment)
7. [Testing](#testing)
8. [Open items for the 2028 lottery](#open-items-for-the-2028-lottery)

## The yearly flow

The admin works from the **Vacation Lotto** menu in the sheet:

1. **⚙️ Initialize Database Schema** creates any missing tabs and columns (safe to rerun). **[Planned]** It will follow the Active Year: archive the previous year's final assignments to a Lottery Archive tab, clear and re-stamp the working tabs with the new year, reset yearly roster fields and pre-check the last-year boxes. Rerunning for the same or an older year asks the admin to confirm first.
2. Fill in the roster on **Participant Config** (name, PIN, phone, seniority) and set **Active Year** on **Admin Options**.
3. **🎲 Auto-Fill & Randomize Roster** generates vacation weeks, every weekend day, the six official holidays (Call 1 and Call 2 each), soft holiday warnings, and a random Lottery Position for each participant. It clears and rewrites existing rows. **[Gap]** If Active Year is blank it silently uses 2027 (`runAutoFillFromMenu` in `Admin.gs`). **[Planned]** Refuse to run without a year.
4. The admin reviews: marks Prime weeks, sets the Spring Break / Thanksgiving / Christmas designations, sets week capacities, checks the last-year boxes, and corrects any dates.
5. **✉️ Send Active Participant PINs** sends each person their PIN and the web app link.
6. **▶️ Begin Seniority Round**, then the phases below in order, each started from the menu.

Phase order: Vacation (seniority round 1, then randomized rounds) → Holiday Volunteer → Holiday Mandatory → Holidays complete → Weekend → Transfer offers → Transfer receivers → Complete. The menu lists the Begin buttons in this order.

Pressing a Begin button out of order (for example Begin Weekend Phase during vacation) shows a warning naming the normal order; nothing changes unless the admin confirms. Normal starts: Seniority from setup, Holiday after vacation, Weekend from Holidays complete, Transfer after Weekend (`confirmPhaseStart_` in `Admin.gs`).

## Phases in detail

All randomized phases use the same yearly Lottery Position, start at position 1, and move in serpentine order. The window ("Active") lets several people pick at once; sizes come from Admin Options. Phase state (phase, round, direction, lead) is stored on the **Config** tab.

### Vacation

- Round 1 uses Seniority Position; when it finishes, the app switches itself to the randomized order for round 2 onward.
- A turn is one Prime week alone, or up to two non-Prime weeks. **[Gap]** These two rules are enforced only in the browser (`JS.html`); the server (`submitSelection` in `WebApp.gs`) counts Prime and non-Prime weeks but does not check them.
- A person is skipped once they reach their target (`Vacation Week Target Default`, 9, or their override). Week capacity defaults to 4 when the Capacity cell is blank.
- Anyone with "Had Spring Break / Thanksgiving / Christmas Week Last Year" checked cannot pick that week before round 4.

### Holidays

- Holiday Volunteer: people whose volunteer answer is yes pick one call position per turn until they pass or everything is filled.
- When no volunteers remain and positions are open, the app moves itself to Mandatory Holiday.
- When every position is filled, the app stops at **Holidays complete** (`HOLIDAY_COMPLETE`) and, when notifications are on, sends the admin a WhatsApp message to start the Weekend phase. Nothing moves on until the admin presses Begin Weekend Phase. If every position is already filled when Begin Holiday Phase is pressed, it goes straight to Holidays complete.
- The Holiday Mandatory pool is everyone with "Mandatory Holiday Eligible" checked (auto-fill turns it on for everyone; the admin may switch a person off) and "Worked Any Official Holiday Last Year" unchecked (`isInHolidayMandatoryPool_` in `Queue.gs`). Last year's holiday workers may still volunteer. A holiday taken as a volunteer counts, so round 1 skips anyone who already has one.
- If everyone in the pool already has a holiday and positions are still open, the snake continues with a second round within the same pool. When round 2 starts, the admin gets one WhatsApp message (when notifications are on) asking whether to keep excluding last year's holiday workers; the admin answers by changing the last-year boxes, which take effect at once. Admin Options lists this alert as "Admin Alert - Second Holiday Mandatory Round".
- When someone picks a holiday call and an open Saturday or Sunday lies within the proximity range (Holiday Proximity Range, default 3 days) of its Observed Date, a pop-up asks them to take one of those days as First Call in the same turn. Each listed day is one weekend unit. They may choose "Just the Holiday" instead. Days of a weekend they already hold a day of are not offered, and nothing is offered once they are out of the weekend phase or at their Weekend Assignment Maximum. The pop-up text is "Prompt Text - Holiday Weekend" on Admin Options; `[Days]` in it becomes the proximity range.
- The holiday and the weekend day save together or not at all (`submitSelection` in `WebApp.gs`). If either was just taken by someone else, nothing is saved and the person picks again: the same holiday with another weekend day, or a different holiday.
- **[Decision pending]** Whether a weekend day taken with a holiday counts as the person's first weekend pick. Today it counts: the Weekend phase sees it like any other weekend day they hold.
- For a fresh year, auto-fill puts each official holiday on its observed weekday (`getHolidaysForYear` in `Utils.gs`): a Saturday holiday moves to the Friday before, a Sunday holiday to the Monday after. New Year's Day of the lottery year is included even when observed on December 31 of the year before (the 2028 lottery gets 2027-12-31). Every later step, including the weekend warnings, reads the Observed Date column, so admin corrections there carry through.
- **[Gap]** When the Holiday Coverage tab already has rows, auto-fill keeps every existing holiday's date *and assignees* instead of regenerating them (`autoFillAndRandomize` in `Admin.gs`). Running it for 2028 over the 2027 sheet would carry over 2027 dates and names. Weekend warnings are then computed from those old dates.

### Weekend

- Each Saturday and Sunday is a separate First Call slot; a person cannot hold both days of one weekend.
- One day per turn; the phase cycles until all slots are filled. Weekend Assignment Maximum caps a person (blank means no cap).
- Warnings (never blocks) for nearby vacation weeks, the person's other weekends, and holidays within the proximity range (default 3 days).
- A weekend pick no longer offers a nearby holiday; that offer now happens at the holiday pick (see Holidays).

### Transfers

- Givers submit offers; once all givers have submitted, receivers are called in lottery order to take one item per turn or choose None. Accepted items are reassigned and logged on **Transfer History**; unclaimed items stay with the giver.

## The spreadsheet

| Tab | Holds |
|---|---|
| Admin Options | Behavioral settings: active year, window sizes, targets, reminder and admin-alert delays, proximity range, message text, web app URL. |
| Participant Config | One row per person: PIN, phone, seniority and lottery positions, per-phase switches and caps, last-year boxes, volunteer and transfer answers, notification tracking. |
| Vacation Availability | One row per week: start Monday, capacity, Prime classification, special designation, assigned names. |
| Weekend Coverage | One row per Saturday or Sunday with its First Call assignee and warnings. |
| Holiday Coverage | Two rows per official holiday (Call 1, Call 2) with observed date and assignee. |
| Soft Holiday Warnings | Warning-only dates, each switchable. |
| Transfer Offers / Transfer History | The giveaway pool and its record. |
| Rules & Tips | Editable rule text shown in the app. |
| Config | Internal phase state. Do not edit casually. |
| Notification Log | Sent, failed and skipped notifications, with phones masked. |

The sheet is the source of truth. After editing it directly, run **🔄 Refresh / Reconcile From Sheet**.

**[Planned]** Each working tab gets a year banner cell at the top, and a new **Lottery Archive** tab holds all past years' final assignments. Today every tab keeps its column headers in row 1 and the code reads them from there, so the banner means moving headers down and updating every header lookup together.

## Notifications

- WhatsApp through a WAHA server the owner runs at home. Settings are in Script Properties: `WAHA_BASE_URL` (HTTPS), `WAHA_API_KEY`, `WAHA_SESSION`, `ADMIN_PHONE`, and optional `ADMIN_EMAIL`, `MESSAGE_DELAY_MS`, `OUTAGE_ALERT_COOLDOWN_SECONDS`.
- `setupSmsTriggers` installs a 15-minute trigger for `notifyActiveParticipants`, which sends turn messages, On Deck messages, the reminder (360 min) and the admin alert (720 min). The on/off switch is still called "Enable SMS Notifications" on Admin Options.
- Two admin messages are sent straight from the lottery when notifications are on: "every holiday call position is filled" at Holidays complete, and the second Holiday Mandatory round alert.
- The "Resend WhatsApp" checkbox on a participant's row resends their current message.

## Code map

| File | Role |
|---|---|
| `WebApp.gs` | `doGet`, login, participant state, `submitSelection`, rules acknowledgment. |
| `Queue.gs` | Eligibility, active and up-next windows, `advanceQueue`. |
| `Admin.gs` | Menu, auto-fill, Begin-phase actions, PIN sending, `onEdit`. |
| `Schema.gs` | Tab and column creation, header migrations. |
| `Reconcile.gs` | Refresh / Reconcile From Sheet. |
| `Config.gs` | Admin Options and Config readers, queue state. |
| `Utils.gs` | Dates, holidays, proximity helpers. |
| `Display.gs` | Public read-only snapshot. |
| `Notifications.gs`, `Notification*.gs`, `WhatsApp*.gs` | Notification scheduling, logging and WAHA transport. |
| `Concurrency.gs` | `withScriptLock`. |
| `Index.html`, `JS.html`, `CSS.html` | Participant and admin web interface. |

## Deployment

- Every push to `main` runs `.github/workflows/deploy.yml`, which `clasp push --force`es the code to the live Apps Script project using the `CLASPRC_JSON` and `SCRIPT_ID` repository secrets. Merging to `main` is deploying.
- `.claspignore` pushes only `.gs`, `.js`, `.html` and `appsscript.json`, so Markdown files never reach Apps Script.
- A push updates the script code. Whether the web app's deployed version picks it up depends on how the deployment is set up in Apps Script (a head deployment updates at once; a versioned one needs a new version).

## Testing

Run from the Apps Script editor: `runRegressionTests` (`Tests.gs`) and `runWahaUnitTests` (`WhatsAppTests.gs`). There is no local test runner.

The editor only gets new code when it is merged to `main`, so the order is **merge, then run the tests**. A pull request cannot be tested in the editor before it is merged. Merge code changes outside lottery season, run the tests right after, and fix or revert at once if anything fails.

- Have the spreadsheet open in another tab: when it is, the results appear in a pop-up there; otherwise they go to the execution log. A Google "unknown error" at the end of a run can come from that pop-up.
- The execution log cuts long output short. The tests stop with an error at the first failure, so "Execution completed" means every check passed.
- "Notification Log sheet not found" lines during the run are expected: the tests use stand-in sheets.

## Open items for the 2028 lottery

Approved changes still to build. See the 2026-10-20 decision log entry.

1. Decide whether a weekend day taken with a holiday counts as the person's first weekend pick (today it does). The holiday pop-up itself is built.
2. Volunteer flows straight into Mandatory (already true in code); rename to "Holiday Mandatory" everywhere.
3. Auto-fill refuses to run without a target year.
4. Auto-fill regenerating holiday rows instead of keeping last year's dates and names. (Observed dates and New Year's Day staying with its lottery year are built.)
5. Decide whether to add the server-side check for the Prime and two-week rules.
6. Multi-year setup: year banner on each working tab, Lottery Archive tab, Initialize following the Active Year with a confirmation step, and last-year boxes pre-checked from the archive.
7. **[Gap]** `runWahaUnitTests` (`WhatsAppTests.gs`) fails 7 checks in the Apps Script editor (51 passed, 7 failed on 2026-10-21, after PR #68 was merged). The same 7 already failed before that change. **Needs verification:** whether the tests or the code are out of date. The failing checks:
   - "Flush is called to persist state before network request"
   - "Network loop aborted after first systemic failure"
   - "Sheet flags are persisted before sending"
   - The "Admin Options Migration" group stops with `TypeError: sheet.insertColumnAfter is not a function` (the test's stand-in sheet has no `insertColumnAfter`)
   - "notifyActiveParticipants called sendParticipantNotification_"
   - "Notification text contains vacation prompt template"
   - "Notification text contains Web App URL"
