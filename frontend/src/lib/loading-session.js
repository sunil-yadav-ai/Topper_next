const mainIntroCompletedKey = "topper-main-intro-completed";

export function resetMainIntroForDocument() {
  if (typeof window === "undefined" || window.__topperMainIntroBooted) return;
  window.__topperMainIntroBooted = true;
  try {
    window.sessionStorage.removeItem(mainIntroCompletedKey);
  } catch {
    // Keep the intro gated in memory if browser storage is unavailable.
  }
}

export function hasCompletedMainIntro() {
  try {
    return window.sessionStorage.getItem(mainIntroCompletedKey) === "true";
  } catch {
    return false;
  }
}

export function markMainIntroCompleted() {
  try {
    window.sessionStorage.setItem(mainIntroCompletedKey, "true");
  } catch {
    // The mounted application still prevents the intro from replaying.
  }
}
