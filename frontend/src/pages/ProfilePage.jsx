"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { api } from "../lib/api.js";
import { usePageMotion } from "../lib/usePageMotion.js";
import { PageLoader } from "../components/PageState.jsx";
import ProfileImageCropDialog from "../components/ProfileImageCropDialog.jsx";
import StudentActivityHeatmap from "../components/StudentActivityHeatmap.jsx";

const tabs = [
  ["all", "All contributions"],
  ["note", "Notes"],
  ["pyq", "Previous year papers"],
];

function initials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function formatDate(value, options = { dateStyle: "medium" }) {
  return new Date(value).toLocaleDateString(undefined, options);
}

function errorMessage(error) {
  return error.response?.data?.message ?? error.message ?? "Something went wrong.";
}

export default function ProfilePage({ username = "" }) {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [cropSelection, setCropSelection] = useState(null);
  const [savingImage, setSavingImage] = useState("");
  const [imageMessage, setImageMessage] = useState(null);
  const [activity, setActivity] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState("");
  const [activityRetry, setActivityRetry] = useState(0);
  const avatarInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const rootRef = useRef(null);
  const isOwner = Boolean(user && data?.profile.id === user.id);
  const isActivityOwner = Boolean(
    isOwner && user?.role === "user" && data?.profile.role === "user",
  );
  const visibleContributions = useMemo(
    () => data?.contributions.filter((item) => activeTab === "all" || item.type === activeTab) ?? [],
    [activeTab, data],
  );
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setEditing(false);
    api.get(`/profiles/${encodeURIComponent(username)}`)
      .then(({ data: result }) => {
        if (active) setData(result);
      })
      .catch((requestError) => {
        if (active) {
          setData(null);
          setError(errorMessage(requestError));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [username]);

  useEffect(() => {
    if (!isActivityOwner || !data?.profile.username) {
      setActivity(null);
      setActivityError("");
      setActivityLoading(false);
      return undefined;
    }

    let active = true;
    setActivityLoading(true);
    setActivityError("");
    api.get(`/learning-activity/profiles/${encodeURIComponent(data.profile.username)}`)
      .then(({ data: result }) => {
        if (active) setActivity(result.activity);
      })
      .catch((requestError) => {
        if (active) setActivityError(errorMessage(requestError));
      })
      .finally(() => {
        if (active) setActivityLoading(false);
      });
    return () => {
      active = false;
    };
  }, [activityRetry, data?.profile.username, isActivityOwner]);

  usePageMotion(rootRef, {
    dependencies: [data?.profile.username, activeTab, visibleContributions.length],
  });

  async function saveProfile(event) {
    event.preventDefault();
    const formData = Object.fromEntries(new FormData(event.currentTarget).entries());
    setSaving(true);
    setSaveError("");
    try {
      const { data: result } = await api.patch("/profiles/me", formData);
      updateUser(result.profile);
      setData((current) => ({ ...current, profile: { ...current.profile, ...result.profile } }));
      setEditing(false);
      if (result.profile.username !== username) {
        router.replace(`/profile/${encodeURIComponent(result.profile.username)}`);
      }
    } catch (requestError) {
      setSaveError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  function chooseProfileImage(event, imageType) {
    const selected = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    setImageMessage(null);
    if (!selected) return;
    const extension = selected.name.split(".").pop()?.toLowerCase();
    const expectedMime = extension === "jpg" || extension === "jpeg"
      ? "image/jpeg"
      : `image/${extension}`;
    const maximumBytes = imageType === "avatar" ? 5 : 8;
    if (!["jpg", "jpeg", "png", "webp"].includes(extension) || selected.type !== expectedMime) {
      setImageMessage({ type: "error", text: "Choose a JPG, JPEG, PNG, or WebP image." });
      return;
    }
    if (!selected.size || selected.size > maximumBytes * 1024 * 1024) {
      setImageMessage({ type: "error", text: `Choose an image smaller than ${maximumBytes} MB.` });
      return;
    }
    setCropSelection({ file: selected, imageType });
  }

  async function saveCroppedImage(croppedFile) {
    const imageType = cropSelection?.imageType;
    if (!imageType) return;
    const formData = new FormData();
    formData.append(imageType === "avatar" ? "avatar" : "cover", croppedFile);
    setSavingImage(imageType);
    setImageMessage(null);
    try {
      const { data: result } = await api.patch("/profiles/me", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      });
      updateUser(result.profile);
      setData((current) => ({
        ...current,
        profile: { ...current.profile, ...result.profile },
      }));
      setCropSelection(null);
      setImageMessage({
        type: "success",
        text: imageType === "avatar"
          ? "Your profile picture has been updated."
          : "Your profile cover has been updated.",
      });
      setAvatarFile(null);
      setRemoveAvatar(false);
    } catch (requestError) {
      setImageMessage({ type: "error", text: errorMessage(requestError) });
      throw requestError;
    } finally {
      setSavingImage("");
    }
  }

  if (loading) return <PageLoader label="Loading profile…" />;
  if (error || !data) {
    return (
      <>
        <main className="ed-profile-error">
          <span aria-hidden="true" className="ed-profile-error-mark">?</span>
          <p className="ed-profile-kicker">A LITTLE DETOUR</p>
          <h1>Profile unavailable</h1>
          <p className="ed-profile-error-message" role="alert">{error || "Profile not found."}</p>
          <Link className="ed-profile-button ed-profile-button-dark" href="/search">
            Explore resources <span aria-hidden="true">↗</span>
          </Link>
        </main>
      </>
    );
  }

  const { profile, stats } = data;

  return (
    <>
    <main className="ed-profile-page">
      <div className="ed-profile-wrap" ref={rootRef}>
        <div className="ed-profile-intro" data-motion-intro>
          <p className="ed-profile-kicker"><span aria-hidden="true">✳</span> A PAGE FROM YOUR STUDY STORY</p>
          <span className="ed-profile-intro-note">LEARN IT · SHARE IT · PASS IT ON</span>
        </div>

        <section className="ed-profile-card" data-motion-intro>
          <div
            aria-label="Profile cover poster"
            className={`ed-profile-cover${profile.coverImage ? " has-custom-cover" : ""}`}
            role={profile.coverImage ? "img" : undefined}
            style={profile.coverImage ? { backgroundImage: `url("${profile.coverImage}")` } : undefined}
          >
            {!profile.coverImage && (
              <>
                <span aria-hidden="true" className="ed-profile-cover-orbit ed-profile-cover-orbit-one" />
                <span aria-hidden="true" className="ed-profile-cover-orbit ed-profile-cover-orbit-two" />
                <span aria-hidden="true" className="ed-profile-cover-star">✳</span>
                <span aria-hidden="true" className="ed-profile-cover-caption">GOOD NOTES.<br />GOOD PEOPLE.</span>
                <span aria-hidden="true" className="ed-profile-cover-label">THE STUDY COMMUNITY</span>
              </>
            )}
            {isOwner && (
              <>
                <input
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  aria-label="Choose profile cover image"
                  className="ed-profile-image-input"
                  onChange={(event) => chooseProfileImage(event, "cover")}
                  ref={coverInputRef}
                  type="file"
                />
                <button
                  aria-label="Edit profile cover"
                  className="ed-profile-image-edit ed-profile-cover-edit"
                  disabled={Boolean(savingImage)}
                  onClick={() => coverInputRef.current?.click()}
                  type="button"
                >
                  <Camera aria-hidden="true" size={17} />
                </button>
              </>
            )}
          </div>

          <div className="ed-profile-card-body">
            <div className="ed-profile-topline">
              <div aria-label={`${profile.fullName} profile picture`} className="ed-profile-avatar" data-motion-avatar>
                <span>{initials(profile.fullName)}</span>
                {profile.avatarUrl && (
                  <img
                    alt={`${profile.fullName}'s profile`}
                    onError={(event) => { event.currentTarget.style.display = "none"; }}
                    src={profile.avatarUrl}
                  />
                )}
                {isOwner && (
                  <>
                    <input
                      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      aria-label="Choose profile picture"
                      className="ed-profile-image-input"
                      onChange={(event) => chooseProfileImage(event, "avatar")}
                      ref={avatarInputRef}
                      type="file"
                    />
                    <button
                      aria-label="Edit profile picture"
                      className="ed-profile-image-edit ed-profile-avatar-edit"
                      disabled={Boolean(savingImage)}
                      onClick={() => avatarInputRef.current?.click()}
                      type="button"
                    >
                      <Camera aria-hidden="true" size={16} />
                    </button>
                  </>
                )}
              </div>
              <div className="ed-profile-actions">
                {profile.role === "admin" && (
                  <span className="ed-profile-admin"><span aria-hidden="true">✦</span> Community admin</span>
                )}
                {isOwner && (
                  <button
                    className="ed-profile-button ed-profile-button-dark"
                    onClick={() => { setEditing((current) => !current); setSaveError(""); }}
                    type="button"
                  >
                    {editing ? "Cancel edit" : "Edit profile"}
                    <span aria-hidden="true">{editing ? "×" : "↗"}</span>
                  </button>
                )}
              </div>
            </div>

            {imageMessage && (
              <p
                className={`ed-profile-image-message ${imageMessage.type === "error" ? "is-error" : "is-success"}`}
                role={imageMessage.type === "error" ? "alert" : "status"}
              >
                {imageMessage.text}
              </p>
            )}

            <div className="ed-profile-overview">
              <div className="ed-profile-identity">
                <p className="ed-profile-label">STUDENT CONTRIBUTOR</p>
                <h1>{profile.fullName}</h1>
                <p className="ed-profile-username">@{profile.username}</p>
                {profile.bio && <p className="ed-profile-bio">{profile.bio}</p>}
                <div className="ed-profile-meta">
                  {(profile.college || profile.university) && (
                    <span><i aria-hidden="true">⌂</i>{[profile.college, profile.university].filter(Boolean).join(" · ")}</span>
                  )}
                  {(profile.course || profile.department) && (
                    <span><i aria-hidden="true">▤</i>{[profile.course, profile.department].filter(Boolean).join(" · ")}</span>
                  )}
                  <span><i aria-hidden="true">✳</i>Joined {formatDate(profile.joinedAt, { month: "long", year: "numeric" })}</span>
                </div>
              </div>
              <div aria-label="Contribution statistics" className="ed-profile-stats">
                {[
                  ["Notes", stats.totalUploadedNotes, "ed-stat-orange"],
                  ["PYQ papers", stats.totalUploadedPyqs, "ed-stat-purple"],
                  ["Shared", stats.totalContributions, "ed-stat-lime"],
                ].map(([label, count, tone]) => (
                  <div className={`ed-profile-stat ${tone}`} data-motion-stagger key={label}>
                    <strong>{count}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {editing && isOwner && (
              <form className="ed-profile-form" onSubmit={saveProfile}>
                <div className="ed-profile-form-heading">
                  <div>
                    <p className="ed-profile-label">MAKE IT YOURS</p>
                    <h2>Edit your profile</h2>
                  </div>
                  <span aria-hidden="true" className="ed-profile-form-spark">✳</span>
                </div>
                <div className="ed-profile-form-grid">
                  <label>
                    Name
                    <input defaultValue={profile.fullName} maxLength={100} name="fullName" required />
                  </label>
                  <label>
                    Username
                    <input defaultValue={profile.username} maxLength={30} minLength={3} name="username" pattern="[A-Za-z0-9._]+" required />
                    <small>3–30 letters, numbers, dots, or underscores.</small>
                  </label>
                  <label className="ed-profile-form-wide">
                    Bio
                    <textarea defaultValue={profile.bio} maxLength={300} name="bio" rows={3} />
                  </label>
                  <label>
                    College
                    <input defaultValue={profile.college} maxLength={120} name="college" required />
                  </label>
                  <label>
                    Course
                    <input defaultValue={profile.course} maxLength={120} name="course" />
                  </label>
                </div>
                {saveError && <p className="ed-profile-form-error" role="alert">{saveError}</p>}
                <div className="ed-profile-form-actions">
                  <button className="ed-profile-button ed-profile-button-dark" disabled={saving} type="submit">
                    {saving ? "Saving…" : "Save profile"} <span aria-hidden="true">↗</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>

        <StudentActivityHeatmap
          activity={activity}
          error={activityError}
          loading={isActivityOwner && activityLoading}
          onRetry={() => setActivityRetry((current) => current + 1)}
          privateView={!isActivityOwner}
        />

        <section className="ed-profile-contributions" data-motion-scroll>
          <div className="ed-profile-section-heading">
            <div>
              <p className="ed-profile-kicker"><span aria-hidden="true">✳</span> PASSED ON WITH PURPOSE</p>
              <h2>Contributions</h2>
            </div>
            <span className="ed-profile-count">{stats.totalContributions} shared {stats.totalContributions === 1 ? "resource" : "resources"}</span>
          </div>

          <div aria-label="Profile contributions" className="ed-profile-tabs" role="tablist">
            {tabs.map(([value, label]) => (
              <button
                aria-selected={activeTab === value}
                className={activeTab === value ? "ed-profile-tab ed-profile-tab-active" : "ed-profile-tab"}
                key={value}
                onClick={() => setActiveTab(value)}
                role="tab"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          {visibleContributions.length ? (
            <div className="ed-profile-resource-grid">
              {visibleContributions.map((item) => (
                <article className="ed-profile-resource" data-motion-stagger key={`${item.type}-${item.id}`}>
                  <div className="ed-resource-top">
                    <span className={`ed-resource-type ${item.type === "note" ? "ed-resource-type-notes" : "ed-resource-type-pyq"}`}>
                      <span aria-hidden="true">{item.type === "note" ? "▤" : "◷"}</span>
                      {item.type === "note" ? "Student notes" : "Question paper"}
                    </span>
                    <span className="ed-resource-semester">SEM {item.semester}</span>
                  </div>
                  <h3>{item.title}</h3>
                  <p className="ed-resource-subject">{item.subject}</p>
                  <p className="ed-resource-date">SHARED {formatDate(item.createdAt, { day: "numeric", month: "short", year: "numeric" }).toUpperCase()}</p>
                  <Link
                    className="ed-profile-button ed-profile-button-resource"
                    href={`/resources/${item.type}/${item.id}`}
                  >
                    View Resource <span aria-hidden="true">↗</span>
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className="ed-profile-empty">
              <span aria-hidden="true" className="ed-profile-empty-art">✳</span>
              <p className="ed-profile-label">THE NEXT GOOD THING STARTS HERE</p>
              <h3>No contributions just yet</h3>
              <p>Notes and papers shared by this student will find a home here.</p>
            </div>
          )}
        </section>
      </div>
      {cropSelection && (
        <ProfileImageCropDialog
          file={cropSelection.file}
          imageType={cropSelection.imageType}
          onCancel={() => {
            if (!savingImage) setCropSelection(null);
          }}
          onSave={saveCroppedImage}
          saving={Boolean(savingImage)}
        />
      )}
    </main>
    </>
  );
}
