import { Router } from "../lib/router.js";
import {
  createStudentBookmark,
  deleteStudentBookmark,
  deleteStudentBookmarkByResource,
  listStudentLibrary,
  moveStudentBookmark,
} from "../controllers/student-library.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const studentLibraryRouter = Router();

studentLibraryRouter.use(requireAuth, requireRole("user"));
studentLibraryRouter.get("/", listStudentLibrary);
studentLibraryRouter.post("/bookmarks", createStudentBookmark);
studentLibraryRouter.patch("/bookmarks/:bookmarkId", moveStudentBookmark);
studentLibraryRouter.delete("/bookmarks/:bookmarkId", deleteStudentBookmark);
studentLibraryRouter.delete(
  "/bookmarks/:resourceType/:resourceId",
  deleteStudentBookmarkByResource,
);

export default studentLibraryRouter;
