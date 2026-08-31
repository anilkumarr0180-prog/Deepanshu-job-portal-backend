const fs = require("fs");
const path = require("path");

const clientDir = path.resolve(__dirname, "../../../client");

// 1. Fix CandidateJobDetailsPage.tsx
const candidateJobDetailsPath = path.join(
  clientDir,
  "src/features/candidate/pages/CandidateJobDetailsPage.tsx"
);
if (fs.existsSync(candidateJobDetailsPath)) {
  let content = fs.readFileSync(candidateJobDetailsPath, "utf8");

  // Ensure imports
  if (!content.includes('import { useQuickApplyJob }')) {
    content = content.replace(
      'import { useMyApplications } from "../hooks/useMyApplications";',
      'import { useMyApplications } from "../hooks/useMyApplications";\nimport { useQuickApplyJob } from "../hooks/useQuickApplyJob";\nimport { Zap } from "lucide-react";'
    );
  }

  // Ensure hook
  if (!content.includes('const quickApplyMutation = useQuickApplyJob();')) {
    content = content.replace(
      "const toggleSaveMutation = useToggleSaveJob();",
      "const toggleSaveMutation = useToggleSaveJob();\n  const quickApplyMutation = useQuickApplyJob();"
    );
  }

  // Replace button
  const oldBtnRegex = /<button\s+type="button"\s+onClick=\{\(\) => setIsApplyModalOpen\(true\)\}\s+className=\{`w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition \${[\s\S]*?<\/button>/;

  const newBtnSection = `<div className="space-y-2.5">
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
                    <span>{quickApplyMutation.isPending ? "Quick Applying..." : "⚡ 1-Click Quick Apply"}</span>
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

  if (oldBtnRegex.test(content)) {
    content = content.replace(oldBtnRegex, newBtnSection);
    fs.writeFileSync(candidateJobDetailsPath, content, "utf8");
    console.log("✔ CandidateJobDetailsPage.tsx fixed successfully!");
  } else {
    console.log("ℹ CandidateJobDetailsPage.tsx pattern not matched, verifying content");
  }
}

// 2. Fix ApplyJobModal.tsx
const applyJobModalPath = path.join(
  clientDir,
  "src/features/candidate/components/ApplyJobModal.tsx"
);
if (fs.existsSync(applyJobModalPath)) {
  let content = fs.readFileSync(applyJobModalPath, "utf8");

  // Ensure imports
  if (!content.includes('import { useQuickApplyJob }')) {
    content = content.replace(
      'import { useApplyJob } from "../hooks/useApplyJob";',
      'import { useApplyJob } from "../hooks/useApplyJob";\nimport { useQuickApplyJob } from "../hooks/useQuickApplyJob";\nimport { Zap } from "lucide-react";'
    );
  }

  // Ensure hook
  if (!content.includes('const quickApplyJob = useQuickApplyJob();')) {
    content = content.replace(
      "const applyJob = useApplyJob();",
      "const applyJob = useApplyJob();\n  const quickApplyJob = useQuickApplyJob();"
    );
  }

  // Insert Quick Apply banner before application profile details
  const targetMarker = '{/* Applicant Profile Details Section: Default Clean Summary vs Edit Mode */}';
  if (content.includes(targetMarker) && !content.includes('1-Click Quick Apply</h4>')) {
    const quickApplyBanner = `{/* Quick Apply 1-Click Top Action */}
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-blue-200 dark:border-blue-500/30 bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50/50 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-blue-950/20 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#3C65F5] text-white shadow-sm">
                  <Zap className="h-5 w-5 fill-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">1-Click Quick Apply</h4>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-600 bg-emerald-100 dark:bg-emerald-500/20 px-1.5 py-0.5 rounded">
                      Fast Track
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Submit instantly using your master profile credentials.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (job) {
                    quickApplyJob.mutate(
                      { jobId: job._id, coverLetter: coverLetter.trim() || undefined },
                      {
                        onSuccess: () => {
                          onClose();
                        },
                      }
                    );
                  }
                }}
                disabled={!profile?.resumeUrl || quickApplyJob.isPending}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#3C65F5] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-600 active:scale-95 transition disabled:opacity-50 cursor-pointer"
              >
                <Zap className="h-3.5 w-3.5 fill-white" />
                <span>{quickApplyJob.isPending ? "Applying..." : "Quick Apply Now"}</span>
              </button>
            </div>\n\n            ` + targetMarker;

    content = content.replace(targetMarker, quickApplyBanner);
    fs.writeFileSync(applyJobModalPath, content, "utf8");
    console.log("✔ ApplyJobModal.tsx fixed with 1-Click Quick Apply banner!");
  }
}

console.log("Frontend fixes applied!");
