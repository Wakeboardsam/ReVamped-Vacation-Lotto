const fs = require('fs');
const vm = require('vm');
const path = require('path');

// --- Helper for Mock DOM Nodes ---
function createMockElement(id, tag = 'div') {
  const children = [];
  const attributes = {};
  const classListMap = {};
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
    querySelectorAll: function() { return []; },
    querySelector: function() { return null; },
    addEventListener: function() {},
    removeEventListener: function() {}
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
  "rulesModal", "publicPhaseHeading", "publicQueueList", "activeNames", "upNextNames"
];

elementIds.forEach(id => {
  elementsMap[id] = createMockElement(id);
});

const mockDocument = {
  getElementById: function(id) {
    if (!elementsMap[id]) {
      elementsMap[id] = createMockElement(id);
    }
    return elementsMap[id];
  },
  querySelector: function() { return null; },
  querySelectorAll: function() { return []; },
  createElement: function(tag) { return createMockElement("dynamic", tag); },
  addEventListener: function() {}
};

const mockWindow = {
  document: mockDocument,
  addEventListener: function() {},
  location: { reload: function() {} }
};

let submitRpcCalls = 0;
const mockGoogle = {
  script: {
    run: {
      withSuccessHandler: function(cb) {
        return {
          withFailureHandler: function(failCb) {
            return {
              submitSelection: function(participant, payload) {
                submitRpcCalls++;
                if (cb) cb({ success: true });
              }
            };
          },
          submitSelection: function(participant, payload) {
            submitRpcCalls++;
            if (cb) cb({ success: true });
          }
        };
      },
      withFailureHandler: function(failCb) {
        return {
          withSuccessHandler: function(cb) {
            return {
              submitSelection: function(participant, payload) {
                submitRpcCalls++;
                if (cb) cb({ success: true });
              }
            };
          },
          submitSelection: function(participant, payload) {
            submitRpcCalls++;
          }
        };
      },
      submitSelection: function(participant, payload) {
        submitRpcCalls++;
      }
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
  setInterval: function() {},
  clearInterval: function() {},
  setTimeout: function() {},
  clearTimeout: function() {}
};

vm.createContext(browserSandbox);
vm.runInContext(jsCode, browserSandbox);

// Retrieve functions under test directly from browser sandbox
const {
  appState,
  onStateLoaded,
  renderPhaseView,
  updateActionBar,
  renderPublicPhaseHeading,
  renderPublicQueue,
  submitSelection
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
  // 1. Active-Phase Control Case
  appState.participantId = 'Alice';
  appState.name = 'Alice';
  appState.pin = '1234';

  const activeStatePayload = {
    success: true,
    participant: { Name: 'Alice', 'Rules Acknowledged Year': '2027' },
    isActive: true,
    phase: 'VACATION_RANDOM',
    round: 2,
    direction: 'ASCENDING',
    queue: { phase: 'VACATION_RANDOM', round: 2, direction: 'ASCENDING', lead: 1, activeNames: ['Alice'], upNextNames: ['Bob'] },
    availableChoices: { vacation: [{ weekId: 'W1', startDate: '2027-01-04', 'Capacity': '4', 'Assigned Participants': '' }], weekend: [], holiday: [], transferOffers: [] },
    readiness: null
  };

  onStateLoaded(activeStatePayload);

  assert(appState.isActive === true, "Control case: appState.isActive is true for active phase");
  const viewHtml = mockDocument.getElementById('viewContent').innerHTML || '';
  assert(!viewHtml.includes('Waiting for Administrator'), "Control case: waiting for administrator card not rendered during active phase");

  // 2. Test all four READY states
  readyStates.forEach(item => {
    console.log(`\n--- Testing State: ${item.phase} ---`);

    const readyPayload = {
      success: true,
      participant: { Name: 'Alice', 'Rules Acknowledged Year': '2027' },
      isActive: false,
      queue: { phase: item.phase, round: 1, direction: 'ASCENDING', lead: 1, activeNames: [], upNextNames: [] },
      availableChoices: { vacation: [], weekend: [], holiday: [], transferOffers: [] },
      readiness: { nextPhase: item.next, message: item.msg }
    };

    // Populate selections to test modal and selection clearing
    appState.selections = ['W1'];
    appState.adjacentHolidayPending = { holidayName: 'Thanksgiving', position: 'Call 1' };
    mockDocument.getElementById('rulesModal').style.display = 'block';

    submitRpcCalls = 0; // Reset RPC tracker

    onStateLoaded(readyPayload);

    // Assert friendly waiting message displayed
    renderPhaseView();
    const viewContent = mockDocument.getElementById('viewContent');
    assert(viewContent.innerHTML.includes('Waiting for Administrator') && viewContent.innerHTML.includes(item.msg), `${item.phase}: viewContent renders friendly waiting message card`);

    // Assert active-turn indicators and selection controls are suppressed/hidden
    assert(appState.isActive === false, `${item.phase}: appState.isActive is false`);
    assert(mockDocument.getElementById('statusBadge').innerText === 'WAITING FOR ADMIN', `${item.phase}: status badge displays 'WAITING FOR ADMIN'`);
    assert(mockDocument.getElementById('actionBar').style.display === 'none', `${item.phase}: selection action bar is hidden`);

    // Assert round/direction presentation hidden
    assert(mockDocument.getElementById('roundLabel').innerText === '', `${item.phase}: roundLabel is empty`);

    // Assert pending selections and modals cleared
    assert(appState.selections.length === 0, `${item.phase}: pending appState.selections cleared`);
    assert(appState.adjacentHolidayPending === null, `${item.phase}: pending adjacentHolidayPending cleared`);

    // Assert client submission produces zero RPC calls
    submitSelection();
    assert(submitRpcCalls === 0, `${item.phase}: client submission blocked, 0 RPC calls made`);

    // Public Heading and Public Queue test
    const publicSnapshot = {
      success: true,
      readiness: { nextPhase: item.next, message: item.msg },
      queue: { phase: item.phase, round: 1, direction: 'ASCENDING', lead: 1, activeNames: [], upNextNames: [] }
    };

    appState.participantId = null; // Test guest view
    renderPublicPhaseHeading(publicSnapshot);
    assert(mockDocument.getElementById('phaseLabel').innerText === 'WAITING FOR ADMIN', `${item.phase}: public heading displays 'WAITING FOR ADMIN'`);

    renderPublicQueue(publicSnapshot);
    const activeList = mockDocument.getElementById('publicActiveList');
    assert(activeList.innerText.includes(item.msg) || activeList.textContent.includes(item.msg), `${item.phase}: public queue active list shows waiting message`);
    appState.participantId = 'Alice'; // Restore logged-in state
  });

  // 3. Test Active -> READY -> Active Transition Restoration
  console.log("\n--- Testing Active -> READY -> Active Transition ---");

  // Reset readiness state to simulate active phase return
  activeStatePayload.readiness = null;
  onStateLoaded(activeStatePayload); // Return to active
  renderPhaseView();
  assert(appState.isActive === true, "Active restoration: appState.isActive restored to true");
  const restoredHtml = mockDocument.getElementById('viewContent').innerHTML || '';
  assert(!restoredHtml.includes('Waiting for Administrator'), "Active restoration: waiting card cleared when returning to active phase");

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
