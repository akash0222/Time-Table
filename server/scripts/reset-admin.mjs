import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";

const newPassword = String(
  process.argv[2] || process.env.DEFAULT_ADMIN_PASSWORD || ""
).trim();

if (!newPassword || newPassword.length < 10 || newPassword === "admin123") {
  console.error(
    'Usage: npm run reset:admin -- "NewPasswordAtLeast10Chars"'
  );
  process.exit(1);
}

const mongoUri = String(
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/timetable_generator"
).trim();

try {
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 10000
  });

  const passwordHash = await bcrypt.hash(newPassword, 12);

  const user = await User.findOneAndUpdate(
    { username: "admin" },
    {
      $set: {
        passwordHash,
        active: true,
        role: "ADMIN",
        name: "System Administrator"
      }
    },
    {
      new: true,
      runValidators: true
    }
  );

  if (!user) {
    await User.create({
      name: "System Administrator",
      username: "admin",
      passwordHash,
      role: "ADMIN",
      active: true
    });
    console.log("Admin user created successfully.");
  } else {
    console.log("Admin password reset successfully.");
  }
} catch (error) {
  console.error("Admin password reset failed:", error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect().catch(() => {});
}
