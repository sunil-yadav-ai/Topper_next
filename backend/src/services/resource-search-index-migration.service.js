import Note from "../models/Note.js";
import NoteOcrResult from "../models/NoteOcrResult.js";
import Pyq from "../models/Pyq.js";
import { decryptJson } from "./encrypted-json.service.js";
import {
  buildNoteSearchFields,
  buildPyqSearchFields,
  createSearchNgrams,
} from "./resource-search-index.service.js";

const batchSize = 100;
const searchIndexVersion = 1;

async function migrateNotes() {
  const cursor = Note.find({
    searchIndexVersion: { $ne: searchIndexVersion },
  })
    .select(
      "_id title subject topic unit description department university keywords tags +searchNgrams",
    )
    .lean()
    .cursor();
  let batch = [];
  let indexed = 0;

  async function indexBatch(notes) {
    if (!notes.length) return;
    const ocrResults = await NoteOcrResult.find({
      note: { $in: notes.map((note) => note._id) },
    })
      .select("note +encryptedResult")
      .lean();
    const ocrByNoteId = new Map();
    for (const result of ocrResults) {
      try {
        ocrByNoteId.set(
          result.note.toString(),
          decryptJson(result.encryptedResult),
        );
      } catch (error) {
        console.error(
          `Could not decrypt OCR text for note ${result.note}; indexing its metadata only:`,
          error,
        );
      }
    }
    const operations = notes.map((note) => ({
      updateOne: {
        filter: { _id: note._id, searchIndexVersion: { $ne: searchIndexVersion } },
        update: {
          $set: {
            searchNgrams: createSearchNgrams(
              buildNoteSearchFields(note, ocrByNoteId.get(note._id.toString())),
            ),
            searchIndexVersion,
          },
        },
      },
    }));
    const result = await Note.bulkWrite(operations, { ordered: false });
    indexed += result.modifiedCount;
  }

  for await (const note of cursor) {
    batch.push(note);
    if (batch.length === batchSize) {
      await indexBatch(batch);
      batch = [];
    }
  }
  await indexBatch(batch);
  return indexed;
}

async function migratePyqs() {
  const cursor = Pyq.find({
    searchIndexVersion: { $ne: searchIndexVersion },
  })
    .select(
      "_id title subject description university college department course examType fileName keywords tags +searchNgrams",
    )
    .lean()
    .cursor();
  let batch = [];
  let indexed = 0;

  async function indexBatch(pyqs) {
    if (!pyqs.length) return;
    const operations = pyqs.map((pyq) => ({
      updateOne: {
        filter: { _id: pyq._id, searchIndexVersion: { $ne: searchIndexVersion } },
        update: {
          $set: {
            searchNgrams: createSearchNgrams(buildPyqSearchFields(pyq)),
            searchIndexVersion,
          },
        },
      },
    }));
    const result = await Pyq.bulkWrite(operations, { ordered: false });
    indexed += result.modifiedCount;
  }

  for await (const pyq of cursor) {
    batch.push(pyq);
    if (batch.length === batchSize) {
      await indexBatch(batch);
      batch = [];
    }
  }
  await indexBatch(batch);
  return indexed;
}

export async function migrateResourceSearchIndexes() {
  await Promise.all([
    Note.collection.createIndex({
      publicationStatus: 1,
      visibility: 1,
      searchNgrams: 1,
    }),
    Pyq.collection.createIndex({
      publicationStatus: 1,
      visibility: 1,
      searchNgrams: 1,
    }),
  ]);
  const [notes, pyqs] = await Promise.all([migrateNotes(), migratePyqs()]);
  if (notes || pyqs) {
    console.info(`Built fuzzy search indexes for ${notes} note(s) and ${pyqs} PYQ(s).`);
  }
}
