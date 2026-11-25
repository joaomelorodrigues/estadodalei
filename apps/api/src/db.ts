import mongoose from "mongoose";
import { config } from "./config.js";
import { logger } from "./logger.js";

const log = logger("db");

export async function connectDb() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(config.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  log.info(`ligado a ${config.MONGODB_URI.replace(/\/\/[^@]*@/, "//***@")}`);
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
