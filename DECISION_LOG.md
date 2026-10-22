# Decision Log

The lottery rules and the reasons behind them. Newest decisions are at the bottom. Earlier entries stay as written; a later entry supersedes them where it says so.

Entries dated 2026-08 were backfilled on 2026-10-20 from the owner's ChatGPT design Q&A and the Jules implementation prompt that built the integrated app. That material refers to the old repo name `Wakeboardsam/Vacation-Selector`.

## 2026-08 — One integrated app, one roster, one yearly order

- One web app with one login (name + PIN), one participant roster and one admin area covers vacation weeks, weekend coverage, holiday coverage and transfers. Each kind of assignment keeps its own sheet tab.
- The same employees take part in every phase. The roster size changes from year to year and is never hard-coded.
- Auto-Fill/Randomize generates one random **Lottery Position** per participant for the year. Every randomized phase uses that same order, and each phase starts again at Lottery Position 1.
- All phases move in serpentine order (1 → last, then last → 1, and so on). At each reversal, everyone in the current window finishes before the reverse window opens, so the end person gets two turns in a row but never holds two window places at once.
- The selection window ("Active") holds several people at once; its size is set per phase in Admin Options (defaults: vacation 3, weekend 2, holiday 2, transfer 2). Anyone in the window may pick. If two people pick the same slot, the first valid submission wins and the second person stays Active and picks again.
- Admin may correct anything directly in the spreadsheet at any time; **Refresh / Reconcile From Sheet** rereads the sheet and reports conflicts instead of overwriting the correction.
- No general audit log of admin edits. A dedicated Transfer History table is kept.

## 2026-08 — Vacation weeks

- Round 1 is in **seniority order** (admin-entered Seniority Position). From round 2 on, the randomized serpentine order is used. The switch from round 1 to round 2 happens automatically.
- Each person's target is 9 weeks by default (`Vacation Week Target Default`); a per-person override can lower or raise it. Week capacity (people off per week) is set per week on the Vacation Availability tab.
- On a turn, a person picks either **one Prime week alone**, or up to two non-Prime weeks. A Prime pick never shares a submission with another week.
- The admin labels Prime weeks before the lottery. Auto-fill may suggest, but the admin confirms.
- The "pick a Prime week near the turn of the snake" advice is a tip for new employees, not a rule.
- Someone who had **Spring Break or Christmas week** last year cannot pick that same week until round 4 (restriction applies only to the break they had).
- The vacation phase is complete when everyone reaches their target, or when the admin moves on. Anyone left short is handled manually by the admin.

## 2026-08 — Official holidays

- Six official holidays, two people each: New Year's Day, Memorial Day, Independence Day, Labor Day, Thanksgiving, Christmas. Coverage follows the **employer-observed** date.
- Each holiday has Call 1 and Call 2. Call 2 is more desirable and is listed first, but Call 1 is not locked. One person cannot hold both calls for the same holiday.
- One person may take more than one holiday.
- **Volunteer phase:** people who answered "yes" to volunteering pick one holiday call per turn and come back on later cycles. Choosing Pass removes them from the volunteer phase for the rest of the year.
- Holidays are picked right after vacation weeks and before any weekend picks: Vacation → Holiday Volunteer → Holiday Mandatory → Weekend → Transfer.
- **Mandatory phase:** fills what volunteers leave. A holiday taken voluntarily counts the same as a mandatory one. People choose from the remaining holidays; nobody is randomly assigned one.
- Soft holidays (Presidents' Day, Valentine's Day, Easter, Mother's Day, Father's Day, plus anything the admin adds) only produce warnings and can be turned on or off one by one.

## 2026-08 — Weekend coverage

- Each Saturday and each Sunday is its own one-person slot. Picking Saturday means Saturday First Call and Sunday Second Call; picking Sunday is the reverse. The dates may overlap New Year (admin confirms the boundaries).
- One weekend day per turn. A person cannot hold both Saturday and Sunday of the same weekend.
- Weekend coverage is mandatory: the lottery keeps cycling until every slot is filled. Totals reset each year; nobody's count carries over.
- A per-person **Weekend Assignment Maximum** exists for partial-year employees; blank means no cap. If everyone left has hit their cap with slots open, the admin is notified.
- Warnings only, never blocks: back-to-back weekends; a weekend touching the person's own vacation week (the Saturday and Sunday before and after it); a weekend within ±3 days of an official or soft holiday.

## 2026-08 — Transfers / giveaways

- After assignments are complete, participants who opted in as **givers** offer specific weekend or holiday assignments to a pool; offers are irrevocable once submitted and locked when receiver selection begins.
- **Receivers** are called in the yearly lottery order, take one item per turn or choose None (which removes them for the rest of the round). Unclaimed items stay with the original assignee.
- Transfers are not swaps. Taking an item makes it the receiver's; a weekend transfer moves both its First Call and Second Call duties.
- The same restrictions still apply (no Saturday + Sunday of one weekend, no Call 1 + Call 2 of one holiday). History records original assignee, new assignee, date, position and time.

## 2026-08 — Rules & Tips and setup

- Rules & Tips are shown three ways: a permanent header button, short reminders on each selection screen, and a yearly acknowledgment before a person's first pick. The acknowledgment asks the required holiday-volunteer question and the transfer giver/receiver preference; answers land as checkboxes on the person's row, which the admin may change. Rule text is editable on the Rules & Tips tab.
- The old humorous holiday descriptions are dropped; only the light spouse reminder stays.
- Admin Options holds the behavioral settings (window sizes, targets, reminder and admin-alert delays, proximity range, prompt text).
- Notification timing: a message when a person enters the window, a reminder 360 minutes later, and an admin alert 720 minutes after entry (both measured from entry). No automatic repeats after that.

## 2026-09 — WhatsApp through WAHA replaces Twilio SMS

Backfilled on 2026-10-20; the exact date is approximate.

- Notifications are sent over WhatsApp by a WAHA server the owner runs at home. This supersedes the earlier "forget WhatsApp, use Twilio SMS" decision. WAHA connection settings live in Script Properties.
- An **On Deck** message warns the next person in line that their turn is coming.
- WAHA was used for the 2027 lottery and worked very well.

## 2026-09 — Thanksgiving joins the round-4 rule

Backfilled on 2026-10-20; the exact date is approximate.

- Spring Break, Thanksgiving and Christmas weeks are all off-limits until round 4 for anyone who had that same week off the previous year, so others get a chance at it. This extends the 2026-08 rule, which covered only Spring Break and Christmas.

## 2026-10-20 — Changes approved for the 2028 lottery (not yet built)

Decided by the owner on 2026-10-20 while preparing for the 2028 lottery, expected in September 2027. Each item is **[Planned]** until a pull request implements it.

- **Phase order is holidays before weekends.** Vacation → Holiday Volunteer → Holiday Mandatory → Weekend → Transfer, as intended all along. The 2027 build ran weekends before holidays by mistake; every weekend-first detail in the code (menu order, phase hand-offs, screens, prompts) is to be removed and rebuilt in this order.
- **Holiday picks push the nearby weekend.** When someone picks a holiday call, a pop-up strongly encourages them to also take the weekend call shift next to it (weekend days within the proximity range of the observed date), because nobody wants a holiday weekend broken up by one day of work. It stays optional: they may decline. The weekend-phase pop-up that offered a nearby holiday from a weekend pick belonged to the mistaken weekend-first order and is to be removed.
- **Holiday Volunteer flows straight into Holiday Mandatory** without the admin pressing a button.
- **Naming.** The phases are called "Holiday Volunteer" and "Holiday Mandatory" everywhere (screens, menus, messages, sheet columns), replacing "Mandatory Holiday".
- **Mandatory exclusion.** Anyone marked as having worked an official holiday last year is excluded from Holiday Mandatory. The admin fills in the last-year checkboxes by hand. This supersedes the 2026-08 fallback that expanded the pool to last year's workers.
- **Second mandatory round.** If everyone in the Holiday Mandatory pool already has a holiday and positions are still open, the snake continues for a second pick within the same pool, and the admin gets an alert: "A second Holiday Mandatory round is happening. Do you want to keep excluding people who worked a holiday last year?" The admin answers by changing the checkboxes. Admin Options lists this alert so the admin knows it may arrive. With 20 participants, 12 positions and many repeat volunteers, this is expected to be rare.
- **Auto-Fill/Randomize** refuses to run when no target year is entered. With a year, it clears the existing data and writes fresh rows. This supersedes the 2026-08 design that blocked auto-fill on existing data and required typing the year.
- **Observed holiday dates.** Auto-fill places each official holiday on its observed weekday: a Saturday holiday moves to the Friday before, a Sunday holiday to the Monday after. The admin still reviews the dates.
- **New Year's Day belongs to its own lottery year, even when observed in December.** The lottery for year Y (held around September of year Y−1) includes New Year's Day of year Y, about three months away, so nobody commits to New Year's fifteen months ahead. If New Year's Day of year Y falls on a Saturday, its observed Friday (December 31 of Y−1) is still picked in the year-Y lottery. Example: the 2028 lottery includes New Year's 2028, observed Friday 2027-12-31. This was honored in the 2027 lottery and was well received.

  For reference, the 2027 lottery used: New Year's Day 2027-01-01, Memorial Day 2027-05-31, Independence Day 2027-07-05, Labor Day 2027-09-06, Thanksgiving 2027-11-25, Christmas 2027-12-24.

## 2026-10-21 — One working set of tabs per year, plus a combined archive (not yet built)

Decided by the owner on 2026-10-21. Each item is **[Planned]** until a pull request implements it.

- **One working set of tabs, labeled with its year.** The workbook keeps a single set of lottery tabs rather than a new set each year. Every working tab shows its lottery year in a banner cell at the top, so the admin can see which year a tab belongs to when moving between tabs. Tab names do not change.
- **Initialize Database Schema follows the Active Year (Admin Options B2).**
  - No tabs yet: it creates them stamped with that year.
  - B2 holds a newer year than the tabs: it copies the old year's final assignments into the archive, clears the working tabs, resets the yearly roster fields, pre-checks the last-year boxes, and stamps the tabs with the new year.
  - B2 holds the same year as the tabs, or an older one: nothing is changed or erased until the admin confirms a pop-up that states exactly what will happen.
- **Lottery Archive tab.** One combined tab holds every past year's final assignments (after transfers): vacation weeks, holiday calls, weekend days and transfers, one row per assignment with the year, type, date, position or designation, and person. Rosters and settings are not archived. Running a past year through the lottery again is not supported; the archive is for reference.
- **The roster carries over.** Names, PINs, phone numbers and seniority stay from year to year. Yearly fields are reset: Lottery Position, volunteer and transfer answers, rules acknowledgment, selection and notification tracking.
- **Last-year boxes are pre-checked from the archive.** "Worked Any Official Holiday Last Year" is checked for anyone holding a holiday call in the previous year, and "Had Spring Break / Thanksgiving / Christmas Week Last Year" for anyone who had that designated week. The admin reviews and may change them before the lottery starts.

## 2026-10-21 — Holidays complete stop and phase-start warnings

Decided by the owner on 2026-10-21 with the phase reorder.

- When every holiday call position is filled, the lottery stops at **Holidays complete** and waits for the admin to start the Weekend phase. It no longer jumps to the Transfer phase.
- At that point the admin gets a WhatsApp message saying to start the Weekend phase (only when notifications are enabled).
- A Begin button pressed out of order warns the admin and names the normal order; it starts the phase only if the admin confirms. It does not block, so the admin can still override.

## 2026-10-21 — How the holiday pick offers the nearby weekend

Decided by the owner on 2026-10-21. This spells out the 2026-10-20 "Holiday picks push the nearby weekend" item.

- After a holiday call is picked, the pop-up lists every open Saturday and Sunday within the Holiday Proximity Range (default 3 days) of the holiday's observed date, and asks the person to pick one as First Call. Each Saturday or Sunday is one weekend unit, so for Thanksgiving on a Thursday they choose the Saturday or the Sunday.
- The wording builds on the earlier "FLOGGED" prompt and is editable on Admin Options as "Prompt Text - Holiday Weekend".
- Taking only the holiday stays allowed.
- The holiday and the weekend day are saved together or not at all. If the weekend day (or the holiday) was taken a moment earlier by someone else, nothing is saved and the person repicks: the same holiday with a different weekend day, or a different holiday with its weekend day. Saving the holiday alone in that case is not acceptable.
- The weekend-phase pop-up that offered a holiday from a weekend pick is removed.
- **Open:** whether a weekend day taken with a holiday counts as the person's first weekend pick in the Weekend phase. Not decided yet; until it is, it counts like any other weekend day they hold.

## 2026-10-21 — Holiday Mandatory pool and second-round alert, as built

Decided by the owner on 2026-10-21. This spells out the 2026-10-20 "Mandatory exclusion" and "Second mandatory round" items, which are now built.

- The Holiday Mandatory pool is everyone with "Mandatory Holiday Eligible" checked and "Worked Any Official Holiday Last Year" unchecked. "Mandatory Holiday Eligible" stays as the admin's per-person off switch (for example for a part-year employee).
- Last year's holiday workers are left out of Holiday Mandatory only; they may still volunteer.
- The second-round alert goes to the admin once, when Holiday Mandatory moves into round 2, and only when notifications are enabled. Changes to the last-year boxes take effect on the next turn.
- No separate alert for an empty pool. The pool would be empty only if the admin excluded or switched off everyone in it, and since the snake keeps going round after round, even a small pool fills every position. The owner judged an empty pool very unlikely.

## 2026-10-21 — "Holiday Mandatory" naming, as built

Decided by the owner on 2026-10-21. This completes the 2026-10-20 "Naming" item.

- The Participant Config column "Mandatory Holiday Eligible" is now "Holiday Mandatory Eligible". It works the same way and supersedes the column name quoted in the earlier 2026-10-21 pool entry.
- Existing workbooks keep their checkbox values: ⚙️ Initialize Database Schema renames the column in place, and until it is rerun the old column name is still read.
- Error messages that said "Mandatory Holiday" now say "Holiday Mandatory".

## 2026-10-22 — Auto-fill regenerates the holiday rows, as built

Decided by the owner on 2026-10-22. This completes the 2026-10-20 "Auto-Fill/Randomize" item for Holiday Coverage.

- Auto-fill clears Holiday Coverage and writes the six official holidays for the Active Year on their observed dates, each with an empty Call 1 and Call 2. It no longer keeps existing rows, so last year's dates and assignees do not carry over.
- Extra holiday rows the admin added and hand-corrected dates are erased by a rerun, the same as the admin's changes on the other tabs auto-fill rewrites. The admin reviews the dates after running it.
- The weekend holiday-proximity warnings are computed from the newly written dates.
