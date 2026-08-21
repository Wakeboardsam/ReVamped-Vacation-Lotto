const fs = require('fs');
global.SpreadsheetApp = {};
global.withScriptLock = function(cb) { return cb(); };
global.Logger = { log: console.log };
global.HtmlService = { createTemplateFromFile: function() { return { evaluate: function() { return { setTitle: function() { return { addMetaTag: function() { return { setXFrameOptionsMode: function() { return {}; } } } } } } } } } };
global.Utilities = { formatDate: function(d, tz, f) { return d.toISOString().substring(0, 10); } };

const files = ['Schema.gs', 'Utils.gs', 'Config.gs', 'Queue.gs', 'WebApp.gs', 'Admin.gs', 'Display.gs', 'Tests.gs'];
for (const file of files) {
  eval(fs.readFileSync(file, 'utf8'));
}

runRegressionTests = runRegressionTests.toString().replace(
  'dupSubmit = true;\n    } catch(e) {',
  'dupSubmit = true;\n    } catch(e) { console.log("EXCEPTION MSG:", e.message);'
).replace(
  'assert(!dupSubmit, "Receiver cannot claim a second time in Round 1.");',
  'console.log("dupSubmit value:", dupSubmit); assert(!dupSubmit, "Receiver cannot claim a second time in Round 1.");'
).replace(
  'var dupSubmit = false;',
  'var dupSubmit = false; MockSpreadsheetApp._sheets[\'Config\'].getRange(3, 2).setValue(\'1\'); console.log("QueueState before dupSubmit:", getQueueState());'
);
eval("runRegressionTests = " + runRegressionTests);
try { runRegressionTests(); console.log("OK"); } catch(e) { }
