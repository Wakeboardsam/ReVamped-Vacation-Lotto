const fs = require('fs');

const content = fs.readFileSync('JS.html', 'utf8');
const scriptCode = content.replace(/<script>/, '').replace(/<\/script>/, '');

try {
  new Function(scriptCode);
  console.log("No syntax errors.");
} catch (e) {
  console.log("Syntax error:", e);
}
