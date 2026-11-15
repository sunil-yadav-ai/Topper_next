import Note from "../models/Note.js";
import Pyq from "../models/Pyq.js";
import { secureLegacyPyqFile } from "./pyq-storage.service.js";

export async function migrateResourcesToPublicViewing() {
  const [notes, pyqs] = await Promise.all([
    Note.updateMany(
      {},
      { $set: { publicationStatus: "published", visibility: "public" } },
    ),
    Pyq.find({ "storage.accessType": { $ne: "authenticated" } })
      .select("_id storage")
      .lean(),
  ]);

  for (const pyq of pyqs) {
    const storage = await secureLegacyPyqFile(pyq.storage);
    await Pyq.updateOne(
      { _id: pyq._id },
      {
        $set: {
          storage,
          publicationStatus: "published",
          visibility: "public",
        },
        $unset: { approvalStatus: "", reviewedBy: "", reviewedAt: "" },
      },
      { strict: false },
    );
  }

  const papers = await Pyq.updateMany(
    {},
    {
      $set: { publicationStatus: "published", visibility: "public" },
      $unset: { approvalStatus: "", reviewedBy: "", reviewedAt: "" },
    },
    { strict: false },
  );
  const migratedNoteCount = notes.modifiedCount;
  if (migratedNoteCount || papers.modifiedCount || pyqs.length) {
    console.info(
      `Published ${migratedNoteCount} note(s) and ${papers.modifiedCount} question paper(s); secured ${pyqs.length} legacy public paper file(s).`,
    );
  }
}
