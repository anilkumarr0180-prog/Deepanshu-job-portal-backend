import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import Company from "../models/company.model";
import RecruiterProfile from "../models/recruiter-profile.model";
import CompanyRecruiter from "../models/company-recruiter.model";
import Job from "../models/job.model";
import Skill from "../models/skill.model";
import Application from "../models/application.model";
import SavedJob from "../models/saved-job.model";
import CandidateProfile from "../models/candidate-profile.model";

export interface MigrationSummary {
  companyRecruitersCreated: number;
  jobsSkillIdsBackfilled: number;
  applicationsProfileIdBackfilled: number;
  savedJobsProfileIdBackfilled: number;
  errors: string[];
}

/**
 * Safe, Idempotent Phase 1 Migration and Data Normalization Backfill Script
 */
export const runPhase1Migration = async (): Promise<MigrationSummary> => {
  const summary: MigrationSummary = {
    companyRecruitersCreated: 0,
    jobsSkillIdsBackfilled: 0,
    applicationsProfileIdBackfilled: 0,
    savedJobsProfileIdBackfilled: 0,
    errors: [],
  };

  console.log("[Migration] Starting Phase 1 Relationship Normalization & Backfill...");

  // 0. Deduplicate legacy active primary recruiters before index sync
  try {
    const duplicatePrimaries = await CompanyRecruiter.aggregate([
      { $match: { isPrimary: true, isDeleted: false } },
      { $group: { _id: "$companyId", docs: { $push: "$_id" }, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
    ]);

    for (const dup of duplicatePrimaries) {
      const [, ...rest] = dup.docs;
      await CompanyRecruiter.updateMany(
        { _id: { $in: rest } },
        { $set: { isPrimary: false } }
      );
    }
    await CompanyRecruiter.syncIndexes();
  } catch (err: any) {
    summary.errors.push(`Deduplication/index sync error: ${err.message}`);
  }

  // 1. Backfill CompanyRecruiter records
  const companies = await Company.find({ isDeleted: { $ne: true } });
  for (const company of companies) {
    try {
      if (company.recruiterId) {
        let recruiterProfile = await RecruiterProfile.findOne({ userId: company.recruiterId });
        if (!recruiterProfile) {
          recruiterProfile = await RecruiterProfile.create({ userId: company.recruiterId, companyId: company._id });
        } else if (!recruiterProfile.companyId) {
          recruiterProfile.companyId = company._id;
          await recruiterProfile.save();
        }

        const existingCR = await CompanyRecruiter.findOne({
          companyId: company._id,
          recruiterProfileId: recruiterProfile._id,
        });

        if (!existingCR) {
          await CompanyRecruiter.create({
            companyId: company._id,
            recruiterProfileId: recruiterProfile._id,
            role: "owner",
            isPrimary: true,
            isDeleted: false,
          });
          summary.companyRecruitersCreated++;
        }
      }
    } catch (err: any) {
      summary.errors.push(`CompanyRecruiter backfill error for Company ${company._id}: ${err.message}`);
    }
  }

  // 2. Backfill Job.skillIds
  const jobsWithSkills = await Job.find({ skills: { $exists: true, $not: { $size: 0 } } });
  for (const job of jobsWithSkills) {
    try {
      if (!job.skillIds || job.skillIds.length === 0) {
        const skillIds: mongoose.Types.ObjectId[] = [];
        const uniqueSkills = Array.from(new Set((job.skills || []).map((s) => s.trim()).filter(Boolean)));

        for (const skillName of uniqueSkills) {
          const slug = skillName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "skill";
          let skillDoc = await Skill.findOne({ slug });
          if (!skillDoc) {
            try {
              skillDoc = await Skill.create({ name: skillName, slug, isVerified: true });
            } catch (err) {
              skillDoc = (await Skill.findOne({ slug })) || (await Skill.findOne({ name: skillName }));
            }
          }
          if (skillDoc) {
            skillIds.push(skillDoc._id as mongoose.Types.ObjectId);
          }
        }

        if (skillIds.length > 0) {
          job.skillIds = skillIds;
          await job.save();
          summary.jobsSkillIdsBackfilled++;
        }
      }
    } catch (err: any) {
      summary.errors.push(`Job skillIds backfill error for Job ${job._id}: ${err.message}`);
    }
  }

  // 3. Backfill Application.candidateProfileId
  const appsMissingProfile = await Application.find({
    $or: [{ candidateProfileId: { $exists: false } }, { candidateProfileId: null }],
  });
  for (const app of appsMissingProfile) {
    try {
      if (app.applicantId) {
        let profile = await CandidateProfile.findOne({ userId: app.applicantId });
        if (!profile) {
          profile = await CandidateProfile.create({ userId: app.applicantId });
        }
        app.candidateProfileId = profile._id as mongoose.Types.ObjectId;
        await app.save();
        summary.applicationsProfileIdBackfilled++;
      }
    } catch (err: any) {
      summary.errors.push(`Application candidateProfileId backfill error for App ${app._id}: ${err.message}`);
    }
  }

  // 4. Backfill SavedJob.candidateProfileId
  const savedJobsMissingProfile = await SavedJob.find({
    $or: [{ candidateProfileId: { $exists: false } }, { candidateProfileId: null }],
  });
  for (const savedJob of savedJobsMissingProfile) {
    try {
      if (savedJob.userId) {
        let profile = await CandidateProfile.findOne({ userId: savedJob.userId });
        if (!profile) {
          profile = await CandidateProfile.create({ userId: savedJob.userId });
        }
        savedJob.candidateProfileId = profile._id as mongoose.Types.ObjectId;
        await savedJob.save();
        summary.savedJobsProfileIdBackfilled++;
      }
    } catch (err: any) {
      summary.errors.push(`SavedJob candidateProfileId backfill error for SavedJob ${savedJob._id}: ${err.message}`);
    }
  }

  console.log("[Migration] Phase 1 Migration completed successfully.", summary);
  return summary;
};

if (require.main === module) {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/job-portal";
  mongoose
    .connect(mongoUri)
    .then(async () => {
      console.log("Connected to MongoDB for Phase 1 migration.");
      const summary = await runPhase1Migration();
      console.log("Migration summary:", JSON.stringify(summary, null, 2));
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration connection error:", err);
      process.exit(1);
    });
}
