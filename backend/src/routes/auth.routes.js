import { Router } from "../lib/router.js";
import rateLimit from "../middleware/rate-limit.js";
import {
  forgotPassword,
  getCurrentUser,
  loginAdmin,
  loginStudent,
  logout,
  registerStudent,
  resendVerificationEmail,
  resetPassword,
  verifyEmail,
} from "../controllers/auth.controller.js";
import {
  requireAuth,
  requireRole,
} from "../middleware/auth.middleware.js";

const authRouter = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many login attempts. Please try again later.",
  },
});
const authActionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many authentication requests. Please try again later.",
  },
});

authRouter.post("/register", authActionLimiter, registerStudent);
authRouter.post("/login", loginLimiter, loginStudent);
authRouter.post("/admin/login", loginLimiter, loginAdmin);
authRouter.get("/me", requireAuth, getCurrentUser);
authRouter.post("/logout", logout);
authRouter.post("/verify-email", authActionLimiter, verifyEmail);
authRouter.post("/resend-verification", authActionLimiter, resendVerificationEmail);
authRouter.post("/forgot-password", authActionLimiter, forgotPassword);
authRouter.post("/reset-password", authActionLimiter, resetPassword);
authRouter.get(
  "/admin",
  requireAuth,
  requireRole("admin"),
  (_request, response) => {
    response.json({ status: "success", message: "Admin access granted." });
  },
);

export default authRouter;
