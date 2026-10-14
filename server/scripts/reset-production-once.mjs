import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";

const RESET_ARM_VALUE = "WIPE_PRODUCTION_KEEP_ADMIN_ONLY_2026-10-14";
const RESET_MARKER_COLLECTION = "__production_reset_markers";
const RESET_MARKER_ID = "keep-admins-reset-v1";

async function copyCollectionWithIndexes(sourceDb, backupDb, name) {
  const source = sourceDb.collection(name);
  await backupDb.createCollection(name);
  const destination = backupDb.collection(name);

  let batch = [];
  let copied = 0;
  const cursor = source.find({}).batchSize(250);
  for await (const document of cursor) {
    batch.push(document);
    if (batch.length >= 250) {
      const result = await destination.insertMany(batch, { ordered: true });
      copied += result.insertedCount;
      batch = [];
    }
  }
  if (batch.length) {
    const result = await destination.insertMany(batch, { ordered: true });
    copied += result.insertedCount;
  }

  const indexes = await source.listIndexes().toArray();
  const secondaryIndexes = indexes
    .filter(index => index.name !== "_id_")
    .map(index => {
      const options = { ...index };
      delete options.v;
      delete options.ns;
      delete options.background;
      return options;
    });
  if (secondaryIndexes.length) await destination.createIndexes(secondaryIndexes);

  const sourceCount = await source.countDocuments({});
  const backupCount = await destination.countDocuments({});
  if (sourceCount !== backupCount || copied !== sourceCount) {
    throw new Error(`Backup verification failed for ${name}: source=${sourceCount}, copied=${copied}, backup=${backupCount}.`);
  }
  return sourceCount;
}

async function main() {
  // Inert by default; only runs when the production owner arms this exact value.
  if (String(process.env.RESET_PRODUCTION_DATABASE_ONCE || "") !== RESET_ARM_VALUE) return;
  if (String(process.env.NODE_ENV || "").trim().toLowerCase() !== "production") {
    throw new Error("Refusing production database reset unless NODE_ENV=production.");
  }

  await connectDB();
  try {
    const db = mongoose.connection.db;
    const client = mongoose.connection.client;
    if (!db || !client) throw new Error("MongoDB database handle is unavailable.");

    const markers = db.collection(RESET_MARKER_COLLECTION);
    const existingMarker = await markers.findOne({ _id: RESET_MARKER_ID });
    if (existingMarker) {
      if (existingMarker.status === "COMPLETED") {
        console.log("[PRODUCTION RESET] Already completed previously; no records changed.");
        return;
      }
      throw new Error("A previous reset attempt has a non-completed marker. Refusing to repeat it automatically; inspect the backup and marker first.");
    }

    const collectionInfos = await db.listCollections({}, { nameOnly: false }).toArray();
    const appCollections = collectionInfos.filter(item =>
      !item.name.startsWith("system.") &&
      item.name !== RESET_MARKER_COLLECTION &&
      item.type === "collection"
    );
    const views = collectionInfos.filter(item => item.type === "view" && !item.name.startsWith("system."));
    if (views.length) {
      throw new Error("Reset stopped before modifying data because this database contains views: " + views.map(view => view.name).join(", "));
    }

    const userCollectionName = User.collection.name;
    if (!appCollections.some(item => item.name === userCollectionName)) {
      throw new Error("User collection was not found; refusing to reset an unexpected database.");
    }

    const stamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const backupDatabaseName = `${db.databaseName}_backup_reset_${stamp}`;
    const backupDb = client.db(backupDatabaseName);
    const preexistingBackupCollections = await backupDb.listCollections({}, { nameOnly: true }).toArray();
    if (preexistingBackupCollections.length) {
      throw new Error("Backup database already exists and is not empty; refusing to overwrite it.");
    }

    // The marker acts as a one-run lock: a restart will never repeat a partially run reset.
    await markers.insertOne({
      _id: RESET_MARKER_ID,
      status: "RUNNING",
      startedAt: new Date(),
      backupDatabaseName,
      preservedUserRole: "ADMIN"
    });

    const backupCounts = {};
    let totalBackedUp = 0;
    try {
      // Back up every application collection, including all accounts, then verify
      // every collection count before any production record is removed.
      for (const { name } of appCollections) {
        const count = await copyCollectionWithIndexes(db, backupDb, name);
        backupCounts[name] = count;
        totalBackedUp += count;
      }
    } catch (error) {
      await markers.updateOne(
        { _id: RESET_MARKER_ID },
        { $set: { status: "FAILED_BEFORE_DELETE", failure: String(error?.message || error), failedAt: new Date(), backupCounts } }
      );
      throw error;
    }

    const remainingCounts = {};
    const deletedByCollection = {};
    try {
      // Clear each application collection except users; retain all ADMIN users.
      for (const { name } of appCollections) {
        if (name === userCollectionName) continue;
        const result = await db.collection(name).deleteMany({});
        deletedByCollection[name] = result.deletedCount || 0;
        remainingCounts[name] = await db.collection(name).countDocuments({});
        if (remainingCounts[name] !== 0) {
          throw new Error(`Post-reset verification failed: ${name} still contains ${remainingCounts[name]} records.`);
        }
      }

      const userResult = await db.collection(userCollectionName).deleteMany({ role: { $ne: "ADMIN" } });
      deletedByCollection[userCollectionName + " (non-admin users)"] = userResult.deletedCount || 0;

      const nonAdminCount = await db.collection(userCollectionName).countDocuments({ role: { $ne: "ADMIN" } });
      const adminCount = await User.countDocuments({ role: "ADMIN" });
      if (nonAdminCount !== 0 || adminCount === 0) {
        throw new Error(`Post-reset user verification failed: nonAdmins=${nonAdminCount}, admins=${adminCount}.`);
      }

      await markers.updateOne(
        { _id: RESET_MARKER_ID },
        {
          $set: {
            status: "COMPLETED",
            completedAt: new Date(),
            backupDatabaseName,
            backupCounts,
            totalBackedUp,
            deletedByCollection,
            remainingCounts,
            preservedAdminCount: adminCount,
            preservedUserRole: "ADMIN"
          },
          $unset: { failure: "" }
        }
      );

      console.log("[PRODUCTION RESET COMPLETE] " + JSON.stringify({
        database: db.databaseName,
        backupDatabase: backupDatabaseName,
        backupCounts,
        totalBackedUp,
        deletedByCollection,
        remainingCounts,
        preservedAdminCount: adminCount
      }));
    } catch (error) {
      await markers.updateOne(
        { _id: RESET_MARKER_ID },
        { $set: { status: "FAILED_DURING_DELETE", failure: String(error?.message || error), failedAt: new Date(), backupDatabaseName, backupCounts, deletedByCollection, remainingCounts } }
      );
      throw error;
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error("[PRODUCTION RESET FAILED]", error?.message || error);
  process.exitCode = 1;
});
