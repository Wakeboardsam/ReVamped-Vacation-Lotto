const vm = require("vm");
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { JSDOM } = require('jsdom');

// We simulate a minimal DOM environment to run JS.html functions
const html = fs.readFileSync('JS.html', 'utf8');
// Strip <script> and </script> tags to eval JS
const jsContent = html.replace(/<script>/, '').replace(/<\/script>/, '');

test('onStateLoaded null handling does not throw', (t) => {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div id="mainScreen"></div>
    <div id="loginScreen"></div>
    <div id="loadingIndicator"></div>
    <div id="toastContainer"></div>
    <button id="loginBtn"></button>
    <button id="logoutBtn"></button>
    <button id="rulesBtn"></button>
    <button id="closeInfoBtn"></button>
    <select id="volunteerChoice"></select>
    <select id="transferPref"></select>
    <button id="saveRulesBtn"></button>
    <button id="submitSelectionBtn"></button>
    <button id="passBtn"></button>
    <button id="confirmHolidayBtn"></button>
    <button id="declineHolidayBtn"></button>
    <button id="cancelWeekendBtn"></button>
  </body></html>`, { url: "http://localhost/" });

  const window = dom.window;
  const document = window.document;

  // Provide mock globals
  window.localStorage = {
    removeItem: (key) => {}
  };

  // Fake the showToast and setLoginLoading functions if they are defined inside but use DOM we just made
  // We'll eval the script within this window context
  // document reference inside jsContent will crash if not properly set to global
  const vmContext = vm.createContext({
    window: window,
    document: document,
    localStorage: window.localStorage,
    showToast: () => {},
    setLoginLoading: () => {},
    google: { script: { run: { withSuccessHandler: () => ({ withFailureHandler: () => ({ getInitialState: () => {}, authenticateParticipant: () => {} }) }) } } }
  });

  vm.runInContext(jsContent, vmContext);

  // Test 1: state is null
  assert.doesNotThrow(() => {
    vmContext.onStateLoaded(null);
  });

  // Test 2: state is undefined
  assert.doesNotThrow(() => {
    vmContext.onStateLoaded(undefined);
  });

  // Test 3: state is a string
  assert.doesNotThrow(() => {
    vmContext.onStateLoaded("Not an object");
  });

  // Test 4: success is false
  assert.doesNotThrow(() => {
    vmContext.onStateLoaded({ success: false, error: "Oops" });
  });

  // Test 5: missing structure
  assert.doesNotThrow(() => {
    vmContext.onStateLoaded({ success: true, activeYear: 2025 }); // missing participant/choices
  });
});
