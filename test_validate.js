const fs = require('fs');
const files = fs.readdirSync('.').filter(fn => fn.endsWith('.gs'));
files.forEach(file => {
    try {
        const code = fs.readFileSync(file, 'utf8');
        // Simple eval to check syntax (this won't work perfectly for GS because of missing globals,
        // but syntax errors should still show up)
        new Function(code);
        console.log(`[OK] ${file}`);
    } catch (err) {
        console.log(`[ERROR] ${file}: ${err.message}`);
    }
});
