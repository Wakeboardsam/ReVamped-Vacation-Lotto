# Phase Transitions Documentation

## CURRENT Behavior (from codebase)

### Phase Setup and Transitions

| Triggering Condition / Action | Caller / Function | Next State | Fields Changed (Config Sheet) |
| :--- | :--- | :--- | :--- |
| Initial Setup | Generic script/setup | `SETUP_EMPTY` or `SETUP` | Current Phase |
| Admin begins Seniority Round manually | `Admin.gs` -> `beginSeniorityRound()` | `VACATION_SENIORITY` | Current Phase: `VACATION_SENIORITY`<br>Current Round: 1<br>Current Direction: `ASCENDING`<br>Current Lead: 1 |
| Queue advances to Vacation round 2 | `Queue.gs` -> `advanceQueueInternal_()` | `VACATION_RANDOM` | Current Phase: `VACATION_RANDOM`<br>Current Round: 2<br>Current Direction: `ASCENDING`<br>Current Lead: 1 |
| Admin begins Holiday Phase manually | `Admin.gs` -> `beginHolidayPhase()` | `HOLIDAY_VOLUNTEER` | Current Phase: `HOLIDAY_VOLUNTEER`<br>Current Round: 1<br>Current Direction: `ASCENDING`<br>Current Lead: 1 |
| Holiday Volunteer empty pool, spots open | `Queue.gs` -> `advanceQueueInternal_()` | `HOLIDAY_MANDATORY` | Current Phase: `HOLIDAY_MANDATORY`<br>Current Round: 1<br>Current Direction: `ASCENDING`<br>Current Lead: 1 |
| Admin begins Weekend Phase manually | `Admin.gs` -> `beginWeekendPhase()` | `WEEKEND` | Current Phase: `WEEKEND`<br>Current Round: 1<br>Current Direction: `ASCENDING`<br>Current Lead: 1 |
| Admin begins Transfer Phase manually | `Admin.gs` -> `beginTransferPhase()` | `TRANSFER_OFFER_COLLECTION` | Current Phase: `TRANSFER_OFFER_COLLECTION`<br>Current Round: 1<br>Current Direction: `ASCENDING`<br>Current Lead: 1 |
| Transfer Offer Collection complete | `WebApp.gs` -> `checkTransferOfferCollectionComplete_()` | `TRANSFER_RECEIVER` | Current Phase: `TRANSFER_RECEIVER`<br>Current Round: 1<br>Current Direction: `ASCENDING`<br>Current Lead: 1 |

### Queue Advancement Triggers & Reconciliation
- **Participant Submits Selection**: `WebApp.gs` -> `submitSelection()` invokes `advanceQueueInternal_()`.
- **Admin Action / WebApp**: Notifications, resolving stalled states, or missing participants directly use `advanceQueueInternal_()`.
- **Transfers Complete**: Note that there is no generic `COMPLETE` phase state currently set when `TRANSFER_RECEIVER` exhausts receivers; it simply stalls until admin intervention.

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
