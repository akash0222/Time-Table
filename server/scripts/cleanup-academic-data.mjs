/**
 * Targeted Scheduly academic/timetable cleanup.
 *
 * SAFETY:
 * - Does NOT run automatically at server startup.
 * - Does NOT create a backup (as explicitly requested).
 * - Defaults to DRY RUN. No data changes unless CLEANUP_CONFIRM is set.
 * - Requires the target database name to be exactly "test".
 * - Preserves every document in users and schedulersettings.
 * - Preserves reset/seed marker collections so startup seeding is not intentionally reset.
 *
 * From server/:
 *   node scripts/cleanup-academic-data.mjs
 *   CLEANUP_CONFIRM=DELETE_SCHEDULY_ACADEMIC_DATA node scripts/cleanup-academic-data.mjs
 */
import "dotenv/config";
import mongoose from "mongoose";

const TARGET_DB = "test";
const CONFIRM = "DELETE_SCHEDULY_ACADEMIC_DATA";
const destructive = process.env.CLEANUP_CONFIRM === CONFIRM;

if (!process.env.MONGO_URI) {
  console.error("Refusing to run: MONGO_URI is missing.");
  process.exit(2);
}

const uri = process.env.MONGO_URI;
let parsed;
try {
  parsed = new URL(uri);
} catch {
  console.error("Refusing to run: MONGO_URI is not a valid URL.");
  process.exit(2);
}
const pathDb = decodeURIComponent(parsed.pathname.replace(/^\//, "").split("/")[0] || "");
if (pathDb !== TARGET_DB) {
  console.error(`Refusing to run: URI database is "${pathDb || "(not specified)"}"; expected "${TARGET_DB}".`);
  process.exit(2);
}

const deleteCollections = [
  "academicsessions",
  "programs",
  "semesters",
  "sections",
  "faculties",
  "subjects",
  "rooms",
  "timeslots",
  "students",
  "timetables",
  "attendancesessions",
  "notifications",
  "studentpromotions",
  "sessionplans",
  "sharelinks",
  "feeheads",
  "feeinvoices",
  "feepayments",
];

// auditlogs intentionally retained for traceability; users, schedulersettings,
// __production_reset_markers, and _appSeedOperations are also retained.
const preservedCollections = new Set([
  "users",
  "schedulersettings",
  "auditlogs",
  "__production_reset_markers",
  "_appSeedOperations",
  "system.profile",
]);

await mongoose.connect(uri);
try {
  const db = mongoose.connection.db;
  const actualDbName = db.databaseName;
  if (actualDbName !== TARGET_DB) {
    throw new Error(`Connected database "${actualDbName}" is not the expected "${TARGET_DB}".`);
  }

  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name)
  );
  const usersBefore = existing.has("users")
    ? await db.collection("users").countDocuments()
    : 0;
  const settingsBefore = existing.has("schedulersettings")
    ? await db.collection("schedulersettings").countDocuments()
    : 0;

  const report = [];
  for (const name of deleteCollections) {
    if (!existing.has(name)) {
      report.push({ collection: name, status: "not present", before: 0, deleted: 0 });
      continue;
    }
    const before = await db.collection(name).countDocuments();
    if (destructive) {
      const result = await db.collection(name).deleteMany({});
      report.push({ collection: name, status: "deleted", before, deleted: result.deletedCount });
    } else {
      report.push({ collection: name, status: "DRY RUN — no changes", before, deleted: 0 });
    }
  }

  if (destructive && existing.has("users")) {
    // Keep every account, but clear links to faculty/sections that have been removed.
    await db.collection("users").updateMany({}, {
      $set: { faculty: null, section: null }
    });
  }

  const usersAfter = existing.has("users")
    ? await db.collection("users").countDocuments()
    : 0;
  const settingsAfter = existing.has("schedulersettings")
    ? await db.collection("schedulersettings").countDocuments()
    : 0;

  console.log(JSON.stringify({
    ok: true,
    mode: destructive ? "DESTRUCTIVE CLEANUP" : "DRY RUN",
    database: actualDbName,
    backupCreated: false,
    preservedCollections: [...preservedCollections],
    userAccounts: { before: usersBefore, after: usersAfter, preserved: usersBefore === usersAfter },
    schedulerSettings: { before: settingsBefore, after: settingsAfter, preserved: settingsBefore === settingsAfter },
    collections: report,
    note: destructive
      ? "Cleanup completed. Verify the application before use. Demo-seed marker collections were retained."
      : `No data changed. Review this report; set CLEANUP_CONFIRM=${CONFIRM} only to execute.`
  }, null, 2));

  if (destructive && (usersBefore !== usersAfter || settingsBefore !== settingsAfter)) {
    throw new Error("Preservation count check failed.");
  }
} catch (error) {
  console.error("Cleanup failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
