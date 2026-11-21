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
const { hashEmailVerificationCode } = authService;

test("registers a pending student and emails a hashed, expiring verification code", async () => {
  const originalCreate = User.create;
  const originalExists = User.exists;
  let createdUser;
  const sentEmails = [];
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
          phoneNumber: "+91 98765-43210",
          password: "secure-password",
          university: "Example University",
          department: "Computer Science",
          batch: "2024",
          semester: 1,
          role: "admin",
        },
      },
      response,
      { sendEmail: async (message) => sentEmails.push(message) },
    );

    assert.equal(response.statusCode, 201);
    assert.equal(createdUser.email, "ada@example.com");
    assert.equal(createdUser.phoneNumber, "9876543210");
    assert.equal(createdUser.phoneVerified, false);
    assert.equal(createdUser.role, "user");
    assert.equal(createdUser.emailVerified, false);
    assert.equal(createdUser.emailVerificationRequired, true);
    assert.match(createdUser.emailVerificationTokenHash, /^[a-f0-9]{64}$/);
    assert.ok(createdUser.emailVerificationExpiresAt > new Date());
    assert.equal(createdUser.emailVerificationAttempts, 0);
    assert.equal(sentEmails.length, 1);
    const code = sentEmails[0].text.match(/code is (\d{6})/)[1];
    assert.equal(
      createdUser.emailVerificationTokenHash,
      hashEmailVerificationCode("ada@example.com", code),
    );
    assert.match(response.payload.message, /6-digit verification code/);
  } finally {
    User.create = originalCreate;
    User.exists = originalExists;
  }
});

test("rejects an invalid mobile number before creating a student", async () => {
  await assert.rejects(
    authController.registerStudent(
      {
        body: {
          fullName: "Ada Student",
          email: "ada@example.com",
          phoneNumber: "12345",
          password: "secure-password",
          university: "Example University",
          department: "Computer Science",
          batch: "2024",
          semester: 1,
        },
      },
      { status() { return this; }, json() {} },
    ),
    { statusCode: 400, message: /valid 10-digit Indian mobile number/ },
  );
});

test("rejects an existing mobile number", async () => {
  const originalExists = User.exists;
  User.exists = async (query) => query.phoneNumber ? { _id: "existing-phone" } : false;

  try {
    await assert.rejects(
      authController.registerStudent(
        {
          body: {
            fullName: "Ada Student",
            email: "ada@example.com",
            phoneNumber: "+91 9876543210",
            password: "secure-password",
            university: "Example University",
            department: "Computer Science",
            batch: "2024",
            semester: 1,
          },
        },
        { status() { return this; }, json() {} },
      ),
      { statusCode: 400, message: /mobile number/ },
    );
  } finally {
    User.exists = originalExists;
  }
});

test("re-registering a pending email refreshes the verification code instead of reporting a duplicate", async () => {
  const originals = {
    exists: User.exists,
    findOne: User.findOne,
    create: User.create,
  };
  const pendingUser = {
    _id: "pending-student",
    id: "pending-student",
    email: "ada@example.com",
    fullName: "Old Name",
    emailVerified: false,
    emailVerificationRequired: true,
    async save() {},
  };
  const sentEmails = [];

  User.exists = async (query) =>
    query.email === "ada@example.com" || query.phoneNumber === "9876543210";
  User.findOne = (query) => ({
    select: async () =>
      query.email
        ? pendingUser
        : {
            _id: "pending-student",
            id: "pending-student",
            email: "ada@example.com",
          },
  });
  User.create = async () => {
    throw new Error("Pending registration should update, not create.");
  };

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
          fullName: "Ada Updated",
          email: " ADA@EXAMPLE.COM ",
          phoneNumber: "+91 9876543210",
          password: "new-secure-password",
          university: "Updated University",
          department: "Computer Science",
          batch: "2025",
          semester: 2,
        },
      },
      response,
      { sendEmail: async (message) => sentEmails.push(message) },
    );

    assert.equal(response.statusCode, 201);
    assert.equal(pendingUser.fullName, "Ada Updated");
    assert.equal(pendingUser.phoneNumber, "9876543210");
    assert.equal(pendingUser.phoneVerified, false);
    assert.equal(pendingUser.password, "new-secure-password");
    assert.equal(pendingUser.emailVerified, false);
    assert.equal(pendingUser.emailVerificationRequired, true);
    assert.equal(sentEmails.length, 1);
    assert.match(response.payload.message, /fresh 6-digit verification code/);
  } finally {
    User.exists = originals.exists;
    User.findOne = originals.findOne;
    User.create = originals.create;
  }
});

test("verifies the email OTP and clears pending verification state", async () => {
  const originalFindOneAndUpdate = User.findOneAndUpdate;
  const originalFindById = User.findById;
  let filter;
  let update;
  User.findOneAndUpdate = async (query, changes) => {
    filter = query;
    update = changes;
    return {
      id: "student-otp",
      toSafeObject: () => ({
        id: "student-otp",
        username: "studentotp",
        role: "user",
        emailVerified: true,
      }),
    };
  };
  User.findById = (id) => ({
    select: async (fields) => {
      assert.equal(fields, "+authVersion");
      assert.equal(id, "student-otp");
      return {
        id,
        authVersion: 7,
        toSafeObject: () => ({
          id,
          username: "studentotp",
          role: "user",
          emailVerified: true,
        }),
      };
    },
  });
  const response = {
    clearedCookies: [],
    clearCookie(name, options) {
      this.clearedCookies.push({ name, options });
    },
    cookie(name, value, options) {
      this.cookieName = name;
      this.cookieValue = value;
      this.cookieOptions = options;
    },
    json(payload) { this.payload = payload; },
  };

  try {
    await authController.verifyEmail(
      { body: { email: " ADA@EXAMPLE.COM ", code: "004201" } },
      response,
    );
    assert.equal(filter.email, "ada@example.com");
    assert.equal(
      filter.emailVerificationTokenHash,
      hashEmailVerificationCode("ada@example.com", "004201"),
    );
    assert.equal(update.$set.emailVerified, true);
    assert.equal(update.$set.emailVerificationRequired, false);
    assert.ok("emailVerificationTokenHash" in update.$unset);
    assert.match(response.payload.message, /Email verified/);
    assert.equal(response.payload.user.username, "studentotp");
    assert.equal(response.cookieName, authService.authCookieName);
    assert.equal(authService.verifyAuthToken(response.cookieValue).ver, 7);
  } finally {
    User.findOneAndUpdate = originalFindOneAndUpdate;
    User.findById = originalFindById;
  }
});

test("counts incorrect OTP attempts and rejects invalid codes", async () => {
  const originals = {
    findOneAndUpdate: User.findOneAndUpdate,
    findOne: User.findOne,
    updateOne: User.updateOne,
  };
  const pendingUser = {
    _id: "pending-student",
    emailVerificationExpiresAt: new Date(Date.now() + 60_000),
    emailVerificationAttempts: 2,
  };
  let attemptUpdate;
  User.findOneAndUpdate = async () => null;
  User.findOne = () => ({
    select: async () => pendingUser,
  });
  User.updateOne = async (filter, update) => {
    attemptUpdate = { filter, update };
  };

  try {
    await assert.rejects(
      authController.verifyEmail(
        { body: { email: "ada@example.com", code: "000000" } },
        { json() {} },
      ),
      { statusCode: 400, message: /invalid or has expired/ },
    );
    assert.deepEqual(attemptUpdate.filter, {
      _id: "pending-student",
      emailVerified: false,
      emailVerificationAttempts: { $lt: 5 },
    });
    assert.deepEqual(attemptUpdate.update, { $inc: { emailVerificationAttempts: 1 } });
  } finally {
    User.findOneAndUpdate = originals.findOneAndUpdate;
    User.findOne = originals.findOne;
    User.updateOne = originals.updateOne;
  }
});

test("resends an email code and resets the verification attempt counter", async () => {
  const originalFindOne = User.findOne;
  const sentEmails = [];
  const user = {
    email: "ada@example.com",
    fullName: "Ada Student",
    emailVerified: false,
    emailVerificationTokenHash: "old-hash",
    emailVerificationExpiresAt: new Date(Date.now() - 1_000),
    emailVerificationAttempts: 4,
    async save() {},
  };
  User.findOne = () => ({
    select: async (fields) => {
      assert.match(fields, /\+emailVerificationAttempts/);
      return user;
    },
  });
  const response = { json(payload) { this.payload = payload; } };

  try {
    await authController.resendVerificationEmail(
      { body: { email: " ADA@EXAMPLE.COM " } },
      response,
      { sendEmail: async (message) => sentEmails.push(message) },
    );
    const code = sentEmails[0].text.match(/code is (\d{6})/)[1];
    assert.equal(user.emailVerificationAttempts, 0);
    assert.notEqual(
      user.emailVerificationTokenHash,
      "old-hash",
    );
    assert.equal(
      user.emailVerificationTokenHash,
      hashEmailVerificationCode(user.email, code),
    );
    assert.ok(user.emailVerificationExpiresAt > new Date());
    assert.match(response.payload.message, /verification code has been sent/);
  } finally {
    User.findOne = originalFindOne;
  }
});

test("the User schema only permits user/admin and defaults to user", async () => {
  const user = new User();
  assert.equal(user.role, "user");
  assert.deepEqual(User.schema.path("role").enumValues, ["user", "admin"]);
  assert.equal(user.phoneVerified, false);
  assert.equal(User.schema.path("phoneNumber").instance, "String");
  const phoneIndex = User.schema.indexes().find(
    ([fields]) => fields.phoneNumber === 1,
  );
  assert.ok(phoneIndex);
  assert.equal(phoneIndex[1].unique, true);
  assert.deepEqual(phoneIndex[1].partialFilterExpression, {
    phoneNumber: { $type: "string" },
  });
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
      assert.equal(fields, "+password +authVersion +emailVerificationRequired");
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

test("blocks sign-in for a registration awaiting email verification", async () => {
  const originalFindOne = User.findOne;
  User.findOne = () => ({
    select: async () => ({
      role: "user",
      emailVerified: false,
      emailVerificationRequired: true,
      isSuspended: false,
      comparePassword: async () => true,
    }),
  });
  try {
    await assert.rejects(
      authController.loginStudent({
        body: { email: "student@example.com", password: "secure-password" },
      }, {}),
      { statusCode: 401, message: /Verify your email/ },
    );
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
