"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, UsersRound } from "lucide-react";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";

function initials(name = "") {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function errorMessage(error) {
  return error.response?.data?.message ?? error.message ?? "Could not search profiles.";
}

export default function ProfilePeopleSearch({ onFollowChange }) {
  const { user, loading: authLoading } = useAuth();
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchAttempt, setSearchAttempt] = useState(0);
  const [followBusyId, setFollowBusyId] = useState("");
  const [followError, setFollowError] = useState("");

  useEffect(() => {
    let active = true;
    if (query.length < 2) {
      setUsers([]);
      setLoading(false);
      setError("");
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError("");
    api.get("/profiles/search", { params: { q: query } })
      .then(({ data }) => {
        if (active) setUsers(data.users);
      })
      .catch((requestError) => {
        if (active) {
          setUsers([]);
          setError(errorMessage(requestError));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [query, searchAttempt, user?.id]);

  function submitSearch(event) {
    event.preventDefault();
    setQuery(draft.trim().replace(/^@/, ""));
    setSearchAttempt((attempt) => attempt + 1);
  }

  async function toggleFollow(person) {
    if (followBusyId) return;
    const endpoint = `/profiles/${encodeURIComponent(person.username)}/follow`;
    setFollowBusyId(person.id);
    setFollowError("");
    try {
      const { data } = person.isFollowing
        ? await api.delete(endpoint)
        : await api.post(endpoint);
      setUsers((current) => current.map((item) =>
        item.id === person.id
          ? { ...item, isFollowing: data.isFollowing }
          : item,
      ));
      if (data.isFollowing !== person.isFollowing) {
        onFollowChange?.(data.isFollowing);
      }
    } catch (requestError) {
      setFollowError(errorMessage(requestError));
    } finally {
      setFollowBusyId("");
    }
  }

  return (
    <details className="ed-profile-people-search" open>
      <summary>
        <span className="ed-profile-people-summary-icon" aria-hidden="true"><UsersRound size={19} /></span>
        <span>
          <strong>Find students to follow</strong>
          <small>Search a name or username, then follow them here</small>
        </span>
        <span aria-hidden="true" className="ed-profile-people-summary-arrow">+</span>
      </summary>
      <div className="ed-profile-people-search-body">
        <p>Search the Topper community and open a student’s public profile.</p>
        <form className="ed-people-search" onSubmit={submitSearch} role="search">
          <label className="ed-people-search-input">
            <Search aria-hidden="true" size={20} />
            <input
              autoComplete="off"
              aria-label="Search students by name or username"
              maxLength={50}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Try a name or @username"
              type="search"
              value={draft}
            />
          </label>
          <button className="ed-people-search-button" type="submit">
            <Search aria-hidden="true" size={17} />
            Search
          </button>
        </form>
        <p className="ed-people-search-hint">Enter at least 2 characters to search.</p>

        {(loading || error || query.length >= 2) && (
          <section aria-label="People search results" className="ed-people-results">
            {loading ? (
              <p className="ed-people-message" role="status">Searching profiles…</p>
            ) : error ? (
              <p className="ed-people-message is-error" role="alert">{error}</p>
            ) : users.length ? (
              <>
                {followError && <p className="ed-people-message is-error" role="alert">{followError}</p>}
                <p className="ed-people-results-count">
                  {users.length} {users.length === 1 ? "profile" : "profiles"} found
                </p>
                <div className="ed-people-grid">
                  {users.map((person) => (
                    <article className="ed-people-card" key={person.id}>
                      <Link
                        className="ed-people-card-link"
                        href={`/profile/${encodeURIComponent(person.username || person.id)}`}
                      >
                        <span className="ed-people-avatar">
                          <span>{initials(person.fullName)}</span>
                          {person.avatarUrl && (
                            <img
                              alt=""
                              onError={(event) => { event.currentTarget.style.display = "none"; }}
                              src={person.avatarUrl}
                            />
                          )}
                        </span>
                        <span className="ed-people-identity">
                          <strong>{person.fullName}</strong>
                          <span>@{person.username}</span>
                        </span>
                        <span aria-hidden="true" className="ed-people-card-arrow">↗</span>
                      </Link>
                      {user?.role === "user" && person.id !== user.id && (
                        <button
                          aria-pressed={Boolean(person.isFollowing)}
                          className={`ed-people-follow-button${person.isFollowing ? " is-following" : ""}`}
                          disabled={Boolean(followBusyId)}
                          onClick={() => toggleFollow(person)}
                          type="button"
                        >
                          {followBusyId === person.id
                            ? "Please wait…"
                            : person.isFollowing
                              ? "Following"
                              : "Follow"}
                        </button>
                      )}
                      {!authLoading && !user && (
                        <Link className="ed-people-follow-button" href="/login">Sign in</Link>
                      )}
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <p className="ed-people-message">No profiles found for “{query}”. Try another name or username.</p>
            )}
          </section>
        )}
      </div>
    </details>
  );
}
