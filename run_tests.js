const fs = require('fs');
const vm = require('vm');

const context = vm.createContext({
  console: console,
  Logger: { log: function() {} },
  SpreadsheetApp: {}, // mocked later
  withScriptLock: function(cb) { return cb(); },
  Utilities: {
    formatDate: function(date, tz, format) { return date.toISOString().split('T')[0]; }
  }
});

const files = [
  'Utils.gs',
  'Config.gs',
  'Queue.gs',
  'Notifications.gs',
  'Admin.gs',
  'Schema.gs',
  'NotificationLog.gs',
  'WebApp.gs',
  'Display.gs',
  'Tests.gs'
];

let code = '';
for (const file of files) {
  code += fs.readFileSync(file, 'utf8') + '\n\n';
}

code += `
  try {
    runRegressionTests();
    console.log("ALL TESTS PASSED");
  } catch (e) {
    console.error(e.stack);
  }
`;

vm.runInContext(code, context);
