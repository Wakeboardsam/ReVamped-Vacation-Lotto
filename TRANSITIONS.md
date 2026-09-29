# Vacation Lottery Phase Transitions

This document defines the implemented phase transitions, status requirements, and state management rules for the annual Vacation Lottery system (target year 2027 and future years).

---

## 1. Phase Order & State Machine

The lottery transitions through the following standard sequential phases:

```
[Initial Prepared Setup]
        │ (Administrator Begins Seniority Round)
        ▼
VACATION_SENIORITY (Round 1, ASCENDING)
        │
        ├── All Vacation targets met ────────────────────────────────┐
        │                                                           │
        ▼ (Seniority round finishes with unmet targets)            │
VACATION_RANDOM (Round 2+, ASCENDING/DESCENDING)                  │
        │                                                           │
        ├── All Vacation targets met / Early Close                  │
        ▼                                                           │
READY_HOLIDAY_VOLUNTEER <───────────────────────────────────────────┘
        │ (Administrator Begins Holiday Volunteer)
        ▼
HOLIDAY_VOLUNTEER (Round 1+, Serpentine)
        │
        ├── Volunteers exhausted with unfilled positions ────────┐
        │                                                         │
        ├── All Holiday positions filled                         │
        │   (or skipped if already complete)                      │
        │                                                         │
        ▼                                                         ▼
READY_WEEKEND <───────────────────────────── READY_HOLIDAY_MANDATORY
        │                                             │ (Admin Begins Mandatory)
        │ (Administrator Begins Weekend)              ▼
        │                                     HOLIDAY_MANDATORY
        │                                             │
        │                                             └── All Holiday filled
        ▼                                                 (or skipped)
     WEEKEND (Round 1+, Serpentine) ──────────────────────────┘
        │
        ├── All Weekend positions filled / Early Close
        ▼
READY_TRANSFER
        │ (Administrator Begins Transfer Giveaways)
        ▼
TRANSFER_OFFER_COLLECTION (Givers)
        │
        ├── All Givers submitted offers / marked complete
        ▼
TRANSFER_RECEIVER (Receivers, Serpentine)
        │
        ├── Terminal completion (No active offers / No eligible receivers)
        ▼
    COMPLETE
```

---

## 2. Transition Triggers & Entry Points

| Current State | Condition / Action | Resulting State | Responsible Entry Point / Writer |
|---|├──|---|---|
| `SETUP` / `PREPARED` | Administrator clicks Begin Seniority | `VACATION_SENIORITY` | `beginSeniorityRound()` (`Admin.gs`) |
| `VACATION_SENIORITY` | Seniority round finishes & targets remain | `VACATION_RANDOM` (Round 2) | `advanceQueueInternal_()` (`Queue.gs`) |
| `VACATION_SENIORITY` / `VACATION_RANDOM` | All vacation targets met | `READY_HOLIDAY_VOLUNTEER`* | `advanceQueueInternal_()` (`Queue.gs`) / `submitSelection()` (`WebApp.gs`) |
| `VACATION_SENIORITY` / `VACATION_RANDOM` | Administrator ends Vacation early | `READY_HOLIDAY_VOLUNTEER`* | `endVacationEarly()` (`Admin.gs`) |
| `READY_HOLIDAY_VOLUNTEER` | Administrator clicks Begin Holiday Volunteer | `HOLIDAY_VOLUNTEER` | `beginHolidayPhase()` (`Admin.gs`) |
| `HOLIDAY_VOLUNTEER` | All holiday positions filled | `READY_WEEKEND`* | `advanceQueueInternal_()` (`Queue.gs`) / `submitSelection()` (`WebApp.gs`) |
| `HOLIDAY_VOLUNTEER` | Volunteers exhausted & positions remain | `READY_HOLIDAY_MANDATORY` | `advanceQueueInternal_()` (`Queue.gs`) / `submitSelection()` (`WebApp.gs`) |
| `READY_HOLIDAY_MANDATORY` | Administrator clicks Begin Mandatory Holiday | `HOLIDAY_MANDATORY` | `beginMandatoryHolidayPhase()` (`Admin.gs`) |
| `HOLIDAY_MANDATORY` | All holiday positions filled | `READY_WEEKEND`* | `advanceQueueInternal_()` (`Queue.gs`) / `submitSelection()` (`WebApp.gs`) |
| `READY_WEEKEND` | Administrator clicks Begin Weekend | `WEEKEND` | `beginWeekendPhase()` (`Admin.gs`) |
| `WEEKEND` | All weekend positions filled / Early Close | `READY_TRANSFER` | `advanceQueueInternal_()` (`Queue.gs`) / `endWeekendEarly()` (`Admin.gs`) |
| `READY_TRANSFER` | Administrator clicks Begin Transfer Giveaways | `TRANSFER_OFFER_COLLECTION` | `beginTransferPhase()` (`Admin.gs`) |
| `TRANSFER_OFFER_COLLECTION` | Giver completion satisfied | `TRANSFER_RECEIVER` | `checkTransferOfferCollectionComplete_()` (`Queue.gs`) |
| `TRANSFER_RECEIVER` | No active offers or no eligible receivers | `COMPLETE` | `advanceQueueInternal_()` (`Queue.gs`) |

*\*Subject to completed-coverage skipping (e.g. if downstream Holiday or Weekend coverage is already complete, state routes directly to `READY_WEEKEND` or `READY_TRANSFER`).*

---

## 3. Completed-Coverage Skipping Rules

When Vacation or Holiday selection closes (via full completion or early close), status helpers in `PhaseStatus.gs` evaluate downstream coverage before staging a `READY_*` state:

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

## 4. Admin Entry Point Guarding & Early Closes

### Guarding Rules
- Each `begin*Phase()` menu entry point in `Admin.gs` strictly validates that the current state matches its required `READY_*` state (or setup state for Seniority).
- Calls from incorrect phases or repeated clicks from active phases throw descriptive errors without mutating state, queue counters, or tracking fields.
- When an active phase successfully begins, `resetParticipantTrackingFields_()` resets turn tracking (`Entry Timestamp`, `Reminder Sent`, `Admin Alert Sent`, and On Deck states).

### Explicit Early-Close Actions
- **`endVacationEarly()` & `endWeekendEarly()`:**
  - Invoked strictly from matching active phases (`VACATION_SENIORITY`/`VACATION_RANDOM` or `WEEKEND`).
  - Displays remaining unselected target picks or vacancies and requires explicit admin UI confirmation.
  - Re-acquires script lock and re-verifies phase status. If `SETUP_ERROR` exists, the early close is blocked.
  - Stages the appropriate next `READY_*` state while preserving unselected deficits/vacancies for manual resolution. Unmet targets remain recorded and do not block subsequent `Begin` actions.

---

## 5. Deferred Features & Out-of-Scope Items

The following features remain explicitly deferred to future tasks:
- Mandatory Holiday multi-tier priority logic.
- Automated reverse adjacent-selection toggles.
- Custom notification infrastructure or new alert subsystems.
