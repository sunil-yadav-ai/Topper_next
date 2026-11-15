import { handleBackendRequest } from "../../../server/backend-handler.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = (request) => handleBackendRequest(request);

export {
  handler as GET,
  handler as HEAD,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
};
