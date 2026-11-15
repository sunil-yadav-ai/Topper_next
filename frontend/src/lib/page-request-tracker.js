let pendingPageRequests = 0;
const pageRequestListeners = new Set();

function notifyPageRequestListeners() {
  pageRequestListeners.forEach((listener) => listener());
}

export function trackPageRequest(config) {
  if (
    config.method?.toLowerCase() !== "get" ||
    config.pageLoading === false
  ) {
    return;
  }
  config.pageLoadingTracked = true;
  pendingPageRequests += 1;
  notifyPageRequestListeners();
}

export function finishPageRequest(config) {
  if (!config?.pageLoadingTracked) return;
  config.pageLoadingTracked = false;
  pendingPageRequests = Math.max(0, pendingPageRequests - 1);
  notifyPageRequestListeners();
}

export function subscribeToPageRequests(listener) {
  pageRequestListeners.add(listener);
  return () => pageRequestListeners.delete(listener);
}

export function getPendingPageRequestCount() {
  return pendingPageRequests;
}
