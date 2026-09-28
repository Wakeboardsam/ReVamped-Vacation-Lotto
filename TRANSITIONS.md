# Phase Transitions Documentation

## CURRENT Behavior (from codebase)

### Phase Setup and Transitions

| Triggering Condition / Action | Caller / Function | Next State | Fields Changed (Config Sheet) |
| :--- | :--- | :--- | :--- |
| Admin begins Seniority Round manually | `Admin.gs` -> `beginSeniorityRound()` | `VACATION_SENIORITY` | Current Phase: `VACATION_SENIORITY`<br>Current Round: 1<br>Current Direction: `ASCENDING`<br>Current Lead: 1 |
| Queue advances to Vacation round 2 | `Queue.gs` -> `advanceQueueInternal_()` | `VACATION_RANDOM` | Current Phase: `VACATION_RANDOM`<br>Current Round: 2<br>Current Direction: `ASCENDING`<br>Current Lead: 1 |
| Admin begins Holiday Phase manually | `Admin.gs` -> `beginHolidayPhase()` | `HOLIDAY_VOLUNTEER` | Current Phase: `HOLIDAY_VOLUNTEER`<br>Current Round: 1<br>Current Direction: `ASCENDING`<br>Current Lead: 1 |
| Holiday Volunteer empty pool, spots open | `Queue.gs` -> `advanceQueueInternal_()` | `HOLIDAY_MANDATORY` | Current Phase: `HOLIDAY_MANDATORY`<br>Current Round: 1<br>Current Direction: `ASCENDING`<br>Current Lead: 1 |
| All holiday positions filled | `Queue.gs` -> `advanceQueueInternal_()` | `TRANSFER_OFFER_COLLECTION` | Current Phase: `TRANSFER_OFFER_COLLECTION`<br>Current Round: 1<br>Current Direction: `ASCENDING`<br>Current Lead: 1 |
| Admin begins Weekend Phase manually | `Admin.gs` -> `beginWeekendPhase()` | `WEEKEND` | Current Phase: `WEEKEND`<br>Current Round: 1<br>Current Direction: `ASCENDING`<br>Current Lead: 1 |
| Admin begins Transfer Phase manually | `Admin.gs` -> `beginTransferPhase()` | `TRANSFER_OFFER_COLLECTION` | Current Phase: `TRANSFER_OFFER_COLLECTION`<br>Current Round: 1<br>Current Direction: `ASCENDING`<br>Current Lead: 1 |
| Transfer Offer Collection complete | `WebApp.gs` -> `checkTransferOfferCollectionComplete_()` | `TRANSFER_RECEIVER` | Current Phase: `TRANSFER_RECEIVER`<br>Current Round: 1<br>Current Direction: `ASCENDING`<br>Current Lead: 1 |
| No active transferable offers remain | `Queue.gs` -> `advanceQueueInternal_()` | `COMPLETE` | Current Phase: `COMPLETE` |
| Transfer Receiver phase exhausted | `Queue.gs` -> `advanceQueueInternal_()` | `COMPLETE` | Current Phase: `COMPLETE` |
| Queue advancement exhausts eligible participants finding next lead | `Queue.gs` -> `advanceQueueInternal_()` | `COMPLETE` | Current Phase: `COMPLETE` (after holiday checks) |
| Queue advancement starts with empty pool for TRANSFER_RECEIVER | `Queue.gs` -> `advanceQueueInternal_()` | `COMPLETE` | Current Phase: `COMPLETE` |

| Queue advancement starts with initially empty eligible pool (Vacation/Weekend) | `Queue.gs` -> `advanceQueueInternal_()` | (No Change) | Function returns without advancing queue |

### Queue Advancement Triggers & Reconciliation
- **Participant Submits Selection**: `WebApp.gs` -> `submitSelection()` invokes `advanceQueueInternal_()`.
- **Admin Action / WebApp**: `advanceQueueInternal_()` is called via `reconcileFromSheet()` -> `advanceQueue()` or UI triggers when notifications or selections push the queue.
- **Completion States**: `Queue.gs` proactively sets `COMPLETE` if the Transfer Receiver phase encounters an empty initial pool, if there are strictly zero transferable offers, or if finding the next eligible lead exhausts the pool during round advancement (outside of Holiday fallbacks). Note that if an initial pool for Vacation or Weekend is empty, the function simply returns without changing the phase.
- **Holiday to Transfer**: When `advanceQueueInternal_()` detects that `hasOpenHolidayPositions_()` is false in `HOLIDAY_VOLUNTEER` or `HOLIDAY_MANDATORY`, it automatically stages `TRANSFER_OFFER_COLLECTION` (Round 1, ASCENDING, Lead 1).

### READY States Consumption & Guards (Task 2 Implemented)

The application recognizes four durable waiting states in `Config / Current Phase`:
1. `READY_HOLIDAY_VOLUNTEER` -> Next: `HOLIDAY_VOLUNTEER`
2. `READY_HOLIDAY_MANDATORY` -> Next: `HOLIDAY_MANDATORY`
3. `READY_WEEKEND` -> Next: `WEEKEND`
4. `READY_TRANSFER` -> Next: `TRANSFER_OFFER_COLLECTION`

- **Queue Readers**: `getQueueWindows_()` returns `windowSize: 0`, empty `activeWindow` and `upNextWindow`, and the full participant roster. `getActiveParticipants()` returns `[]`.
- **Queue Advancement & Reconciliation**: `advanceQueueInternal_()` returns without changing state, round, direction, lead, assignments, or tracking. `reconcileFromSheet()` performs validations and statistics calculations but skips `advanceQueue()`.
- **API Contracts**: `getInitialState()` and `getPublicDisplaySnapshot()` expose `readiness: { nextPhase, message }` (or `null` outside READY states). `isActive` is `false`.
- **Submission Guards**: `submitSelection()` rejects all actions (`SUBMIT`, `PASS`, `NONE`, "no giveaways") inside its script lock with a waiting-for-administrator error message.
- **Notification Suppression**: Automated pings, manual resends, and overdue alerts exit early without sending messages or updating tracking. Resend checkboxes edited during READY states are reset to `FALSE` without sending.
- **Client Rendering**: Header displays "WAITING FOR ADMIN", round/direction badges are hidden, selection controls are disabled/hidden, friendly waiting messages are shown, and active sessions clear pending selections/modals on transition into READY states.

*(Note: Production of READY states and administrator Begin/start controls belong to pending Task 3.)*

---

## TARGET Behavior (Targeted for later task)

### Transition Contract

| Prepared State | Triggering Condition / Action | Target Phase State | Description |
| :--- | :--- | :--- | :--- |
| Prepared Setup | Admin starts `VACATION_SENIORITY` | `VACATION_SENIORITY` | Round 1, ASCENDING, Lead 1. |
| `VACATION_SENIORITY` | Seniority Round 1 finishes | `VACATION_RANDOM` | Round 2, Position 1, ASCENDING (continuing vacation round count). |
| `VACATION_RANDOM` | Vacation targets met OR admin early-close | `READY_HOLIDAY_VOLUNTEER` | Exposed in Config / Current Phase. Skips selection stage for filled coverage. No participant turns exposed. |
| `READY_HOLIDAY_VOLUNTEER` | Admin starts `HOLIDAY_VOLUNTEER` | `HOLIDAY_VOLUNTEER` | Round 1, Position 1, ASCENDING (using annual lottery order, filtering ineligible). |
| `HOLIDAY_VOLUNTEER` | Full holiday coverage met | `READY_WEEKEND` | Exposed directly in Config / Current Phase. |
| `HOLIDAY_VOLUNTEER` | Exhausted legal volunteers with open spots | `READY_HOLIDAY_MANDATORY` | Staged for mandatory assignments. |
| `READY_HOLIDAY_MANDATORY` | Admin starts `HOLIDAY_MANDATORY` | `HOLIDAY_MANDATORY` | Round 1, Position 1, ASCENDING. |
| `HOLIDAY_MANDATORY` | Full holiday coverage met | `READY_WEEKEND` | Exposed directly in Config / Current Phase. |
| `READY_WEEKEND` | Admin starts `WEEKEND` | `WEEKEND` | Round 1, Position 1, ASCENDING. |
| `WEEKEND` | Full weekend coverage met OR admin early-close | `READY_TRANSFER` | Exposed directly in Config / Current Phase. |
| `READY_TRANSFER` | Admin starts `TRANSFER_OFFER_COLLECTION` | `TRANSFER_OFFER_COLLECTION` | Offer collection occurs simultaneously. |
| `TRANSFER_OFFER_COLLECTION` | All participating givers submit | `TRANSFER_RECEIVER` | Round 1, Position 1, ASCENDING. |
| `TRANSFER_RECEIVER` | No available offers or eligible receivers | `COMPLETE` | Fully finished phase flow. |

### Key Requirements
- `READY_*` values are written strictly and exclusively to `Config / Current Phase`.
- Missing or malformed data prevents entry into a `READY_*` state (must be fixed or results in `SETUP_ERROR` evaluation).
- Phases like Holiday Volunteer, Holiday Mandatory, Weekend, and Transfer Receiver re-initialize at Round 1, Position 1, ASCENDING utilizing the annual lottery order.
