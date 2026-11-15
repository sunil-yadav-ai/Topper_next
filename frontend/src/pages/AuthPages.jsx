"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthLayout from "../components/AuthLayout.jsx";
import FormField from "../components/FormField.jsx";
import SubmitButton from "../components/SubmitButton.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { getPostLoginPath } from "../lib/navigation.js";

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
  const request = useFormRequest();
  async function handleSubmit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const user = await request.submit(() => signIn(values, admin));
    if (user) router.replace(getPostLoginPath(user));
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
          <Link className="font-semibold text-brand hover:underline" href="/register">
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

  async function handleSubmit(event) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    await request.submit(async () => {
      const { data } = await api.post("/auth/register", {
        ...values,
        semester: Number(values.semester),
      });
      return data;
    });
  }

  return (
    <AuthLayout
      eyebrow="Join the community"
      title="Create your student account"
      description="Tell us a little about yourself to get started."
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormAlert message={request.message} success={request.success} />
        <FormField label="Full name" name="fullName" autoComplete="name" placeholder="Your full name" minLength={2} maxLength={100} required />
        <FormField label="Email" name="email" type="email" autoComplete="email" placeholder="you@college.edu" required />
        <FormField label="Password" name="password" type="password" autoComplete="new-password" placeholder="At least 8 characters" minLength={8} required />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="College" name="college" autoComplete="organization" required />
          <FormField label="University" name="university" required />
          <FormField label="Department" name="department" required />
          <FormField label="Batch" name="batch" placeholder="e.g. 2024–2028" required />
          <FormField label="Semester" name="semester" type="number" min={1} max={12} required />
        </div>
        <SubmitButton loading={request.loading}>Create account</SubmitButton>
      </form>
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
  const verificationStarted = useRef(false);
  const handleVerify = useCallback(async () => {
    await request.submit(async () => {
      const { data } = await api.post("/auth/verify-email", { token });
      return data;
    });
  }, [request.submit, token]);

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
                Request a new verification link
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

  async function handleSubmit(event) {
    event.preventDefault();
    const { email } = Object.fromEntries(new FormData(event.currentTarget));
    await request.submit(async () => {
      const { data } = await api.post("/auth/resend-verification", { email });
      return data;
    });
  }

  return (
    <AuthLayout
      eyebrow="Email verification"
      title="Resend verification email"
      description="Enter the address you registered with and we’ll send a fresh link."
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormAlert message={request.message} success={request.success} />
        <FormField label="Email" name="email" type="email" autoComplete="email" placeholder="you@college.edu" required />
        <SubmitButton loading={request.loading}>Resend verification</SubmitButton>
      </form>
    </AuthLayout>
  );
}
