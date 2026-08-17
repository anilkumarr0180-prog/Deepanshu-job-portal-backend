const fs = require('fs');
const path = require('path');
const routesPath = path.resolve(__dirname, '../../client/src/app/router/routes.tsx');
const content = fs.readFileSync(routesPath, 'utf8');
console.log('--- ADMIN SECTION IN ROUTES.TSX ---');
const idx = content.indexOf('path: "/admin"');
if (idx !== -1) {
  console.log(content.slice(idx, idx + 1000));
} else {
  console.log('admin route not found');
}
