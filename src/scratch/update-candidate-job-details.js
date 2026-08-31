const fs = require("fs");
const path = require("path");

const clientDir = path.resolve(__dirname, "../../../client");

// Update CandidateJobDetailsPage.tsx
const candidateJobDetailsPath = path.join(
  clientDir,
  "src/features/candidate/pages/CandidateJobDetailsPage.tsx"
);
if (fs.existsSync(candidateJobDetailsPath)) {
  let content = fs.readFileSync(candidateJobDetailsPath, "utf8");
  if (!content.includes("useQuickApplyJob")) {
    content = content.replace(
      'import { useMyApplications } from "../hooks/useMyApplications";',
      'import { useMyApplications } from "../hooks/useMyApplications";\nimport { useQuickApplyJob } from "../hooks/useQuickApplyJob";\nimport { Zap } from "lucide-react";'
    );
    content = content.replace(
      "const toggleSaveMutation = useToggleSaveJob();",
      "const toggleSaveMutation = useToggleSaveJob();\n  const quickApplyMutation = useQuickApplyJob();"
    );

    const oldBtn = `<button
                type="button"
                onClick={() => setIsApplyModalOpen(true)}
                className={\`w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition \${
                  isAlreadyApplied
                    ? "bg-[#3C65F5] hover:bg-blue-600"
                    : "bg-[#3C65F5] hover:bg-blue-600"
                } shadow-sm\`}
              >
                {isAlreadyApplied ? "View Application Details" : "Apply for this position"}
              </button>`;

    const newBtn = `<div className="space-y-2.5">
                {!isAlreadyApplied && (
                  <button
                    type="button"
                    onClick={() => {
                      if (job) {
                        quickApplyMutation.mutate({ jobId: job._id });
                      }
                    }}
                    disabled={quickApplyMutation.isPending}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#3C65F5] to-indigo-600 py-3 text-sm font-bold text-white shadow-md shadow-blue-500/20 transition hover:from-blue-600 hover:to-indigo-700 active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <Zap className="h-4 w-4 fill-white" />
                    <span>{quickApplyMutation.isPending ? "Quick Applying..." : "⚡ Quick Apply (1-Click)"}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsApplyModalOpen(true)}
                  className={\`w-full rounded-xl border px-4 py-2.5 text-sm font-semibold transition \${
                    isAlreadyApplied
                      ? "bg-[#3C65F5] text-white hover:bg-blue-600 border-transparent"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                  } shadow-xs\`}
                >
                  {isAlreadyApplied ? "View Application Details" : "Custom Application & Review"}
                </button>
              </div>`;

    content = content.replace(oldBtn, newBtn);
    fs.writeFileSync(candidateJobDetailsPath, content, "utf8");
    console.log("✔ CandidateJobDetailsPage.tsx updated successfully with ⚡ Quick Apply button!");
  }
}

// Update ApplyJobModal.tsx with Quick Apply 1-click banner
const applyJobModalPath = path.join(
  clientDir,
  "src/features/candidate/components/ApplyJobModal.tsx"
);
if (fs.existsSync(applyJobModalPath)) {
  let content = fs.readFileSync(applyJobModalPath, "utf8");
  if (!content.includes("useQuickApplyJob")) {
    content = content.replace(
      'import { useApplyJob } from "../hooks/useApplyJob";',
      'import { useApplyJob } from "../hooks/useApplyJob";\nimport { useQuickApplyJob } from "../hooks/useQuickApplyJob";\nimport { Zap } from "lucide-react";'
    );
    content = content.replace(
      "const applyJob = useApplyJob();",
      "const applyJob = useApplyJob();\n  const quickApplyJob = useQuickApplyJob();"
    );

    // Add quick apply banner inside modal before details
    const targetBannerLocation = '{/* Application Isolated Edit Banner */}';
    const quickApplyBanner = `{/* Quick Apply 1-Click Top Action */}
            <div className="flex items-center justify-between rounded-xl border border-blue-200 dark:border-blue-500/30 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/30 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3C65F5] text-white shadow-sm">
                  <Zap className="h-5 w-5 fill-white" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">Instant Quick Apply</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Apply in 1 click using your master profile details.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (job) {
                    quickApplyJob.mutate(
                      { jobId: job._id, coverLetter: coverLetter.trim() || undefined },
                      { onSuccess: () => onClose() }
                    );
                  }
                }}
                disabled={!profile?.resumeUrl || quickApplyJob.isPending}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#3C65F5] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-600 transition disabled:opacity-50 cursor-pointer"
              >
                <Zap className="h-3.5 w-3.5 fill-white" />
                <span>{quickApplyJob.isPending ? "Applying..." : "⚡ Quick Apply Now"}</span>
              </button>
            </div>\n\n            {/* Application Isolated Edit Banner */}`;

    content = content.replace(targetBannerLocation, quickApplyBanner);
    fs.writeFileSync(applyJobModalPath, content, "utf8");
    console.log("✔ ApplyJobModal.tsx updated successfully with Quick Apply top banner!");
  }
}

console.log("All UI updates complete!");
