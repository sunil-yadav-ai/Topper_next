import { env } from "../../backend/src/config/env.js";

export const siteOrigin = new URL(env.frontendUrl).origin;
