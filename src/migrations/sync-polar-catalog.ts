import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import { ensureAllPolarPlans } from "../services/polar-catalog.service";
import { seedDefaultPlans } from "../services/subscription.service";

async function runPolarCatalogSync() {
  console.log("\n=======================================================================");
  console.log("Starting Polar Catalog Synchronization Script");
  console.log("=======================================================================\n");

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("❌ MONGODB_URI environment variable is missing.");
    process.exit(1);
  }

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB.");
  }

  // Ensure canonical plans exist in DB
  await seedDefaultPlans();

  const summary = await ensureAllPolarPlans();

  console.log("\nPolar Catalog Synchronization Report:");
  console.log("-----------------------------------------------------------------------");

  for (const item of summary.details) {
    if (item.status === "skipped_free") {
      console.log(`- ${item.code} → skipped (free/internal plan)`);
    } else if (item.error) {
      console.log(`❌ ${item.code} → FAILED: ${item.error}`);
    } else {
      console.log(`✓ ${item.code} → ${item.status} (Product: ${item.productId}, Price: ${item.priceId})`);
    }
  }

  console.log("\nSummary:");
  console.log(`  Created Products:  ${summary.createdProducts}`);
  console.log(`  Created Prices:    ${summary.createdPrices}`);
  console.log(`  Existing Mappings: ${summary.existingMappings}`);
  console.log(`  Skipped Free:      ${summary.skippedFree}`);
  console.log(`  Errors:            ${summary.errors}`);
  console.log("-----------------------------------------------------------------------\n");

  if (summary.errors > 0) {
    console.error("❌ Polar Catalog Synchronization finished with errors.");
    process.exit(1);
  } else {
    console.log("✓ Polar Catalog Synchronization completed successfully.");
    process.exit(0);
  }
}

if (require.main === module) {
  runPolarCatalogSync().catch((err) => {
    console.error("Fatal Synchronization Error:", err);
    process.exit(1);
  });
}

export { runPolarCatalogSync };
