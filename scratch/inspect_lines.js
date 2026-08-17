const fs = require('fs');
const path = require('path');
const routesPath = path.resolve(__dirname, '../../client/src/app/router/routes.tsx');
const content = fs.readFileSync(routesPath, 'utf8');

const lines = content.split('\n');
const adminLineIdx = lines.findIndex(l => l.includes('path: "/admin"'));
console.log('Lines around admin:');
for (let i = adminLineIdx; i < adminLineIdx + 30; i++) {
  console.log(i + ': ' + JSON.stringify(lines[i]));
}
