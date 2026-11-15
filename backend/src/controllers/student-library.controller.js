import {
  getStudentLibrary,
  moveLibraryBookmark,
  removeLibraryBookmark,
  removeLibraryBookmarkByResource,
  saveLibraryBookmark,
} from "../services/student-library.service.js";

export async function listStudentLibrary(request, response) {
  const section = request.query.section ?? "saved";
  const result = await getStudentLibrary(request.user._id, section);
  response.json({ status: "success", section, ...result });
}

export async function createStudentBookmark(request, response) {
  const bookmark = await saveLibraryBookmark({
    userId: request.user._id,
    resourceType: request.body.resourceType,
    resourceId: request.body.resourceId,
    folder: request.body.folder,
  });
  response.status(201).json({
    status: "success",
    message: "Resource saved to your free student library.",
    bookmark: {
      id: bookmark._id.toString(),
      resourceType: bookmark.resourceType,
      resourceId: bookmark.resource.toString(),
      folder: bookmark.folder,
    },
  });
}

export async function moveStudentBookmark(request, response) {
  const bookmark = await moveLibraryBookmark({
    userId: request.user._id,
    bookmarkId: request.params.bookmarkId,
    folder: request.body.folder,
  });
  response.json({
    status: "success",
    message: "Bookmark moved to the selected folder.",
    bookmark: { id: bookmark._id.toString(), folder: bookmark.folder },
  });
}

export async function deleteStudentBookmark(request, response) {
  await removeLibraryBookmark({
    userId: request.user._id,
    bookmarkId: request.params.bookmarkId,
  });
  response.json({ status: "success", message: "Bookmark removed from your library." });
}

export async function deleteStudentBookmarkByResource(request, response) {
  await removeLibraryBookmarkByResource({
    userId: request.user._id,
    resourceType: request.params.resourceType,
    resourceId: request.params.resourceId,
  });
  response.json({ status: "success", message: "Bookmark removed from your library." });
}
