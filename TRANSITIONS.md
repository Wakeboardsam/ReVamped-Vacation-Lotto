# Phase Transitions Documentation

## CURRENT Behavior (from codebase)
### Phase Setup and Transitions
- **Initial State**: `SETUP_EMPTY` or `SETUP` (typically set during admin setup operations).
- **Vacation Seniority**:
  - Started manually via `beginSeniorityRound()` (in `Admin.gs`), sets phase to `VACATION_SENIORITY`, round 1, ASCENDING, lead 1.
  - Automatically transitions to `VACATION_RANDOM` when `advanceQueueInternal_()` (in `Queue.gs`) detects phase is `VACATION_SENIORITY` and new round is 2. It sets round 2, ASCENDING, lead 1.
- **Holiday**:
  - Started manually via `beginHolidayPhase()` (in `Admin.gs`), sets phase to `HOLIDAY_VOLUNTEER`, round 1, ASCENDING, lead 1.
  - Automatically falls back from `HOLIDAY_VOLUNTEER` to `HOLIDAY_MANDATORY` when `advanceQueueInternal_()` detects `HOLIDAY_VOLUNTEER` has an empty eligible pool but unfilled spots (in `Queue.gs`). It sets phase `HOLIDAY_MANDATORY`, round 1, ASCENDING, lead 1.
- **Weekend**:
  - Started manually via `beginWeekendPhase()` (in `Admin.gs`), sets phase to `WEEKEND`, round 1, ASCENDING, lead 1.
- **Transfer**:
  - Started manually via `beginTransferPhase()` (in `Admin.gs`), sets phase to `TRANSFER_OFFER_COLLECTION`, round 1, ASCENDING, lead 1.
  - Automatically transitions from `TRANSFER_OFFER_COLLECTION` to `TRANSFER_RECEIVER` when `checkTransferOfferCollectionComplete_()` (in `WebApp.gs`) detects all givers have submitted. It sets round 1, ASCENDING, lead 1.

### Queue Advancement Triggers
- Submitting a selection: `submitSelection()` in `WebApp.gs` calls `advanceQueueInternal_()`.
- Resending notifications or resolving stalled state: `advanceQueueInternal_()` is occasionally invoked manually by admins or triggered via WebApp.

---

## TARGET Behavior (Targeted for later task)
### Overall Flow
Prepared Setup → Vacation → Holiday → Weekend → Transfer → Complete.

### Transition Contract
- **Prepared setup** → admin starts `VACATION_SENIORITY` round 1.
- **Seniority round 1 finishes** → `VACATION_RANDOM` round 2 automatically.
- **Vacation target completion or explicit admin early-close** → `READY_HOLIDAY_VOLUNTEER`.
- **Admin starts `HOLIDAY_VOLUNTEER`**; full holiday coverage → `READY_WEEKEND`; exhausted legal volunteers with openings → `READY_HOLIDAY_MANDATORY`.
- **Admin explicitly starts `HOLIDAY_MANDATORY`**; full holiday coverage → `READY_WEEKEND`.
- **Admin starts `WEEKEND`**; full coverage or explicit admin early-close → `READY_TRANSFER`.
- **Admin starts `TRANSFER_OFFER_COLLECTION`**; all participating givers submit → `TRANSFER_RECEIVER`; no available offers or eligible receivers → `COMPLETE`.

### Key Specifications
- `READY_*` values belong directly in **Config / Current Phase**. They expose no participant turns and skip unnecessary selection stages for filled coverage.
- Missing/malformed coverage cannot enter READY state.
- Vacation Random starts at round 2, lottery position 1, ASCENDING.
- Holiday Volunteer, Holiday Mandatory, Weekend, and Transfer Receiver each start at round 1, lottery position 1, ASCENDING, using the annual lottery order and filtering ineligible positions.
