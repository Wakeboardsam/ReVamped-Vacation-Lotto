const fs = require('fs');
const vm = require('vm');

const context = vm.createContext({
  console: console,
  Logger: { log: console.log },
  PropertiesService: {
    getScriptProperties: () => ({ getProperty: () => null, setProperty: () => null })
  },
  HtmlService: {
    createHtmlOutputFromFile: () => ({ getContent: () => '' })
  },
  SpreadsheetApp: {},
  LockService: {
    getScriptLock: () => ({ tryLock: () => true, releaseLock: () => true })
  },
  Utilities: {
    formatDate: (date, tz, format) => {
        const d = new Date(date);
        let y = d.getUTCFullYear();
        let m = String(d.getUTCMonth() + 1).padStart(2, '0');
        let dt = String(d.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${dt}`;
    },
    computeDigest: () => [1,2,3],
    DigestAlgorithm: { SHA_256: 1 }
  }
});

const files = [
  'Utils.gs',
  'Concurrency.gs',
  'Queue.gs',
  'Display.gs',
  'Reconcile.gs',
  'Config.gs',
  'Schema.gs',
  'Admin.gs',
  'WebApp.gs',
  'NotificationTransport.gs',
  'NotificationLog.gs',
  'WhatsAppConfig.gs',
  'WhatsAppService.gs',
  'WhatsAppTests.gs',
  'Tests.gs'
];

files.forEach(file => {
  if (fs.existsSync(file)) {
    const code = fs.readFileSync(file, 'utf8');
    vm.runInContext(code, context);
  }
});

try {
  vm.runInContext('runRegressionTests()', context);
} catch (e) {
  console.error(e);
}
