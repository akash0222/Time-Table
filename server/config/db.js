import mongoose from "mongoose";
import { env } from "./env.js";

export async function connectDB() {
  const uri = String(env.mongoUri || process.env.MONGO_URI || "").trim();

  if (!uri) {
    throw new Error("MONGO_URI is required in the server environment.");
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  console.log("MongoDB Connected");
}
