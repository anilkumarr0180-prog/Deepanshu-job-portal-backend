const fs = require('fs');
const path = require('path');

const clientRoot = path.resolve(__dirname, '../../../client/src');
const dockPath = path.join(clientRoot, 'features/chat/components/FloatingMessagingDock.tsx');
let dock = fs.readFileSync(dockPath, 'utf8');

dock = dock.replace(
  'const key = "jobbox_deleted_convs";',
  'const key = "jobbox_deleted_convs_" + (currentUserId || "");'
);

fs.writeFileSync(dockPath, dock);
console.log('✅ Updated FloatingMessagingDock.tsx');
