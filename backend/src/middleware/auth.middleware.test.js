import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET = "a".repeat(64);
const [{ requireAuth, optionalAuth, requireRole }, User, authService] =
  await Promise.all([
    import("./auth.middleware.js"),
    import("../models/User.js").then(({ default: model }) => model),
    import("../services/auth.service.js"),
  ]);

test("permits only the roles explicitly authorized by a route", () => {
  let nextError;
  requireRole("user")(
    { user: { role: "user" } },
    {},
    (error) => {
      nextError = error;
    },
  );
  assert.equal(nextError, undefined);

  requireRole("admin")(
    { user: { role: "user" } },
    {},
    (error) => {
      nextError = error;
    },
  );
  assert.equal(nextError.statusCode, 403);

  requireRole("admin")({}, {}, (error) => {
    nextError = error;
  });
  assert.equal(nextError.statusCode, 403);
});

test("admin route middleware distinguishes unauthenticated and non-admin requests", async () => {
  let unauthenticatedError;
  await requireAuth({}, {}, (error) => {
    unauthenticatedError = error;
  });
  assert.equal(unauthenticatedError.statusCode, 401);

  const user = {
    id: "user-123",
    _id: "user-123",
    role: "user",
    authVersion: 0,
    isSuspended: false,
  };
  const originalFindById = User.findById;
  User.findById = () => ({ select: async () => user });

  try {
    const request = {
      cookies: {
        [authService.authCookieName]: authService.signAuthToken(user),
      },
    };
    let authError;
    await requireAuth(request, {}, (error) => {
      authError = error;
    });
    assert.equal(authError, undefined);

    let roleError;
    requireRole("admin")(request, {}, (error) => {
      roleError = error;
    });
    assert.equal(roleError.statusCode, 403);
  } finally {
    User.findById = originalFindById;
  }
});

test("allows a JWT-authenticated user to continue without email verification", async () => {
  const user = {
    id: "student-123",
    _id: "student-123",
    authVersion: 0,
    emailVerified: false,
    isSuspended: false,
  };
  const originalFindById = User.findById;
  User.findById = () => ({ select: async () => user });

  try {
    const token = authService.signAuthToken(user);
    const request = { cookies: { [authService.authCookieName]: token } };
    let nextError;

    await requireAuth(request, {}, (error) => {
      nextError = error;
    });

    assert.equal(nextError, undefined);
    assert.equal(request.user, user);
  } finally {
    User.findById = originalFindById;
  }
});

test("optional authentication recognizes users without verified email", async () => {
  const user = {
    id: "student-123",
    _id: "student-123",
    authVersion: 0,
    emailVerified: false,
    isSuspended: false,
  };
  const originalFindById = User.findById;
  User.findById = () => ({ select: async () => user });

  try {
    const token = authService.signAuthToken(user);
    const request = { cookies: { [authService.authCookieName]: token } };
    let nextError;

    await optionalAuth(request, {}, (error) => {
      nextError = error;
    });

    assert.equal(nextError, undefined);
    assert.equal(request.user, user);
  } finally {
    User.findById = originalFindById;
  }
});

test("authentication reloads the current database role instead of trusting a token role", async () => {
  const user = {
    id: "user-123",
    _id: "user-123",
    role: "user",
    authVersion: 0,
    isSuspended: false,
  };
  const originalFindById = User.findById;
  User.findById = () => ({ select: async () => user });
  const token = authService.signAuthToken(user);

  try {
    user.role = "admin";
    const promotedRequest = {
      cookies: { [authService.authCookieName]: token },
    };
    let promotedError;
    await requireAuth(promotedRequest, {}, (error) => {
      promotedError = error;
    });
    assert.equal(promotedError, undefined);
    assert.equal(promotedRequest.user.role, "admin");
    let adminRoleError;
    requireRole("admin")(promotedRequest, {}, (error) => {
      adminRoleError = error;
    });
    assert.equal(adminRoleError, undefined);

    user.role = "user";
    const demotedRequest = {
      cookies: { [authService.authCookieName]: token },
    };
    await requireAuth(demotedRequest, {}, () => {});
    let demotedError;
    requireRole("admin")(demotedRequest, {}, (error) => {
      demotedError = error;
    });
    assert.equal(demotedError.statusCode, 403);
  } finally {
    User.findById = originalFindById;
  }
});
