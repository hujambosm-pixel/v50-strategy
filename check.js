const src = require('fs').readFileSync('pages/index.js','utf8');
if(src.includes('sb_publishable')) console.log('ISSUE: hardcoded KEY found');
else console.log('OK: no hardcoded KEY');
console.log('getSupaUrl refs:', (src.match(/getSupaUrl\(\)/g)||[]).length);
console.log('getSupaKey refs:', (src.match(/getSupaKey\(\)/g)||[]).length);
console.log('getSupaH refs:', (src.match(/getSupaH\(\)/g)||[]).length);
