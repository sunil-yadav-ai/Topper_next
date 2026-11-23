"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthLayout from "../AuthLayout.jsx";
import FormField from "../FormField.jsx";
import SubmitButton from "../SubmitButton.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { api } from "../../lib/api.js";
import { getPostLoginPath } from "../../lib/navigation.js";
import { isValidIndianMobile } from "../../lib/mobile-number.js";

function FormAlert({ message, success = false }) {
  if (!message) return null;

  return (
    <p
      className={`ed-auth-alert rounded-xl px-3.5 py-3 text-sm ${
        success
          ? "ed-auth-alert-success bg-emerald-50 text-emerald-800"
          : "ed-auth-alert-error bg-rose-50 text-rose-700"
      }`}
      role="status"
    >
      {message}
    </p>
  );
}

function OtpCodeInput({ value, onChange, disabled = false }) {
  const inputRefs = useRef([]);

  function updateDigit(index, digit) {
    const nextDigits = [...value];
    nextDigits[index] = digit;
    onChange(nextDigits);
  }

  function handleChange(index, event) {
    const digits = event.target.value.replace(/\D/g, "");
    if (!digits) {
      updateDigit(index, "");
      return;
    }
    const pastedDigits = digits.slice(0, 6 - index);
    const nextDigits = [...value];
    pastedDigits.split("").forEach((digit, offset) => {
      nextDigits[index + offset] = digit;
    });
    onChange(nextDigits);
    const nextIndex = Math.min(index + pastedDigits.length, 5);
    inputRefs.current[nextIndex]?.focus();
  }

  function handleKeyDown(index, event) {
    if (event.key === "Backspace" && !value[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  return (
    <div className="ed-otp-grid" role="group" aria-label="6-digit verification code">
      {value.map((digit, index) => (
        <input
          key={index}
          ref={(element) => { inputRefs.current[index] = element; }}
          className="ed-otp-input"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          value={digit}
          disabled={disabled}
          aria-label={`Digit ${index + 1}`}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          onChange={(event) => handleChange(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
            if (pasted) {
              event.preventDefault();
              onChange(pasted.padEnd(6, "").split(""));
              inputRefs.current[Math.min(pasted.length, 5)]?.focus();
            }
          }}
        />
      ))}
    </div>
  );
}

function useFormRequest() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const submit = useCallback(async (action) => {
    setLoading(true);
    setMessage("");
    setSuccess(false);
    try {
      const result = await action();
      setMessage(result?.message ?? "");
      setSuccess(true);
      return result;
    } catch (error) {
      setMessage(
        error.response?.data?.message ??
          error.message ??
          "Something went wrong. Please try again.",
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, message, success, submit };
}

export function LoginPage({ admin = false }) {
  const { signIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const request = useFormRequest();
  async function handleSubmit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const user = await request.submit(() => signIn(values, admin));
    if (user) {
      const next = searchParams.get("next");
      router.replace(next && next.startsWith("/scholarships") ? next : getPostLoginPath(user));
    }
  }

  const title = admin ? "Admin sign in" : "Welcome back";

  return (
    <AuthLayout
      eyebrow={admin ? "Administration" : "Student account"}
      title={title}
      description={
        admin
          ? "Sign in with your provisioned administrator account."
          : "Sign in to continue to your learning community."
      }
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormAlert message={request.message} success={request.success} />
        <FormField
          label="Email or username"
          name="identifier"
          autoComplete="username"
          placeholder="you@college.edu or username"
          required
        />
        <FormField
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          required
        />
        {!admin && (
          <div className="text-right">
            <Link className="text-sm font-semibold text-brand hover:underline" href="/forgot-password">
              Forgot password?
            </Link>
          </div>
        )}
        <SubmitButton loading={request.loading}>Sign in</SubmitButton>
      </form>
      {!admin && (
        <p className="mt-5 text-center text-sm text-slate-600">
          New to Topper?{" "}
          <Link className="font-semibold text-brand hover:underline" href={`/register${searchParams.get("next") ? `?next=${encodeURIComponent(searchParams.get("next"))}` : ""}`}>
            Create an account
          </Link>
        </p>
      )}
      {admin && (
        <p className="mt-4 text-center text-sm text-slate-500">
          <Link className="hover:text-brand" href="/login">Student sign in</Link>
        </p>
      )}
    </AuthLayout>
  );
}

export function RegisterPage() {
  const request = useFormRequest();
  const verificationRequest = useFormRequest();
  const resendRequest = useFormRequest();
  const { establishSession } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [verificationEmail, setVerificationEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpDigits, setOtpDigits] = useState(Array(6).fill(""));
  const otpAutoSubmitting = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (!isValidIndianMobile(values.phoneNumber)) {
      await request.submit(async () => {
        throw new Error("Enter a valid 10-digit Indian mobile number or a number with +91.");
      });
      return;
    }
    const result = await request.submit(async () => {
      const { data } = await api.post("/auth/register", {
        ...values,
        semester: Number(values.semester),
      });
      return data;
    });
    if (result) setVerificationEmail(String(values.email).trim().toLowerCase());
  }

  const verifyOtpCode = useCallback(async (code) => {
    otpAutoSubmitting.current = true;
    const result = await verificationRequest.submit(async () => {
      const { data } = await api.post("/auth/verify-email", {
        email: verificationEmail,
        code,
      });
      return data;
    });
    if (!result) {
      otpAutoSubmitting.current = false;
      return;
    }
    otpAutoSubmitting.current = false;
    let authenticatedUser = result.user;
    try {
      const { data: session } = await api.get("/auth/me", { pageLoading: false });
      authenticatedUser = session.user;
    } catch {
      // The verification response still contains the authenticated user.
    }
    establishSession(authenticatedUser);
    setEmailVerified(true);
    const next = searchParams.get("next");
    router.replace(next && next.startsWith("/scholarships") ? next : getPostLoginPath(authenticatedUser));
  }, [establishSession, router, searchParams, verificationEmail, verificationRequest.submit]);

  useEffect(() => {
    const code = otpDigits.join("");
    if (
      code.length === 6 &&
      !verificationRequest.loading &&
      !otpAutoSubmitting.current
    ) {
      void verifyOtpCode(code);
    }
  }, [otpDigits, verificationRequest.loading, verifyOtpCode]);

  async function handleVerify(event) {
    event.preventDefault();
    await verifyOtpCode(otpDigits.join(""));
  }

  async function handleResend() {
    await resendRequest.submit(async () => {
      const { data } = await api.post("/auth/resend-verification", {
        email: verificationEmail,
      });
      return data;
    });
    setOtpDigits(Array(6).fill(""));
    otpAutoSubmitting.current = false;
  }

  return (
    <AuthLayout
      eyebrow="Join the community"
      title={emailVerified ? "Email verified" : verificationEmail ? "Verify your email" : "Create your student account"}
      description={
        emailVerified
          ? "Your student account is ready. Sign in to continue."
          : verificationEmail
            ? `Enter the 6-digit code sent to ${verificationEmail}.`
            : "Tell us a little about yourself to get started."
      }
    >
      {emailVerified ? (
        <div className="space-y-4">
          <FormAlert message={verificationRequest.message} success={verificationRequest.success} />
          <Link
            className="inline-flex w-full justify-center rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
            href="/login"
          >
            Continue to sign in
          </Link>
        </div>
      ) : verificationEmail ? (
        <div className="space-y-4">
          <FormAlert message={verificationRequest.message} success={verificationRequest.success} />
          <form className="space-y-4" onSubmit={handleVerify}>
            <span className="ed-otp-label">6-digit verification code</span>
            <OtpCodeInput
              value={otpDigits}
              onChange={setOtpDigits}
              disabled={verificationRequest.loading}
            />
            <SubmitButton
              loading={verificationRequest.loading}
              disabled={otpDigits.join("").length !== 6}
            >
              Verify email
            </SubmitButton>
          </form>
          <FormAlert message={resendRequest.message} success={resendRequest.success} />
          <button
            className="w-full text-center text-sm font-semibold text-brand hover:underline"
            disabled={resendRequest.loading}
            onClick={handleResend}
            type="button"
          >
            {resendRequest.loading ? "Sending code…" : "Send a new code"}
          </button>
          <button
            className="w-full text-center text-sm text-slate-600 hover:text-brand"
            onClick={() => {
              setVerificationEmail("");
              setOtpDigits(Array(6).fill(""));
              otpAutoSubmitting.current = false;
            }}
            type="button"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <FormAlert message={request.message} success={request.success} />
          <FormField label="Full name" name="fullName" autoComplete="name" placeholder="Your full name" minLength={2} maxLength={100} required />
          <FormField label="Email" name="email" type="email" autoComplete="email" placeholder="you@college.edu" required />
          <FormField
            label="Mobile number"
            name="phoneNumber"
            type="tel"
            autoComplete="tel"
            inputMode="numeric"
            placeholder="9876543210 or +91 9876543210"
            pattern="(?:[6-9][0-9]{9}|(?:\\+91)[ -]?[6-9][0-9]{9})"
            maxLength={16}
            required
          />
          <FormField label="Password" name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" minLength={8} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="University" name="university" required />
            <FormField label="Department" name="department" required />
            <FormField label="Batch" name="batch" placeholder="e.g. 2024–2028" required />
            <FormField label="Semester" name="semester" type="number" min={1} max={12} required />
          </div>
          <SubmitButton loading={request.loading}>Create account</SubmitButton>
        </form>
      )}
      <p className="mt-5 text-center text-sm text-slate-600">
        Already have an account?{" "}
        <Link className="font-semibold text-brand hover:underline" href="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const request = useFormRequest();

  async function handleSubmit(event) {
    event.preventDefault();
    const { email } = Object.fromEntries(new FormData(event.currentTarget));
    await request.submit(async () => {
      const { data } = await api.post(
        "/auth/forgot-password",
        { email },
        { timeout: 30_000 },
      );
      return data;
    });
  }

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Forgot your password?"
      description="Enter your account email and we’ll send password reset instructions."
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormAlert message={request.message} success={request.success} />
        <FormField label="Email" name="email" type="email" autoComplete="email" placeholder="you@college.edu" required />
        <SubmitButton loading={request.loading}>Send reset link</SubmitButton>
      </form>
      <p className="mt-5 text-center text-sm">
        <Link className="font-semibold text-brand hover:underline" href="/login">Back to sign in</Link>
      </p>
    </AuthLayout>
  );
}

export function ResetPasswordPage({ token = "" }) {
  const request = useFormRequest();

  async function handleSubmit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.password !== values.confirmPassword) {
      request.submit(async () => {
        throw new Error("Passwords do not match.");
      });
      return;
    }
    await request.submit(async () => {
      const { data } = await api.post("/auth/reset-password", {
        token,
        password: values.password,
      });
      return data;
    });
  }

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Choose a new password"
      description="Use at least 8 characters. Your link expires after one hour."
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormAlert message={request.message} success={request.success} />
        <FormField label="New password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        <FormField label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
        <SubmitButton loading={request.loading}>Reset password</SubmitButton>
      </form>
      {request.success && (
        <p className="mt-5 text-center text-sm">
          <Link className="font-semibold text-brand hover:underline" href="/login">Continue to sign in</Link>
        </p>
      )}
    </AuthLayout>
  );
}

export function VerifyEmailPage({ token = "" }) {
  const request = useFormRequest();
  const { establishSession } = useAuth();
  const router = useRouter();
  const verificationStarted = useRef(false);
  const handleVerify = useCallback(async () => {
    const result = await request.submit(async () => {
      const { data } = await api.post("/auth/verify-email", { token });
      return data;
    });
    if (result?.user) {
      let authenticatedUser = result.user;
      try {
        const { data: session } = await api.get("/auth/me", { pageLoading: false });
        authenticatedUser = session.user;
      } catch {
        // The verification response still contains the authenticated user.
      }
      establishSession(authenticatedUser);
      router.replace(getPostLoginPath(authenticatedUser));
    }
  }, [establishSession, request.submit, router, token]);

  useEffect(() => {
    if (!token || verificationStarted.current) return;
    verificationStarted.current = true;
    void handleVerify();
  }, [handleVerify, token]);

  return (
    <AuthLayout
      eyebrow="Email verification"
      title="Verify your email"
      description="Confirm your email address to activate your student account."
    >
      <div className="space-y-4">
        <FormAlert message={request.message} success={request.success} />
        {!request.success && (
          <>
            {!token && (
              <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">
                This verification link is missing its token.
              </p>
            )}
            <SubmitButton loading={request.loading} onClick={handleVerify} disabled={!token}>
              Verify email
            </SubmitButton>
            <p className="text-center text-sm">
              <Link className="font-semibold text-brand hover:underline" href="/resend-verification">
                Request a new verification code
              </Link>
            </p>
          </>
        )}
        {request.success && (
          <Link
            className="inline-flex w-full justify-center rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
            href="/login"
          >
            Continue to sign in
          </Link>
        )}
      </div>
    </AuthLayout>
  );
}

export function ResendVerificationPage() {
  const request = useFormRequest();
  const verificationRequest = useFormRequest();
  const { establishSession } = useAuth();
  const router = useRouter();
  const [emailToVerify, setEmailToVerify] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);
  const [otpDigits, setOtpDigits] = useState(Array(6).fill(""));
  const otpAutoSubmitting = useRef(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const { email } = Object.fromEntries(new FormData(event.currentTarget));
    const result = await request.submit(async () => {
      const { data } = await api.post("/auth/resend-verification", { email });
      return data;
    });
    if (result) setEmailToVerify(String(email).trim().toLowerCase());
  }

  const verifyOtpCode = useCallback(async (code) => {
    otpAutoSubmitting.current = true;
    const result = await verificationRequest.submit(async () => {
      const { data } = await api.post("/auth/verify-email", {
        email: emailToVerify,
        code,
      });
      return data;
    });
    if (!result) {
      otpAutoSubmitting.current = false;
      return;
    }
    otpAutoSubmitting.current = false;
    let authenticatedUser = result.user;
    try {
      const { data: session } = await api.get("/auth/me", { pageLoading: false });
      authenticatedUser = session.user;
    } catch {
      // The verification response still contains the authenticated user.
    }
    establishSession(authenticatedUser);
    setEmailVerified(true);
    router.replace(getPostLoginPath(authenticatedUser));
  }, [emailToVerify, establishSession, router, verificationRequest.submit]);

  useEffect(() => {
    const code = otpDigits.join("");
    if (code.length === 6 && !verificationRequest.loading && !otpAutoSubmitting.current) {
      void verifyOtpCode(code);
    }
  }, [otpDigits, verificationRequest.loading, verifyOtpCode]);

  async function handleVerify(event) {
    event.preventDefault();
    await verifyOtpCode(otpDigits.join(""));
  }

  async function handleResendCode() {
    await request.submit(async () => {
      const { data } = await api.post("/auth/resend-verification", {
        email: emailToVerify,
      });
      return data;
    });
    setOtpDigits(Array(6).fill(""));
    otpAutoSubmitting.current = false;
  }

  return (
    <AuthLayout
      eyebrow="Email verification"
      title={emailVerified ? "Email verified" : emailToVerify ? "Enter your verification code" : "Resend verification code"}
      description={
        emailVerified
          ? "Your email is verified. You can now sign in."
          : emailToVerify
            ? `Enter the 6-digit code sent to ${emailToVerify}.`
            : "Enter the address you registered with and we’ll send a fresh 6-digit code."
      }
    >
      {emailVerified ? (
        <div className="space-y-4">
          <FormAlert message={verificationRequest.message} success={verificationRequest.success} />
          <Link
            className="inline-flex w-full justify-center rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
            href="/login"
          >
            Continue to sign in
          </Link>
        </div>
      ) : emailToVerify ? (
        <div className="space-y-4">
          <FormAlert message={request.message} success={request.success} />
          <FormAlert message={verificationRequest.message} success={verificationRequest.success} />
          <form className="space-y-4" onSubmit={handleVerify}>
            <span className="ed-otp-label">6-digit verification code</span>
            <OtpCodeInput
              value={otpDigits}
              onChange={setOtpDigits}
              disabled={verificationRequest.loading}
            />
            <SubmitButton
              loading={verificationRequest.loading}
              disabled={otpDigits.join("").length !== 6}
            >
              Verify email
            </SubmitButton>
          </form>
          <button
            className="w-full text-center text-sm font-semibold text-brand hover:underline"
            disabled={request.loading}
            onClick={handleResendCode}
            type="button"
          >
            {request.loading ? "Sending code…" : "Send a new code"}
          </button>
          <button
            className="w-full text-center text-sm font-semibold text-brand hover:underline"
            disabled={request.loading}
            onClick={() => {
              setEmailToVerify("");
              setOtpDigits(Array(6).fill(""));
              otpAutoSubmitting.current = false;
            }}
            type="button"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={handleSubmit}>
          <FormAlert message={request.message} success={request.success} />
          <FormField label="Email" name="email" type="email" autoComplete="email" placeholder="you@college.edu" required />
          <SubmitButton loading={request.loading}>Send verification code</SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}
