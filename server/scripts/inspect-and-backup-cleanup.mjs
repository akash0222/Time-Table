/**
 * Safe pre-cleanup inventory and backup for Scheduly.
 *
 * This script NEVER deletes or updates records. It first requires the operator
 * to confirm the expected MongoDB database name, then writes a private backup
 * and prints collection counts plus non-sensitive academic reference summaries.
 *
 * Run from server/ after setting MONGO_URI and CLEANUP_EXPECTED_DB:
 *   node scripts/inspect-and-backup-cleanup.mjs
 */
import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";
import { EJSON } from "bson";

const uri = String(process.env.MONGO_URI || "").trim();
const expectedDb = String(process.env.CLEANUP_EXPECTED_DB || "").trim();

if (!uri) {
  console.error("Stopped: MONGO_URI is not configured.");
  process.exit(2);
}
if (!expectedDb) {
  console.error("Stopped: set CLEANUP_EXPECTED_DB to the exact intended MongoDB database name after confirming it in MongoDB Atlas.");
  process.exit(2);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
try {
  const db = mongoose.connection.db;
  const actualDb = db.databaseName;
  const host = (() => {
    try { return new URL(uri.replace(/^mongodb\+srv:/, "https:").replace(/^mongodb:/, "http:")).host; }
    catch { return "unparsed-host"; }
  })();

  if (actualDb !== expectedDb) {
    console.error(JSON.stringify({
      status: "STOPPED_DATABASE_MISMATCH",
      expectedDatabase: expectedDb,
      connectedDatabase: actualDb,
      host,
      message: "No backup or data mutation performed. Confirm the target database before retrying."
    }, null, 2));
    process.exitCode = 3;
  } else {
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    const snapshot = {};
    for (const { name } of collections) {
      if (name.startsWith("system.")) continue;
      snapshot[name] = await db.collection(name).find({}).toArray();
    }

    const backupDir = path.resolve(process.cwd(), "backups");
    await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = path.join(backupDir, `scheduly-pre-cleanup-${stamp}.ejson`);
    await fs.writeFile(backupPath, EJSON.stringify(snapshot, null, 2, { relaxed: false }), { mode: 0o600, flag: "wx" });

    const counts = {};
    for (const { name } of collections) {
      if (name.startsWith("system.")) continue;
      counts[name] = await db.collection(name).countDocuments({});
    }

    const samples = {};
    for (const collectionName of ["users", "academicsessions", "programs", "semesters", "sections", "faculty", "subjects", "rooms", "timeslots", "students", "timetables", "schedulersettings", "attendancesessions", "auditlogs", "notifications", "studentpromotions", "sessionplans", "sharelinks", "feeheads", "feeinvoices", "feepayments"]) {
      if (!counts[collectionName]) continue;
      const docs = await db.collection(collectionName).find({}).limit(50).toArray();
      samples[collectionName] = docs.map(doc => {
        const item = { id: String(doc._id) };
        for (const key of ["name", "username", "role", "code", "active", "key", "status", "academicSession", "programId", "program", "section", "faculty", "createdAt"]) {
          if (doc[key] !== undefined) {
            const value = doc[key];
            item[key] = value && typeof value === "object" && value._bsontype === "ObjectId" ? String(value) : value;
          }
        }
        if (Array.isArray(doc.entries)) item.entryCount = doc.entries.length;
        return item;
      });
    }

    console.log(JSON.stringify({
      status: "BACKUP_CREATED_NO_DATA_CHANGED",
      connectedDatabase: actualDb,
      host,
      backupPath,
      backupCollections: Object.keys(snapshot).length,
      counts,
      referenceSamples: samples,
      safetyNote: "No records were changed or deleted. Backup includes account and settings data; keep it private."
    }, null, 2));
  }
} finally {
  await mongoose.disconnect();
}
