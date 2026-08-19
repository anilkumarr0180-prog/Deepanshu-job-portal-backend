const fs = require('fs');
const path = require('path');
const routesPath = path.resolve(__dirname, '../../client/src/app/router/routes.tsx');
let content = fs.readFileSync(routesPath, 'utf8');

// 1. Add import if not present
if (!content.includes('AdminFinancePage')) {
  content = content.replace(
    'import AdminJobsPage from "@/features/admin/pages/AdminJobsPage";',
    'import AdminJobsPage from "@/features/admin/pages/AdminJobsPage";\nimport AdminFinancePage from "@/features/admin/pages/AdminFinancePage";'
  );
}

// 2. Add route under /admin children
if (!content.includes('path: "finance"')) {
  content = content.replace(
    `      {
        path: "jobs",
        element: <AdminJobsPage />,
      },`,
    `      {
        path: "jobs",
        element: <AdminJobsPage />,
      },
      {
        path: "finance",
        element: <AdminFinancePage />,
      },`
  );
}

fs.writeFileSync(routesPath, content, 'utf8');
console.log('Successfully updated routes.tsx with AdminFinancePage!');
