import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";

process.env.JWT_SECRET = "a".repeat(64);
const [authController, User, authService] = await Promise.all([
  import("./auth.controller.js"),
  import("../models/User.js").then(({ default: model }) => model),
  import("../services/auth.service.js"),
]);
const { requireAuth } = await import("../middleware/auth.middleware.js");

test("registers a default user and ignores a submitted admin role", async () => {
  const originalCreate = User.create;
  const originalExists = User.exists;
  let createdUser;
  User.create = async (attributes) => {
    createdUser = attributes;
    return attributes;
  };
  User.exists = async () => false;

  const response = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
    },
  };

  try {
    await authController.registerStudent(
      {
        body: {
          fullName: "Ada Student",
          email: " ADA@EXAMPLE.COM ",
          password: "secure-password",
          college: "Example College",
          university: "Example University",
          department: "Computer Science",
          batch: "2024",
          semester: 1,
          role: "admin",
        },
      },
      response,
    );

    assert.equal(response.statusCode, 201);
    assert.equal(createdUser.email, "ada@example.com");
    assert.equal(createdUser.role, "user");
    assert.equal("emailVerificationTokenHash" in createdUser, false);
    assert.match(response.payload.message, /sign in now/);
  } finally {
    User.create = originalCreate;
    User.exists = originalExists;
  }
});

test("the User schema only permits user/admin and defaults to user", async () => {
  const user = new User();
  assert.equal(user.role, "user");
  assert.deepEqual(User.schema.path("role").enumValues, ["user", "admin"]);
});

test("logs in a student whose email has not been verified", async () => {
  const user = {
    id: "student-123",
    role: "user",
    authVersion: 0,
    emailVerified: false,
    isSuspended: false,
    comparePassword: async () => true,
    toSafeObject: () => ({
      id: "student-123",
      email: "student@example.com",
      role: "user",
    }),
  };
  const originalFindOne = User.findOne;
  User.findOne = (filter) => {
    assert.deepEqual(filter, { email: /^Student@Example\.com$/i });
    return { select: async () => user };
  };

  const response = {
    clearedCookies: [],
    cookieName: null,
    cookieValue: null,
    cookieOptions: null,
    clearCookie(name, options) {
      this.clearedCookies.push({ name, options });
    },
    cookie(name, value, options) {
      this.cookieName = name;
      this.cookieValue = value;
      this.cookieOptions = options;
    },
    json(payload) {
      this.payload = payload;
    },
  };

  try {
    await authController.loginStudent(
      { body: { email: " Student@Example.com ", password: "secure-password" } },
      response,
    );

    assert.equal(response.cookieName, authService.authCookieName);
    assert.equal(response.cookieOptions.path, "/api");
    assert.equal(
      response.clearedCookies[0].options.path,
      authService.legacyAuthCookiePath,
    );
    assert.ok(authService.verifyAuthToken(response.cookieValue));
    assert.equal(response.payload.user.email, "student@example.com");
    assert.equal(response.payload.user.role, "user");
  } finally {
    User.findOne = originalFindOne;
  }
});

test("logs in an existing user by case-insensitive username using bcrypt verification", async () => {
  const password = "secure-password";
  const passwordHash = await bcrypt.hash(password, 4);
  const user = {
    id: "student-456",
    role: "user",
    authVersion: 0,
    isSuspended: false,
    comparePassword: (submittedPassword) =>
      bcrypt.compare(submittedPassword, passwordHash),
    toSafeObject: () => ({
      id: "student-456",
      username: "student456",
      role: "user",
    }),
  };
  const originalFindOne = User.findOne;
  User.findOne = (filter) => {
    assert.deepEqual(filter, { username: /^STUDENT456$/i });
    return { select: async (fields) => {
      assert.equal(fields, "+password +authVersion");
      return user;
    } };
  };
  const response = {
    cookies: [],
    clearCookie() {},
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
    },
    json(payload) {
      this.payload = payload;
    },
  };

  try {
    await authController.loginStudent(
      { body: { identifier: "STUDENT456", password } },
      response,
    );
    assert.equal(response.payload.user.id, "student-456");
    assert.equal(response.cookies.length, 1);
    assert.ok(authService.verifyAuthToken(response.cookies[0].value));
  } finally {
    User.findOne = originalFindOne;
  }
});

test("supports repeated login, logout, and refreshed sessions without changing the stored password", async () => {
  const password = "secure-password";
  const storedPasswordHash = await bcrypt.hash(password, 4);
  const user = {
    id: "repeat-login-user",
    role: "user",
    authVersion: 3,
    isSuspended: false,
    password: storedPasswordHash,
    comparePassword(submittedPassword) {
      return bcrypt.compare(submittedPassword, this.password);
    },
    toSafeObject() {
      return { id: this.id, email: "student@example.com", role: this.role };
    },
  };
  const originalFindOne = User.findOne;
  const originalFindById = User.findById;
  User.findOne = () => ({ select: async () => user });
  User.findById = () => ({ select: async () => user });

  function createResponse() {
    return {
      cookies: [],
      clearedCookies: [],
      clearCookie(name, options) {
        this.clearedCookies.push({ name, options });
      },
      cookie(name, value, options) {
        this.cookies.push({ name, value, options });
      },
      json(payload) {
        this.payload = payload;
      },
    };
  }

  async function login() {
    const response = createResponse();
    await authController.loginStudent(
      { body: { email: "student@example.com", password } },
      response,
    );
    assert.equal(response.payload.status, "success");
    assert.equal(response.cookies.length, 1);
    assert.ok(authService.verifyAuthToken(response.cookies[0].value));
    assert.equal(user.password, storedPasswordHash);
    return response.cookies[0];
  }

  async function logout() {
    const response = createResponse();
    authController.logout({}, response);
    assert.equal(response.payload.status, "success");
    assert.ok(
      response.clearedCookies.some(
        ({ name, options }) =>
          name === authService.authCookieName &&
          options.path === authService.authCookiePath,
      ),
    );
  }

  try {
    const firstCookie = await login();

    const refreshRequest = {
      cookies: { [authService.authCookieName]: firstCookie.value },
    };
    await new Promise((resolve, reject) => {
      requireAuth(refreshRequest, {}, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    assert.equal(refreshRequest.user, user);
    const refreshResponse = createResponse();
    authController.getCurrentUser(refreshRequest, refreshResponse);
    assert.ok(authService.verifyAuthToken(refreshResponse.cookies[0].value));
    assert.equal(user.password, storedPasswordHash);

    await logout();
    await login();
    await logout();
    await login();
    assert.equal(user.password, storedPasswordHash);
    assert.equal(await bcrypt.compare(password, user.password), true);
  } finally {
    User.findOne = originalFindOne;
    User.findById = originalFindById;
  }
});

test("admin login only accepts a role stored as admin in MongoDB", async () => {
  const user = {
    id: "student-123",
    role: "user",
    authVersion: 0,
    isSuspended: false,
    comparePassword: async () => true,
    toSafeObject() {
      return { id: this.id, role: this.role };
    },
  };
  const originalFindOne = User.findOne;
  User.findOne = () => ({ select: async () => user });

  const response = {
    cookies: [],
    clearCookie() {},
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
    },
    json(payload) {
      this.payload = payload;
    },
  };

  try {
    await assert.rejects(
      authController.loginAdmin(
        { body: { email: "student@example.com", password: "secure-password" } },
        response,
      ),
      { statusCode: 401 },
    );
    assert.equal(response.cookies.length, 0);

    user.role = "admin";
    await authController.loginAdmin(
      { body: { email: "admin@example.com", password: "secure-password" } },
      response,
    );
    assert.equal(response.payload.user.role, "admin");
    assert.equal(response.cookies.length, 1);
  } finally {
    User.findOne = originalFindOne;
  }
});

test("refreshing the current user migrates the legacy auth cookie scope", async () => {
  const user = {
    id: "student-123",
    authVersion: 0,
    toSafeObject: () => ({ id: "student-123", role: "user" }),
  };
  const response = {
    clearedCookies: [],
    cookies: [],
    clearCookie(name, options) {
      this.clearedCookies.push({ name, options });
    },
    cookie(name, value, options) {
      this.cookies.push({ name, value, options });
    },
    json(payload) {
      this.payload = payload;
    },
  };

  authController.getCurrentUser({ user }, response);
  assert.equal(response.clearedCookies[0].options.path, "/api/auth");
  assert.equal(response.cookies[0].options.path, "/api");
  assert.equal(response.payload.user.role, "user");
});

test("forgot-password email lookup is case-insensitive", async () => {
  const originalFindOne = User.findOne;
  User.findOne = async (filter) => {
    assert.deepEqual(filter, { email: /^ada@example\.com$/i });
    return null;
  };
  const response = {
    json(payload) {
      this.payload = payload;
    },
  };

  try {
    await authController.forgotPassword(
      { body: { email: " ADA@Example.com " } },
      response,
    );
    assert.equal(response.payload.status, "success");
  } finally {
    User.findOne = originalFindOne;
  }
});
