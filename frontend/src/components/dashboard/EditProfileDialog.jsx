import { useState } from "react";
import FormField from "../FormField.jsx";

const editableFields = [
  ["fullName", "Full name", "text"],
  ["university", "University", "text"],
  ["department", "Department", "text"],
  ["batch", "Batch", "text"],
  ["semester", "Semester", "number"],
  ["avatarUrl", "Profile picture URL", "url"],
];

export default function EditProfileDialog({ profile, onClose, onSave }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const updates = Object.fromEntries(formData);
    updates.semester = Number(updates.semester);
    setError("");
    setLoading(true);
    try {
      await onSave(updates);
      onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.message ?? requestError.message ?? "Could not update your profile.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-5"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="edit-profile-title"
        aria-modal="true"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-7"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-ink" id="edit-profile-title">Edit profile</h2>
            <p className="mt-1 text-sm text-slate-500">Update your academic information and profile picture.</p>
          </div>
          <button
            aria-label="Close dialog"
            className="rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          {error && <p className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700" role="alert">{error}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {editableFields.map(([name, label, type]) => (
              <FormField
                autoComplete={name === "fullName" ? "name" : undefined}
                key={name}
                label={label}
                maxLength={name === "avatarUrl" ? 2048 : undefined}
                min={type === "number" ? 1 : undefined}
                max={type === "number" ? 12 : undefined}
                name={name}
                required={name !== "avatarUrl"}
                type={type}
                defaultValue={profile[name] ?? ""}
              />
            ))}
          </div>
          <p className="text-xs leading-5 text-slate-500">
            Use a public HTTP or HTTPS image URL. Leave it empty to use your initials.
          </p>
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              disabled={loading}
              type="submit"
            >
              {loading ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
