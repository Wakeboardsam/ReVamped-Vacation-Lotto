const fs = require('fs');
const vm = require('vm');

const files = [
  'Utils.gs',
  'Schema.gs',
  'Config.gs',
  'Queue.gs',
  'Reconcile.gs',
  'Admin.gs',
  'WhatsAppConfig.gs',
  'WhatsAppService.gs',
  'WhatsAppBatch.gs',
  'WhatsAppAlerts.gs',
  'WhatsAppDiagnostics.gs',
  'Notifications.gs',
  'NotificationLog.gs',
  'NotificationTransport.gs',
  'WebApp.gs',
  'Display.gs',
  'Concurrency.gs',
  'Tests.gs'
];

let sandbox = {
  console: console,
  Logger: { log: console.log },
  SpreadsheetApp: {}, // Placeholder
  PropertiesService: {
    getScriptProperties: () => ({ getProperty: () => null })
  },
  LockService: {
    getScriptLock: () => ({
      hasLock: () => false,
      tryLock: () => true,
      releaseLock: () => {}
    })
  },
  Utilities: {
    formatDate: () => '2025-01-01',
    sleep: () => {}
  }
};

vm.createContext(sandbox);

files.forEach(file => {
  const code = fs.readFileSync(file, 'utf8');
  try {
    vm.runInContext(code, sandbox);
  } catch(e) {
    console.error(`Error loading ${file}:`, e);
    process.exit(1);
  }
});

try {
  sandbox.runRegressionTests();
  console.log("Regression tests passed!");
} catch (e) {
  console.error("Test failed:", e.message);
  process.exit(1);
}
