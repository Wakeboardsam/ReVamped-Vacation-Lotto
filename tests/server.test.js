const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const vm = require('vm');

// --- Load server utilities ---
const utilsSource = fs.readFileSync('Utils.gs', 'utf8');

// We need a context to run Apps Script code locally
const serverContext = vm.createContext({
  console: console,
});
vm.runInContext(utilsSource, serverContext);
const makeClientSafe_ = serverContext.makeClientSafe_;

test('makeClientSafe_ handles Date objects', (t) => {
  const input = {
    myDate: new Date('2023-05-10T12:00:00Z'),
    nested: [
       { d: new Date('2024-01-01T00:00:00') }
    ]
  };

  const safe = makeClientSafe_(input);
  assert.strictEqual(typeof safe.myDate, 'string');
  assert.strictEqual(typeof safe.nested[0].d, 'string');
});

test('makeClientSafe_ handles undefined', (t) => {
  const input = {
    field: undefined,
    arr: [undefined, 1, 'str'],
  };

  const safe = makeClientSafe_(input);
  assert.strictEqual(safe.field, null);
  assert.strictEqual(safe.arr[0], null);
  assert.strictEqual(safe.arr[1], 1);
  assert.strictEqual(safe.arr[2], 'str');
});

test('makeClientSafe_ preserves null and primitives', (t) => {
  const input = {
    nullField: null,
    strField: 'hello',
    numField: 42,
    boolField: true
  };
  const safe = makeClientSafe_(input);

  assert.strictEqual(safe.nullField, null);
  assert.strictEqual(safe.strField, 'hello');
  assert.strictEqual(safe.numField, 42);
  assert.strictEqual(safe.boolField, true);
});

test('makeClientSafe_ converts full response structure without errors', (t) => {
  const response = {
    success: true,
    activeYear: "2025",
    phase: "VACATION",
    round: 1,
    direction: "ASCENDING",
    participant: { Name: "John", "Rules Acknowledged Year": 2024 },
    isActive: true,
    availableChoices: {
      vacation: [
        { "Week ID": 1, "Start Date (Monday)": new Date("2025-01-06"), Capacity: 4 }
      ]
    }
  };

  const safe = makeClientSafe_(response);
  assert.strictEqual(safe.success, true);
  assert.strictEqual(typeof safe.availableChoices.vacation[0]["Start Date (Monday)"], "string");
});
