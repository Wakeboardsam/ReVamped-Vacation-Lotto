# Vacation Lottery Phase Transitions

This change reorders phases and updates the necessary admin/waiting-state behavior. Participant eligibility, selection rules, active-window behavior, serpentine traversal, and transfer mechanics within each phase remain as in the approved Task 2 baseline.

---

## 1. Initial State & Setup

The system initial setup state is `SETUP` (stored in the `Config` sheet under `Current Phase`). When in state `SETUP`:
- Administrative tools (such as database schema initialization, roster auto-fill, and date generation) prepare the lottery data for the target Active Year.
- The administrator begins the annual lottery by invoking `beginSeniorityRound()`, which verifies valid prepared setup data under script lock and transitions the system directly into `VACATION_SENIORITY` (Round 1, ASCENDING, Lead 1).

---

## 2. Transition Triggers & Entry Points

The table below describes all authoritative phase transitions, their triggering conditions, resulting states, and responsible entry point functions.

| Current State | Condition / Action | Resulting State | Responsible Entry Point / Writer |
|---|---|---|---|
| `SETUP` | Administrator clicks Begin Seniority | `VACATION_SENIORITY` | `beginSeniorityRound()` (`Admin.gs`) |
| `VACATION_SENIORITY` | Seniority round finishes & vacation targets remain | `VACATION_RANDOM` (Round 2) | `advanceQueueInternal_()` (`Queue.gs`) |
| `VACATION_SENIORITY` / `VACATION_RANDOM` | All vacation targets met | `READY_HOLIDAY_VOLUNTEER`* | `advanceQueueInternal_()` (`Queue.gs`) / `submitSelection()` (`WebApp.gs`) |
| `VACATION_SENIORITY` / `VACATION_RANDOM` | Administrator ends Vacation early | `READY_HOLIDAY_VOLUNTEER`* | `endVacationEarly()` (`Admin.gs`) |
| `READY_HOLIDAY_VOLUNTEER` | Administrator clicks Begin Holiday Volunteer | `HOLIDAY_VOLUNTEER` | `beginHolidayPhase()` (`Admin.gs`) |
| `HOLIDAY_VOLUNTEER` | All holiday call positions filled | `READY_WEEKEND`* | `advanceQueueInternal_()` (`Queue.gs`) / `submitSelection()` (`WebApp.gs`) |
| `HOLIDAY_VOLUNTEER` | Volunteer participation exhausted & holiday positions remain | `READY_HOLIDAY_MANDATORY` | `advanceQueueInternal_()` (`Queue.gs`) / `submitSelection()` (`WebApp.gs`) |
| `READY_HOLIDAY_MANDATORY` | Administrator clicks Begin Mandatory Holiday | `HOLIDAY_MANDATORY` | `beginMandatoryHolidayPhase()` (`Admin.gs`) |
| `HOLIDAY_MANDATORY` | All holiday call positions filled | `READY_WEEKEND`* | `advanceQueueInternal_()` (`Queue.gs`) / `submitSelection()` (`WebApp.gs`) |
| `READY_WEEKEND` | Administrator clicks Begin Weekend | `WEEKEND` | `beginWeekendPhase()` (`Admin.gs`) |
| `WEEKEND` | All weekend positions filled | `READY_TRANSFER` | `advanceQueueInternal_()` (`Queue.gs`) / `submitSelection()` (`WebApp.gs`) |
| `READY_TRANSFER` | Administrator clicks Begin Transfer Giveaways | `TRANSFER_OFFER_COLLECTION` | `beginTransferPhase()` (`Admin.gs`) |
| `TRANSFER_OFFER_COLLECTION` | All eligible givers have submitted offers | `TRANSFER_RECEIVER` | `checkTransferOfferCollectionComplete_()` (`WebApp.gs`) |
| `TRANSFER_RECEIVER` | No active offers remain or no eligible receivers remain | `COMPLETE` | `advanceQueueInternal_()` (`Queue.gs`) |

*\*Subject to completed-coverage skipping (e.g. if downstream Holiday or Weekend coverage is already complete, state routes directly to `READY_WEEKEND` or `READY_TRANSFER`).*

---

## 3. Completed-Coverage Skipping Rules

When Vacation or Holiday selection closes (via full completion or explicit early close), status helpers in `PhaseStatus.gs` evaluate downstream coverage before staging a `READY_*` state:

1. **Vacation Close (`getNextReadyStateFromVacation()`):**
   - Evaluates `getHolidayPhaseStatus()`. If `INCOMPLETE`, stages `READY_HOLIDAY_VOLUNTEER`.
   - If Holiday is `COMPLETE`, evaluates `getWeekendPhaseStatus()`.
   - If Weekend is `INCOMPLETE`, stages `READY_WEEKEND` (skipping Holiday).
   - If Weekend is `COMPLETE`, stages `READY_TRANSFER` (skipping Holiday and Weekend).
2. **Holiday Close (`getNextReadyStateFromHoliday()`):**
   - Evaluates `getWeekendPhaseStatus()`. If `INCOMPLETE`, stages `READY_WEEKEND`.
   - If Weekend is `COMPLETE`, stages `READY_TRANSFER` (skipping Weekend).
3. **Re-checking on Admin Begin:**
   - When an administrator clicks `Begin` for a phase (e.g., `beginHolidayPhase`), the entry point re-checks `PhaseStatus.gs`. If coverage became complete while waiting, it advances directly to the downstream `READY_*` state and alerts the admin of skipped stages without automatically opening active selection.

---

## 4. Admin Entry Point Guarding & Explicit Early Close

### Guarding Rules
- Each `begin*Phase()` menu entry point in `Admin.gs` strictly validates that the current state matches its required `READY_*` state (or `SETUP` state for Seniority).
- Calls from incorrect phases or repeated clicks from active phases throw descriptive errors without mutating state, queue counters, or tracking fields.
- When an active phase successfully begins, `resetParticipantTrackingFields_()` resets turn tracking (`Entry Timestamp`, `Reminder Sent`, and `Admin Alert Sent`).

### Explicit Early-Close Actions
- **`endVacationEarly()`:**
  - Invoked strictly from active Vacation phases (`VACATION_SENIORITY` / `VACATION_RANDOM`).
  - Displays remaining unselected target picks and requires explicit admin UI confirmation.
  - Re-acquires script lock and re-verifies phase status. If `SETUP_ERROR` exists, the early close is blocked.
  - Stages the appropriate next `READY_*` state while preserving unselected deficits for manual resolution. Unmet targets remain recorded and do not block subsequent `Begin` actions.

---

## 5. Optional Adjacent Weekend Selection During Holiday

During the Holiday Volunteer and Mandatory Holiday phases:
- When a participant selects a holiday call position, eligible unassigned weekend First Call choices within the configured `Holiday Proximity Range (days)` are presented as an optional addition.
- If accepted, the weekend choice is recorded as an ordinary weekend assignment and counts toward the participant's weekend assignment maximum.
- When the Weekend phase begins, any pre-assigned optional weekends count through the standard weekend assignment-counting mechanism.
- In subsequent Transfer phases, optional weekend assignments remain eligible for transfer under standard weekend transfer rules.
- Declining or canceling the optional weekend leaves the primary holiday selection and progression operating normally.

---

## 6. Deferred Features & Out-of-Scope Items

The following features remain explicitly deferred as separate, future work:
- New mandatory-holiday tiers.
- New stall alerts or general queue hardening.
