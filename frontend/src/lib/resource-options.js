export const resourceOptionsUpdatedEvent = "resource-options-updated";

const resourceOptionsChannel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel("resource-options-updated")
    : null;

export function notifyResourceOptionsUpdated() {
  window.dispatchEvent(new Event(resourceOptionsUpdatedEvent));
  resourceOptionsChannel?.postMessage({ type: resourceOptionsUpdatedEvent });
}

export function subscribeResourceOptionsUpdated(callback) {
  const handleWindowEvent = () => callback();
  const handleChannelMessage = (event) => {
    if (event.data?.type === resourceOptionsUpdatedEvent) callback();
  };
  window.addEventListener(resourceOptionsUpdatedEvent, handleWindowEvent);
  resourceOptionsChannel?.addEventListener("message", handleChannelMessage);
  return () => {
    window.removeEventListener(resourceOptionsUpdatedEvent, handleWindowEvent);
    resourceOptionsChannel?.removeEventListener("message", handleChannelMessage);
  };
}
