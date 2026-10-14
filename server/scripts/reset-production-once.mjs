import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";

const RESET_ARM_VALUE = "WIPE_PRODUCTION_KEEP_ADMIN_ONLY_2026-10-14";
const RESET_MARKER_COLLECTION = "__production_reset_markers";
const RESET_MARKER_ID = "keep-admins-reset-v1";

async function main() {
  // This utility is inert unless the production owner explicitly arms it.
  if (String(process.env.RESET_PRODUCTION_DATABASE_ONCE || "") !== RESET_ARM_VALUE) {
    return;
  }
  if (String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production") {
    throw new Error("Refusing production database reset unless NODE_ENV=production.");
  }

  await connectDB();

  try {
    const db = mongoose.connection.db;
    if (!db) throw new Error("MongoDB database handle is unavailable.");

    const markers = db.collection(RESET_MARKER_COLLECTION);
    const existingMarker = await markers.findOne({ _id: RESET_MARKER_ID });
    if (existingMarker?.completedAt) {
      console.log("[PRODUCTION RESET] Already completed previously; no records changed.");
      return;
    }

    const userCollectionName = User.collection.name;
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const deletedByCollection = {};

    // Clear every application collection, including records from modules that
    // are not represented by currently imported Mongoose models. Keep MongoDB
    // system collections and the User collection so administrator accounts survive.
    for (const { name } of collections) {
      if (name.startsWith("system.") || name === RESET_MARKER_COLLECTION || name === userCollectionName) {
        continue;
      }
      const result = await db.collection(name).deleteMany({});
      deletedByCollection[name] = result.deletedCount || 0;
    }

    // Keep all ADMIN accounts; remove scheduler, faculty, viewer, and any
    // malformed/non-admin user records as explicitly requested.
    const userResult = await db.collection(userCollectionName).deleteMany({ role: { $ne: "ADMIN" } });
    deletedByCollection[userCollectionName + " (non-admin users)"] = userResult.deletedCount || 0;

    await markers.updateOne(
      { _id: RESET_MARKER_ID },
      {
        $set: {
          completedAt: new Date(),
          deletedByCollection,
          preservedUserRole: "ADMIN"
        }
      },
      { upsert: true }
    );

    console.log("[PRODUCTION RESET COMPLETE] " + JSON.stringify({
      database: db.databaseName,
      deletedByCollection,
      preservedAdminCount: await User.countDocuments({ role: "ADMIN" })
    }));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("[PRODUCTION RESET FAILED]", error?.message || error);
  process.exitCode = 1;
});
