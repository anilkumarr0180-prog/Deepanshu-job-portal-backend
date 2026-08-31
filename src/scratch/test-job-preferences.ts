import dotenv from "dotenv";
dotenv.config();

import mongoose, { Types } from "mongoose";
import User from "../models/user.model";
import CandidateProfile from "../models/candidate-profile.model";
import Skill from "../models/skill.model";
import { getProfile, updateProfile } from "../services/profile.service";
import { updateProfileSchema } from "../validations/profile.validations";
import { EMPLOYMENT_TYPE } from "../constants/employment-type";
import { EXPERIENCE_LEVEL } from "../constants/experience-level";

let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✔ PASS: ${message}`);
    passedAssertions++;
  } else {
    console.error(`✖ FAIL: ${message}`);
    failedAssertions++;
  }
}

async function runJobPreferencesTests() {
  console.log("=============================================================");
  console.log("   JOBBOX JOB PREFERENCES - PRODUCTION AUDIT & TEST SUITE   ");
  console.log("=============================================================\n");

  const mongoUri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/jobbox";
  await mongoose.connect(mongoUri);
  console.log("✔ Connected to MongoDB\n");

  const candidateAEmail = `audit-cand-a-${Date.now()}@example.com`;
  const candidateBEmail = `audit-cand-b-${Date.now()}@example.com`;

  let candidateAUser: any = null;
  let candidateBUser: any = null;

  try {
    // Setup test candidates
    candidateAUser = await User.create({
      name: "Candidate A",
      email: candidateAEmail,
      password: "HashedPassword123!",
      role: "candidate",
      isEmailVerified: true,
    });

    candidateBUser = await User.create({
      name: "Candidate B",
      email: candidateBEmail,
      password: "HashedPassword123!",
      role: "candidate",
      isEmailVerified: true,
    });

    console.log("--- TEST 1: Initial GET /api/profile returns empty/default jobPreferences ---");
    const initialProfileA: any = await getProfile(candidateAUser._id.toString());
    assert(initialProfileA.jobPreferences !== undefined, "GET profile returns jobPreferences object");
    assert(Array.isArray(initialProfileA.jobPreferences?.preferredRoles), "preferredRoles is array");
    assert(initialProfileA.jobPreferences?.workMode === null, "Default workMode is null (Any)");
    assert(initialProfileA.jobPreferences?.minSalary === null, "Default minSalary is null");

    console.log("\n--- TEST 2: Update Preferences (Change Work Mode to 'remote' + target roles & skills) ---");
    const payload1 = {
      jobPreferences: {
        preferredRoles: ["Senior Frontend Engineer", "Full Stack Developer"],
        preferredSkills: ["React", "TypeScript", "Node.js"],
        preferredLocations: ["Remote", "New York", "San Francisco"],
        workMode: "remote" as const,
        employmentType: EMPLOYMENT_TYPE.FULL_TIME,
        experienceLevel: EXPERIENCE_LEVEL.THREE_TO_FIVE_YEARS,
        minSalary: 120000,
        currency: "USD",
        salaryPeriod: "yearly" as const,
      },
    };

    // Validate with Zod schema
    const validated1 = updateProfileSchema.parse({ body: payload1 });
    const updatedProfileA: any = await updateProfile(candidateAUser._id.toString(), validated1.body as any);

    assert(updatedProfileA.jobPreferences?.workMode === "remote", "Profile response reflects workMode 'remote'");
    assert(updatedProfileA.jobPreferences?.preferredRoles.length === 2, "Preferred roles saved: 2 items");
    assert(updatedProfileA.jobPreferences?.preferredSkills.length === 3, "Preferred skills saved: 3 items");
    assert(updatedProfileA.jobPreferences?.minSalary === 120000, "minSalary returned as 120000");

    console.log("\n--- TEST 3: Verify MongoDB Document directly for Candidate A ---");
    const docA = await CandidateProfile.findOne({ userId: candidateAUser._id }).lean();
    assert(docA !== null, "CandidateProfile exists in MongoDB");
    assert(docA?.jobPreferences?.workMode === "remote", "MongoDB jobPreferences.workMode is 'remote'");
    assert(typeof docA?.jobPreferences?.minSalary === "number", "MongoDB minSalary is stored as number");
    assert(docA?.jobPreferences?.minSalary === 120000, "MongoDB minSalary value matches 120000");
    assert(docA?.jobPreferences?.salaryPeriod === "yearly", "MongoDB salaryPeriod is 'yearly'");
    assert(docA?.jobPreferences?.currency === "USD", "MongoDB currency is 'USD'");
    assert(docA?.jobPreferences?.employmentType === "Full Time", "MongoDB employmentType is 'Full Time'");
    assert(docA?.jobPreferences?.experienceLevel === "3-5 Years", "MongoDB experienceLevel is '3-5 Years'");

    console.log("\n--- TEST 4: Verify Skill Documents & preferredSkillIds relationship ---");
    assert(
      Array.isArray(docA?.jobPreferences?.preferredSkillIds) &&
        docA!.jobPreferences!.preferredSkillIds.length === 3,
      "MongoDB preferredSkillIds has 3 Skill ObjectIds"
    );
    for (const skillId of docA!.jobPreferences!.preferredSkillIds) {
      assert(Types.ObjectId.isValid(skillId), `Valid Skill ObjectId: ${skillId}`);
      const skillDoc = await Skill.findById(skillId);
      assert(skillDoc !== null, `Referenced Skill '${skillDoc?.name}' exists in Skill collection`);
    }

    console.log("\n--- TEST 5: Candidate Isolation (Candidate B cannot see Candidate A's prefs) ---");
    const profileB: any = await getProfile(candidateBUser._id.toString());
    assert(profileB.jobPreferences?.preferredRoles.length === 0, "Candidate B preferredRoles is empty");
    assert(profileB.jobPreferences?.workMode === null, "Candidate B workMode is null, not Candidate A's 'remote'");
    assert(profileB.jobPreferences?.minSalary === null, "Candidate B minSalary is null, not Candidate A's 120000");

    console.log("\n--- TEST 6: Update Preferences Again (remote -> hybrid) In-Place (No Duplicates) ---");
    const payload2 = {
      jobPreferences: {
        preferredRoles: ["Lead Engineer"],
        preferredSkills: ["Go", "React"],
        preferredLocations: ["Austin, TX"],
        workMode: "hybrid" as const,
        employmentType: EMPLOYMENT_TYPE.CONTRACT,
        experienceLevel: EXPERIENCE_LEVEL.FIVE_PLUS_YEARS,
        minSalary: 150000,
        currency: "USD",
        salaryPeriod: "yearly" as const,
      },
    };
    const validated2 = updateProfileSchema.parse({ body: payload2 });
    await updateProfile(candidateAUser._id.toString(), validated2.body as any);

    const docCountA = await CandidateProfile.countDocuments({ userId: candidateAUser._id });
    assert(docCountA === 1, "Exactly 1 CandidateProfile document exists for Candidate A (updated in place)");

    const updatedDocA = await CandidateProfile.findOne({ userId: candidateAUser._id }).lean();
    assert(updatedDocA?.jobPreferences?.workMode === "hybrid", "Updated MongoDB workMode is 'hybrid'");
    assert(updatedDocA?.jobPreferences?.employmentType === "Contract", "Updated MongoDB employmentType is 'Contract'");
    assert(updatedDocA?.jobPreferences?.experienceLevel === "5+ Years", "Updated MongoDB experienceLevel is '5+ Years'");
    assert(updatedDocA?.jobPreferences?.minSalary === 150000, "Updated MongoDB minSalary is 150000");

    console.log("\n--- TEST 7: Reset / Clear preferences to null (Any) ---");
    const payloadReset = {
      jobPreferences: {
        preferredRoles: [],
        preferredSkills: [],
        preferredLocations: [],
        workMode: null,
        employmentType: null,
        experienceLevel: null,
        minSalary: null,
        currency: "USD",
        salaryPeriod: "yearly" as const,
      },
    };
    const validatedReset = updateProfileSchema.parse({ body: payloadReset });
    await updateProfile(candidateAUser._id.toString(), validatedReset.body as any);

    const resetDocA = await CandidateProfile.findOne({ userId: candidateAUser._id }).lean();
    assert(resetDocA?.jobPreferences?.workMode === null, "Cleared workMode is null in MongoDB");
    assert(resetDocA?.jobPreferences?.employmentType === null, "Cleared employmentType is null in MongoDB");
    assert(resetDocA?.jobPreferences?.experienceLevel === null, "Cleared experienceLevel is null in MongoDB");
    assert(resetDocA?.jobPreferences?.minSalary === null, "Cleared minSalary is null in MongoDB");

    console.log("\n--- TEST 8: Validation Edge Cases (Negative salary, invalid enums, oversized strings) ---");
    
    // 8a. Negative salary
    try {
      updateProfileSchema.parse({
        body: { jobPreferences: { minSalary: -5000 } },
      });
      assert(false, "Negative salary should be rejected");
    } catch (e: any) {
      assert(true, "Negative salary correctly rejected by Zod schema (min: 0)");
    }

    // 8b. Invalid workMode
    try {
      updateProfileSchema.parse({
        body: { jobPreferences: { workMode: "invalid_mode" as any } },
      });
      assert(false, "Invalid workMode should be rejected");
    } catch (e: any) {
      assert(true, "Invalid workMode correctly rejected by Zod enum validation");
    }

    // 8c. Invalid employmentType
    try {
      updateProfileSchema.parse({
        body: { jobPreferences: { employmentType: "FreelancerXYZ" as any } },
      });
      assert(false, "Invalid employmentType should be rejected");
    } catch (e: any) {
      assert(true, "Invalid employmentType correctly rejected by Zod enum validation");
    }

    // 8d. Invalid experienceLevel
    try {
      updateProfileSchema.parse({
        body: { jobPreferences: { experienceLevel: "100 Years Experience" as any } },
      });
      assert(false, "Invalid experienceLevel should be rejected");
    } catch (e: any) {
      assert(true, "Invalid experienceLevel correctly rejected by Zod enum validation");
    }

    // 8e. Oversized role string (> 100 chars)
    try {
      updateProfileSchema.parse({
        body: { jobPreferences: { preferredRoles: ["a".repeat(105)] } },
      });
      assert(false, "Oversized role title (>100 chars) should be rejected");
    } catch (e: any) {
      assert(true, "Oversized role title (>100 chars) correctly rejected");
    }

    // 8f. Duplicate skills normalization
    const dupSkillsPayload = {
      jobPreferences: {
        preferredSkills: ["TypeScript", "typescript", "TypeScript ", "React"],
      },
    };
    const validatedDup = updateProfileSchema.parse({ body: dupSkillsPayload });
    const profileDup: any = await updateProfile(candidateAUser._id.toString(), validatedDup.body as any);
    assert(
      profileDup.jobPreferences?.preferredSkills.length === 2,
      "Duplicate skills normalized to unique list (TypeScript, React)"
    );

    console.log("\n--- TEST 9: Regression Test on Other Candidate Profile Fields ---");
    const generalProfilePayload = {
      name: "Candidate A Updated Name",
      phone: "+1 555 987 6543",
      headline: "Staff Software Architect",
      bio: "10+ years building high scale distributed cloud applications.",
      city: "San Francisco",
      state: "CA",
      country: "United States",
    };
    const validatedGeneral = updateProfileSchema.parse({ body: generalProfilePayload });
    const finalProfileA: any = await updateProfile(candidateAUser._id.toString(), validatedGeneral.body as any);

    assert(finalProfileA.name === "Candidate A Updated Name", "Candidate name updated");
    assert(finalProfileA.phone === "+1 555 987 6543", "Candidate phone updated");
    assert(finalProfileA.headline === "Staff Software Architect", "Candidate headline updated");
    assert(finalProfileA.bio === "10+ years building high scale distributed cloud applications.", "Candidate bio updated");
    assert(finalProfileA.city === "San Francisco", "Candidate city updated");
    assert(
      finalProfileA.jobPreferences?.preferredSkills.length === 2,
      "Candidate jobPreferences preserved when updating other profile fields"
    );

  } finally {
    console.log("\n🧹 Cleaning up test candidate profiles...");
    if (candidateAUser) {
      await CandidateProfile.deleteMany({ userId: candidateAUser._id });
      await User.findByIdAndDelete(candidateAUser._id);
    }
    if (candidateBUser) {
      await CandidateProfile.deleteMany({ userId: candidateBUser._id });
      await User.findByIdAndDelete(candidateBUser._id);
    }
    await mongoose.disconnect();
    console.log("✔ Disconnected from MongoDB. Clean up complete.\n");
  }

  console.log("=============================================================");
  console.log(` TEST SUMMARY: ${passedAssertions} PASSED, ${failedAssertions} FAILED`);
  console.log("=============================================================");

  if (failedAssertions > 0) {
    process.exit(1);
  }
}

runJobPreferencesTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
