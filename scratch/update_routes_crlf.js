const fs = require('fs');
const path = require('path');
const routesPath = path.resolve(__dirname, '../../client/src/app/router/routes.tsx');
let content = fs.readFileSync(routesPath, 'utf8');

// Insert import if needed
if (!content.includes('AdminFinancePage')) {
  content = content.replace(
    /import AdminJobsPage from "@\/features\/admin\/pages\/AdminJobsPage";\r?\n/,
    'import AdminJobsPage from "@/features/admin/pages/AdminJobsPage";\r\nimport AdminFinancePage from "@/features/admin/pages/AdminFinancePage";\r\n'
  );
}

// Insert finance route into admin children
if (!content.includes('path: "finance"')) {
  content = content.replace(
    /\{\r?\n\s+path: "jobs",\r?\n\s+element: <AdminJobsPage \/>,\r?\n\s+\},/,
    `{
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
