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
try { runRegressionTests(); console.log("OK"); } catch(e) { console.log(e.stack); process.exit(1); }
