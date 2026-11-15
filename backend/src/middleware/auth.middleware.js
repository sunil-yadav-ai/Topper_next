import User from "../models/User.js";
import {
  authCookieName,
  verifyAuthToken,
} from "../services/auth.service.js";

export async function requireAuth(request, _response, next) {
  try {
    request.user = await getAuthenticatedUser(request);
    next();
  } catch (error) {
    next(mapAuthError(error));
  }
}

async function getAuthenticatedUser(request) {
  const token = request.cookies?.[authCookieName];
  if (!token) {
    const error = new Error("Sign in to continue.");
    error.statusCode = 401;
    throw error;
  }

  const payload = verifyAuthToken(token);
  const user = await User.findById(payload.sub).select("+authVersion");
  if (!user || user.authVersion !== payload.ver) {
    const error = new Error("Your session is invalid. Please sign in again.");
    error.statusCode = 401;
    throw error;
  }
  if (user.isSuspended) {
    const error = new Error("This account is suspended. Contact an administrator.");
    error.statusCode = 403;
    throw error;
  }
  return user;
}

function mapAuthError(error) {
  if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
    error.statusCode = 401;
    error.message = "Your session is invalid or has expired. Please sign in again.";
  }
  return error;
}

export async function optionalAuth(request, _response, next) {
  const token = request.cookies?.[authCookieName];
  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyAuthToken(token);
    const user = await User.findById(payload.sub).select("+authVersion");
    if (
      user &&
      user.authVersion === payload.ver &&
      !user.isSuspended
    ) {
      request.user = user;
    }
    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      next();
      return;
    }
    next(error);
  }
}

export function requireRole(...roles) {
  return (request, _response, next) => {
    if (!request.user || !roles.includes(request.user.role)) {
      const error = new Error("You do not have permission to access this resource.");
      error.statusCode = 403;
      return next(error);
    }

    next();
  };
}
