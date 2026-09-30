const fs = require('fs');
const vm = require('vm');
const path = require('path');

// --- Helper for Mock DOM Nodes ---
function createMockElement(id, tag = 'div') {
  const children = [];
  const attributes = {};
  const classListMap = {};
  const eventListeners = {};
  let innerHtmlVal = '';
  let textContentVal = '';

  const el = {
    id: id,
    tagName: tag.toUpperCase(),
    style: {},
    classList: {
      add: function(c) { classListMap[c] = true; },
      remove: function(c) { delete classListMap[c]; },
      contains: function(c) { return !!classListMap[c]; }
    },
    get innerHTML() {
      if (innerHtmlVal) return innerHtmlVal;
      return children.map(c => c.outerHTML || c.innerHTML || c.textContent || '').join('');
    },
    set innerHTML(val) {
      innerHtmlVal = String(val);
      textContentVal = String(val).replace(/<[^>]*>/g, '');
      children.length = 0;
    },
    get textContent() {
      if (textContentVal) return textContentVal;
      return children.map(c => c.textContent || '').join('');
    },
    set textContent(val) {
      textContentVal = String(val);
      innerHtmlVal = String(val);
    },
    get innerText() { return el.textContent; },
    set innerText(val) { el.textContent = val; },
    value: '',
    disabled: false,
    checked: false,
    setAttribute: function(k, v) { attributes[k] = String(v); },
    getAttribute: function(k) { return attributes[k] || null; },
    removeAttribute: function(k) { delete attributes[k]; },
    appendChild: function(child) {
      children.push(child);
      if (!innerHtmlVal) {
        textContentVal += (child.textContent || '');
      }
    },
    get children() { return children; },
    querySelectorAll: function(selector) {
      if (selector === 'input[name="wkndOpt"]') {
        return children.filter(c => c.name === 'wkndOpt');
      }
      return [];
    },
    querySelector: function(selector) {
      if (selector === 'input[name="wkndOpt"]:checked') {
        return children.find(c => c.name === 'wkndOpt' && c.checked) || null;
      }
      return null;
    },
    addEventListener: function(event, handler) {
      if (!eventListeners[event]) eventListeners[event] = [];
      eventListeners[event].push(handler);
    },
    removeEventListener: function(event, handler) {
      if (eventListeners[event]) {
        eventListeners[event] = eventListeners[event].filter(h => h !== handler);
      }
    },
    click: function() {
      if (eventListeners['click']) {
        eventListeners['click'].forEach(h => h({ target: el }));
      }
    }
  };
  return el;
}

// Prepare DOM elements map
const elementsMap = {};
const elementIds = [
  "loginScreen", "scheduleSection", "mainScreen", "scheduleToggleBtn", "myChoicesBtn",
  "filterType", "filterAvailability", "filterMonth", "findPersonSelect", "loginName",
  "loginPin", "loadingIndicator", "loginBtn", "userNameLabel", "logoutBtn", "statusBadge",
  "phaseLabel", "roundLabel", "directionLabel", "timeWindowNotice", "phaseBadge",
  "selectionCard", "selectionContent", "selectionCount", "selectionLimit", "adjacentHolidayCard",
  "confirmSelectionBtn", "passTurnBtn", "noneChoiceBtn", "noGiveawaysBtn", "waitingCard",
  "rulesModal", "holidayPromptModal", "viewContent", "actionBar", "submitSelectionBtn", "passBtn",
  "selectionSummary", "publicPhaseHeading", "publicQueueList", "publicActiveList", "publicUpNextList",
  "activeNames", "upNextNames", "activeYearLabel"
];

elementIds.forEach(id => {
  elementsMap[id] = createMockElement(id);
});

const docListeners = {};

const mockBody = createMockElement('body', 'body');

const mockDocument = {
  body: mockBody,
  getElementById: function(id) {
    if (!elementsMap[id]) {
      elementsMap[id] = createMockElement(id);
    }
    return elementsMap[id];
  },
  querySelector: function(selector) {
    if (selector === 'input[name="wkndOpt"]:checked') {
      const container = mockDocument.getElementById('adjacentHolidayOptions');
      return container.querySelector(selector);
    }
    return null;
  },
  querySelectorAll: function(selector) {
    if (selector === 'input[name="wkndOpt"]') {
      const container = mockDocument.getElementById('adjacentHolidayOptions');
      return container.querySelectorAll(selector);
    }
    return [];
  },
  createElement: function(tag) { return createMockElement("dynamic", tag); },
  addEventListener: function(evt, fn) {
    if (!docListeners[evt]) docListeners[evt] = [];
    docListeners[evt].push(fn);
  }
};

const mockLocalStorage = {
  getItem: function() { return null; },
  setItem: function() {},
  removeItem: function() {}
};

const mockWindow = {
  document: mockDocument,
  localStorage: mockLocalStorage,
  addEventListener: function() {},
  location: { reload: function() {} }
};

let submitRpcCalls = 0;
let lastSubmittedPayload = null;

function createMockRpc(successCb, failureCb) {
  const mockRunner = {
    withSuccessHandler: function(scb) {
      return createMockRpc(scb, failureCb);
    },
    withFailureHandler: function(fcb) {
      return createMockRpc(successCb, fcb);
    },
    submitSelection: function(participant, payload) {
      submitRpcCalls++;
      lastSubmittedPayload = payload;
      if (successCb) {
        successCb({ success: true });
      }
    },
    getInitialState: function(participant, pin) {
      if (successCb) {
        successCb({
          success: true,
          phase: (typeof appState !== 'undefined' && appState.phase) ? appState.phase : 'INACTIVE',
          participant: (typeof appState !== 'undefined' && appState.participant) ? appState.participant : { Name: 'Alice' },
          availableChoices: (typeof appState !== 'undefined' && appState.availableChoices) ? appState.availableChoices : { holiday: [], weekend: [] }
        });
      }
    },
    getPublicDisplaySnapshot: function() {
      if (successCb) {
        successCb({ success: true, phase: 'INACTIVE' });
      }
    }
  };
  return mockRunner;
}

const mockGoogle = {
  script: {
    get run() {
      return createMockRpc();
    }
  }
};

// Load production JS.html code
const jsHtmlPath = path.join(__dirname, '..', 'JS.html');
const jsHtml = fs.readFileSync(jsHtmlPath, 'utf8');
const jsCode = jsHtml.replace(/<script>/g, '').replace(/<\/script>/g, '');

const browserSandbox = {
  console: console,
  window: mockWindow,
  document: mockDocument,
  google: mockGoogle,
  localStorage: mockLocalStorage,
  setInterval: function() {},
  clearInterval: function() {},
  setTimeout: function() {},
  clearTimeout: function() {}
};

vm.createContext(browserSandbox);
vm.runInContext(jsCode, browserSandbox);

// Trigger DOMContentLoaded so all event listeners (e.g. cancelWeekendBtn, confirmHolidayBtn) are registered
if (docListeners['DOMContentLoaded']) {
  docListeners['DOMContentLoaded'].forEach(fn => fn());
}

// Retrieve functions under test directly from browser sandbox
const {
  appState,
  onStateLoaded,
  renderPhaseView,
  updateActionBar,
  renderPublicPhaseHeading,
  renderPublicQueue,
  submitSelection,
  getNearbyAvailableWeekendsForHoliday,
  showHolidayPrompt,
  confirmHolidaySelection,
  declineHolidaySelection
} = browserSandbox;

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failCount++;
  } else {
    console.log(`✅ PASS: ${message}`);
    passCount++;
  }
}

console.log("=== RUNNING FRONTEND READY-STATE HARNESS TESTS ===");

const readyStates = [
  { phase: 'READY_HOLIDAY_VOLUNTEER', next: 'HOLIDAY_VOLUNTEER', msg: 'Waiting for the administrator to begin Holiday Volunteer selection.' },
  { phase: 'READY_HOLIDAY_MANDATORY', next: 'HOLIDAY_MANDATORY', msg: 'Waiting for the administrator to begin Mandatory Holiday selection.' },
  { phase: 'READY_WEEKEND', next: 'WEEKEND', msg: 'Waiting for the administrator to begin Weekend selection.' },
  { phase: 'READY_TRANSFER', next: 'TRANSFER_OFFER_COLLECTION', msg: 'Waiting for the administrator to begin Transfer Giveaways.' }
];

try {
  // Setup authenticated user context
  appState.participantId = 'Alice';
  appState.name = 'Alice';
  appState.pin = '1234';

  const activeStatePayload = {
    success: true,
    activeYear: '2027',
    participant: { Name: 'Alice', 'Rules Acknowledged Year': '2027' },
    isActive: true,
    phase: 'VACATION_RANDOM',
    round: 2,
    direction: 'ASCENDING',
    queue: { phase: 'VACATION_RANDOM', round: 2, direction: 'ASCENDING', lead: 1, activeNames: ['Alice'], upNextNames: ['Bob'] },
    availableChoices: { vacation: [{ weekId: 'W1', startDate: '2027-01-04', 'Capacity': '4', 'Assigned Participants': '' }], weekend: [], holiday: [], transferOffers: [] },
    readiness: null
  };

  // 1. Initial Active Control Test
  onStateLoaded(activeStatePayload);
  assert(appState.isActive === true, "Control case: appState.isActive is true for active phase");
  assert(mockDocument.getElementById('statusBadge').innerText === 'ACTIVE - YOUR TURN', "Control case: status badge displays ACTIVE - YOUR TURN");
  assert(mockDocument.getElementById('actionBar').style.display !== 'none', "Control case: selection action bar is visible");

  // 2. Test each of the four READY states
  readyStates.forEach(item => {
    console.log(`\n--- Testing State Transition to ${item.phase} ---`);

    // Load active state before transitioning to READY
    onStateLoaded(activeStatePayload);
    assert(mockDocument.getElementById('statusBadge').innerText === 'ACTIVE - YOUR TURN', `${item.phase} pre-check: status badge is ACTIVE - YOUR TURN`);
    assert(mockDocument.getElementById('actionBar').style.display !== 'none', `${item.phase} pre-check: action bar is visible`);

    // Pre-populate selections, pending holiday, and open selection modal
    appState.selections = ['W1'];
    appState.adjacentWeekendPending = { date: '2027-11-27' };
    mockDocument.getElementById('holidayPromptModal').style.display = 'flex';
    assert(mockDocument.getElementById('holidayPromptModal').style.display === 'flex', `${item.phase} pre-check: holidayPromptModal is open`);

    submitRpcCalls = 0; // Reset RPC call counter

    // Construct READY state payload matching API structure with top-level and queue state
    const readyPayload = {
      success: true,
      activeYear: '2027',
      participant: { Name: 'Alice', 'Rules Acknowledged Year': '2027' },
      isActive: false,
      phase: item.phase,
      round: 1,
      direction: 'ASCENDING',
      queue: { phase: item.phase, round: 1, direction: 'ASCENDING', lead: 1, activeNames: [], upNextNames: [] },
      availableChoices: { vacation: [], weekend: [], holiday: [], transferOffers: [] },
      readiness: { nextPhase: item.next, message: item.msg }
    };

    // Transition into READY state solely through onStateLoaded()
    onStateLoaded(readyPayload);

    // Assert friendly waiting message displayed
    const viewContent = mockDocument.getElementById('viewContent');
    assert(viewContent.innerHTML.includes('Waiting for Administrator') && viewContent.innerHTML.includes(item.msg), `${item.phase}: viewContent renders friendly waiting card`);

    // Assert active-turn indicators and selection controls are suppressed
    assert(appState.isActive === false, `${item.phase}: appState.isActive is false`);
    assert(mockDocument.getElementById('statusBadge').innerText === 'WAITING FOR ADMIN', `${item.phase}: status badge displays WAITING FOR ADMIN`);
    assert(mockDocument.getElementById('actionBar').style.display === 'none', `${item.phase}: selection action bar is hidden`);

    // Assert round/direction labels cleared
    assert(mockDocument.getElementById('roundLabel').innerText === '', `${item.phase}: roundLabel is empty`);

    // Assert pending selections and selection modal cleared/closed
    assert(appState.selections.length === 0, `${item.phase}: appState.selections cleared`);
    assert(appState.adjacentWeekendPending === null, `${item.phase}: appState.adjacentWeekendPending cleared`);
    assert(mockDocument.getElementById('holidayPromptModal').style.display === 'none', `${item.phase}: holidayPromptModal display is none`);

    // Assert client submission handler produces zero RPC calls
    submitSelection();
    assert(submitRpcCalls === 0, `${item.phase}: submitSelection blocked (0 RPC calls)`);

    // Public Heading & Queue rendering test
    const publicSnapshot = {
      success: true,
      activeYear: '2027',
      phase: item.phase,
      round: 1,
      direction: 'ASCENDING',
      readiness: { nextPhase: item.next, message: item.msg },
      queue: { phase: item.phase, round: 1, direction: 'ASCENDING', lead: 1, activeNames: [], upNextNames: [] }
    };

    appState.participantId = null; // Guest view
    renderPublicPhaseHeading(publicSnapshot);
    assert(mockDocument.getElementById('phaseLabel').innerText === 'WAITING FOR ADMIN', `${item.phase}: public phaseLabel displays WAITING FOR ADMIN`);

    renderPublicQueue(publicSnapshot);
    const activeList = mockDocument.getElementById('publicActiveList');
    assert(activeList.innerText.includes(item.msg) || activeList.textContent.includes(item.msg), `${item.phase}: public active list displays waiting message`);

    // Restore logged-in user context
    appState.participantId = 'Alice';

    // Return to Active state and assert full restoration
    onStateLoaded(activeStatePayload);
    assert(appState.isActive === true, `${item.phase} restoration: appState.isActive restored to true`);
    assert(mockDocument.getElementById('statusBadge').innerText === 'ACTIVE - YOUR TURN', `${item.phase} restoration: status badge restored to ACTIVE - YOUR TURN`);
    assert(mockDocument.getElementById('actionBar').style.display !== 'none', `${item.phase} restoration: selection action bar is visible`);
    const restoredView = mockDocument.getElementById('viewContent').innerHTML || '';
    assert(!restoredView.includes('Waiting for Administrator'), `${item.phase} restoration: waiting card cleared`);
  });

  console.log('\n--- Testing Production Optional Weekend Selection Functions ---');

  // Test across both Holiday phases: HOLIDAY_VOLUNTEER and HOLIDAY_MANDATORY
  ['HOLIDAY_VOLUNTEER', 'HOLIDAY_MANDATORY'].forEach(testPhase => {
    appState.phase = testPhase;
    appState.holidayProximityRange = 3;
    appState.selections = ['Thanksgiving|Call 1'];
    appState.availableChoices = {
      holiday: [
        { 'Holiday Name': 'Thanksgiving', 'Observed Date': '2027-11-25', 'Call Position (Call 1 / Call 2)': 'Call 1' }
      ],
      weekend: [
        { Date: '2027-11-27', 'First Call Assignee': '' }, // within 2 days
        { Date: '2027-12-05', 'First Call Assignee': '' }  // 10 days away
      ]
    };

    // 1. getNearbyAvailableWeekendsForHoliday returns choices within proximity range
    let nearby = getNearbyAvailableWeekendsForHoliday('Thanksgiving');
    assert(nearby.length === 1 && nearby[0].Date === '2027-11-27', `${testPhase}: getNearbyAvailableWeekendsForHoliday filters nearby unassigned weekends.`);

    // 2. Proximity range 0 (strict same day) excludes 2-day-away weekend
    appState.holidayProximityRange = 0;
    nearby = getNearbyAvailableWeekendsForHoliday('Thanksgiving');
    assert(nearby.length === 0, `${testPhase}: Proximity range 0 excludes non-same-day weekend.`);
    appState.holidayProximityRange = 3; // restore

    // 3. showHolidayPrompt displays modal with radio option and Near Your Vacation badge
    const nearbyList = getNearbyAvailableWeekendsForHoliday('Thanksgiving');
    nearbyList[0].nearVacation = true; // Inject nearVacation flag for rendering assertion
    showHolidayPrompt('Thanksgiving', nearbyList);
    assert(mockDocument.getElementById('holidayPromptModal').style.display === 'flex', `${testPhase}: showHolidayPrompt opens holidayPromptModal.`);
    assert(mockDocument.getElementById('adjacentHolidayName').innerText === 'Thanksgiving', `${testPhase}: holiday name rendered in modal.`);
    assert(mockDocument.getElementById('adjacentHolidayOptions').innerHTML.includes('Near Your Vacation'), `${testPhase}: showHolidayPrompt renders 'Near Your Vacation' caution badge.`);

    // 4. Confirm selection via production confirmHolidaySelection with radio in DOM fixture
    appState.selections = ['Thanksgiving|Call 1'];
    appState.adjacentWeekendPending = null;
    const radioOpt = createMockElement('wkndOpt1', 'input');
    radioOpt.name = 'wkndOpt';
    radioOpt.value = '2027-11-27';
    radioOpt.checked = true;
    mockDocument.getElementById('adjacentHolidayOptions').appendChild(radioOpt);

    lastSubmittedPayload = null;
    confirmHolidaySelection();

    assert(lastSubmittedPayload && lastSubmittedPayload.adjacentWeekend && lastSubmittedPayload.adjacentWeekend.date === '2027-11-27', `${testPhase}: Confirming optional weekend submits RPC with adjacentWeekend.date.`);
    assert(mockDocument.getElementById('holidayPromptModal').style.display === 'none', `${testPhase}: confirmHolidaySelection closes modal.`);

    // 5. Decline selection (No thanks) via production declineHolidaySelection
    appState.selections = ['Thanksgiving|Call 1'];
    lastSubmittedPayload = null;
    declineHolidaySelection();
    assert(lastSubmittedPayload && lastSubmittedPayload.adjacentWeekend === undefined, `${testPhase}: declineHolidaySelection submits RPC without adjacentWeekend.`);
    assert(appState.adjacentWeekendPending === null, `${testPhase}: declineHolidaySelection clears adjacentWeekendPending on success.`);
    assert(mockDocument.getElementById('holidayPromptModal').style.display === 'none', `${testPhase}: declineHolidaySelection closes modal.`);

    // 6. Cancel via actual registered Cancel button event callback
    appState.adjacentWeekendPending = null;
    mockDocument.getElementById('holidayPromptModal').style.display = 'flex';
    const rpcCountPreCancel = submitRpcCalls;
    mockDocument.getElementById('cancelWeekendBtn').click();
    assert(mockDocument.getElementById('holidayPromptModal').style.display === 'none', `${testPhase}: Cancel click closes modal.`);
    assert(appState.adjacentWeekendPending === null, `${testPhase}: Cancel leaves adjacentWeekendPending as null.`);
    assert(submitRpcCalls === rpcCountPreCancel, `${testPhase}: Cancel produces zero submission RPC calls.`);

    // 7. No eligible choices automatically submits holiday via production submitSelection without opening modal
    appState.availableChoices.weekend = [{ Date: '2027-11-27', 'First Call Assignee': 'Bob' }]; // occupied
    appState.selections = ['Thanksgiving|Call 1'];
    appState.adjacentWeekendPending = null;
    mockDocument.getElementById('holidayPromptModal').style.display = 'none';

    lastSubmittedPayload = null;
    submitSelection(false);

    assert(mockDocument.getElementById('holidayPromptModal').style.display === 'none', `${testPhase}: No eligible choices does NOT open modal.`);
    assert(lastSubmittedPayload && lastSubmittedPayload.adjacentWeekend === undefined, `${testPhase}: No eligible choices submits holiday alone without adjacentWeekend.`);
  });

  console.log(`\nFrontend Harness Results: PASS=${passCount}, FAIL=${failCount}`);

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
} catch (err) {
  console.error("❌ Exception during frontend harness test run:", err);
  process.exit(1);
}
