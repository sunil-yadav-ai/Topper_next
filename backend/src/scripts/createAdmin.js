import { connectDatabase } from "../config/database.js";
import { env } from "../config/env.js";
import User from "../models/User.js";
import { validatePassword } from "../services/auth.service.js";
import { createUniqueUsername } from "../services/username.service.js";

const fullName = process.env.ADMIN_NAME?.trim();
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!fullName || !email || !password) {
  console.error("Set ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD in backend/.env.");
  process.exitCode = 1;
} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !validatePassword(password)) {
  console.error("Provide a valid ADMIN_EMAIL and an ADMIN_PASSWORD of 8–72 UTF-8 bytes.");
  process.exitCode = 1;
} else {
  try {
    await connectDatabase();

    if (await User.exists({ email })) {
      throw new Error("An account already exists for that email; no role was changed.");
    }

    await User.create({
      fullName,
      email,
      username: await createUniqueUsername(User, fullName),
      password,
      role: "admin",
      university: "Administration",
      department: "Administration",
      batch: "N/A",
      semester: 1,
      emailVerified: true,
    });

    console.log("Admin account created. Remove the ADMIN_* variables from backend/.env.");
  } catch (error) {
    console.error("Could not create admin account:", error.message);
    process.exitCode = 1;
  } finally {
    const mongoose = await import("mongoose");
    await mongoose.default.disconnect();
  }
}
