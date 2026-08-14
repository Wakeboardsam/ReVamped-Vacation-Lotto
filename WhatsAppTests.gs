/**
 * WhatsAppTests.gs - Focused deterministic tests for WAHA transport
 */

function runWahaUnitTests() {
  var passed = 0;
  var failed = 0;

  function assert(condition, message) {
    if (condition) {
      passed++;
    } else {
      failed++;
      console.error("Test Failed: " + message);
    }
  }

  // 1. Phone Normalization
  try {
    var p1 = normalizeWhatsAppPhone_('(555) 123-4567');
    assert(p1.chatId === '15551234567@c.us', "Format standard US number");

    var p2 = normalizeWhatsAppPhone_('+1 555-123-4567');
    assert(p2.chatId === '15551234567@c.us', "Format already 1 prefix");

    var p3 = normalizeWhatsAppPhone_('15551234567');
    assert(p3.chatId === '15551234567@c.us', "Format raw 11 digits");

    var threw = false;
    try { normalizeWhatsAppPhone_('0000000000'); } catch (e) { threw = true; }
    assert(threw, "Reject all-zero values");

    threw = false;
    try { normalizeWhatsAppPhone_('123'); } catch (e) { threw = true; }
    assert(threw, "Reject too short");

    threw = false;
    try { normalizeWhatsAppPhone_(''); } catch (e) { threw = true; }
    assert(threw, "Reject blank input");

    threw = false;
    try { normalizeWhatsAppPhone_(null); } catch (e) { threw = true; }
    assert(threw, "Reject null input");

  } catch (e) {
    failed++;
    console.error("Test group failed (Phone Normalization): " + e);
  }

  // 2. Config validation (assuming we stub PropertiesService if needed, but here we can just assert it checks)
  // For safety and not exposing environment, we will mock PropertiesService for config tests
  var originalPropertiesService = typeof PropertiesService !== 'undefined' ? PropertiesService : null;
  try {
    var mockProps = {
      'WAHA_BASE_URL': 'https://mock.ngrok.io/',
      'WAHA_API_KEY': 'secret-key',
      'ADMIN_PHONE': '5551234567',
      'ADMIN_EMAIL': 'admin@example.com'
    };
    PropertiesService = {
      getScriptProperties: function() {
        return {
          getProperty: function(key) {
            return mockProps[key] || null;
          }
        };
      }
    };

    var config = getWhatsAppConfig_();
    assert(config.baseUrl === 'https://mock.ngrok.io', "Strips trailing slash");
    assert(config.session === 'default', "Uses default session");

    var headers = buildWahaHeaders_(config);
    assert(headers['X-Api-Key'] === 'secret-key', "Sets auth header");
    assert(headers['ngrok-skip-browser-warning'] === 'true', "Sets ngrok skip header");

    mockProps['WAHA_BASE_URL'] = 'http://insecure';
    var threwInsecure = false;
    try { getWhatsAppConfig_(); } catch(e) { threwInsecure = true; }
    assert(threwInsecure, "Rejects HTTP base URLs");

  } catch (e) {
    failed++;
    console.error("Test group failed (Config Validation): " + e);
  } finally {
    PropertiesService = originalPropertiesService; // Restore
  }

  // 3. Notification Transport Toggle
  var originalGetAdminOptions = typeof getAdminOptions !== 'undefined' ? getAdminOptions : null;
  try {
    getAdminOptions = function() {
      return { 'Enable SMS Notifications': false };
    };
    var notifRes = sendNotification_('5551234567', 'Test');
    assert(notifRes.failureType === 'DISABLED', "Returns DISABLED when notification setting is off");
    assert(notifRes.success === false, "Returns success false when disabled");

  } catch (e) {
    failed++;
    console.error("Test group failed (Transport Toggle): " + e);
  } finally {
    if (originalGetAdminOptions) { getAdminOptions = originalGetAdminOptions; }
  }

  // 4. Outage Email Cooldown Logic
  var originalCacheService = typeof CacheService !== 'undefined' ? CacheService : null;
  var originalMailApp = typeof MailApp !== 'undefined' ? MailApp : null;
  var originalLockService = typeof LockService !== 'undefined' ? LockService : null;
  try {
    var emailSent = 0;
    MailApp = {
      sendEmail: function(obj) { emailSent++; }
    };
    var mockCache = {};
    CacheService = {
      getScriptCache: function() {
        return {
          get: function(key) { return mockCache[key]; },
          put: function(key, val, sec) { mockCache[key] = val; }
        };
      }
    };
    LockService = {
      getScriptLock: function() {
        return {
          tryLock: function() { return true; },
          releaseLock: function() {}
        };
      }
    };
    var mockProps = {
      'WAHA_BASE_URL': 'https://mock.ngrok.io',
      'WAHA_API_KEY': 'secret',
      'ADMIN_PHONE': '5551234567',
      'ADMIN_EMAIL': 'admin@example.com'
    };
    PropertiesService = {
      getScriptProperties: function() {
        return { getProperty: function(key) { return mockProps[key] || null; } };
      }
    };

    handleSystemOutage('TEST_FAILURE', { statusCode: 500 });
    assert(emailSent === 1, "Sends initial outage email");
    assert(mockCache['waha_outage_TEST_FAILURE'] != null, "Sets cache on outage");

    handleSystemOutage('TEST_FAILURE', { statusCode: 500 });
    assert(emailSent === 1, "Does not send duplicate email within cooldown");

    handleSystemOutage('ANOTHER_FAILURE', { statusCode: 401 });
    assert(emailSent === 2, "Sends email for different failure type");

  } catch (e) {
    failed++;
    console.error("Test group failed (Outage Alert Cooldown): " + e);
  } finally {
    PropertiesService = originalPropertiesService;
    CacheService = originalCacheService;
    MailApp = originalMailApp;
    LockService = originalLockService;
  }

  // 5. Systemic Loop Abort & Deduplication State Ordering
  var originalSpreadsheetApp = typeof SpreadsheetApp !== 'undefined' ? SpreadsheetApp : null;
  var originalGetQueueState = typeof getQueueState !== 'undefined' ? getQueueState : null;
  var originalGetActiveParticipants = typeof getActiveParticipants !== 'undefined' ? getActiveParticipants : null;
  var originalUtilities = typeof Utilities !== 'undefined' ? Utilities : null;
  var flushCalled = 0;
  var sheetValuesSet = [];
  try {
    getAdminOptions = function() {
      return { 'Reminder Delay (mins)': 360, 'Admin Alert Delay (mins)': 720, 'Enable SMS Notifications': true };
    };
    getQueueState = function() {
      return { phase: 'VACATION_RANDOM' };
    };
    getActiveParticipants = function() {
      return [
        { _rowIndex: 2, 'Entry Timestamp': '', 'Reminder Sent': false, 'Admin Alert Sent': false, 'Phone Number': '5551111111', 'Name': 'Alice' },
        { _rowIndex: 3, 'Entry Timestamp': '', 'Reminder Sent': false, 'Admin Alert Sent': false, 'Phone Number': '5552222222', 'Name': 'Bob' }
      ];
    };
    var mockProps = {
      'WAHA_BASE_URL': 'https://mock.ngrok.io',
      'WAHA_API_KEY': 'secret',
      'ADMIN_PHONE': '5551234567',
      'ADMIN_EMAIL': 'admin@example.com'
    };
    PropertiesService = {
      getScriptProperties: function() {
        return { getProperty: function(key) { return mockProps[key] || null; } };
      }
    };
    SpreadsheetApp = {
      getActiveSpreadsheet: function() {
        return {
          getSheetByName: function(name) {
            return {
              getDataRange: function() {
                return {
                  getValues: function() {
                    return [['Entry Timestamp', 'Reminder Sent', 'Admin Alert Sent', 'Phone Number']];
                  }
                };
              },
              getRange: function(row, col) {
                return {
                  setValue: function(val) {
                    sheetValuesSet.push({row: row, col: col, val: val});
                  }
                };
              }
            };
          }
        };
      },
      flush: function() {
        flushCalled++;
      }
    };
    Utilities = {
      sleep: function(ms) {}
    };

    // Mock WAHA to always return systemic failure
    var wahaCalled = 0;
    var originalSendWhatsAppMessage = typeof sendWhatsAppMessage !== 'undefined' ? sendWhatsAppMessage : null;
    sendWhatsAppMessage = function(phone, text) {
      wahaCalled++;
      return { success: false, systemic: true, failureType: 'TUNNEL_OFFLINE' };
    };

    notifyActiveParticipants();

    assert(flushCalled === 1, "Flush is called to persist state before network request");
    assert(wahaCalled === 1, "Network loop aborted after first systemic failure");

    // Check that state was updated
    var hasUpdates = sheetValuesSet.filter(function(update) { return update.row === 2 && update.col === 1; }).length > 0;
    assert(hasUpdates, "Sheet flags are persisted before sending");

  } catch(e) {
    failed++;
    console.error("Test group failed (Systemic Loop Abort): " + e);
  } finally {
    if (originalGetAdminOptions) { getAdminOptions = originalGetAdminOptions; }
    if (originalGetQueueState) { getQueueState = originalGetQueueState; }
    if (originalGetActiveParticipants) { getActiveParticipants = originalGetActiveParticipants; }
    SpreadsheetApp = originalSpreadsheetApp;
    Utilities = originalUtilities;
    if (originalSendWhatsAppMessage) { sendWhatsAppMessage = originalSendWhatsAppMessage; }
  }

  console.log("WAHA Unit Tests completed. Passed: " + passed + " / Failed: " + failed);
}
