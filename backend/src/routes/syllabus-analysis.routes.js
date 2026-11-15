import { Router } from "../lib/router.js";
import {
  confirmSyllabusAndFindResources,
  getSyllabusAnalysis,
  listSyllabusAnalyses,
  regenerateSyllabusStructure,
  updateSyllabusStructure,
  uploadSyllabus,
} from "../controllers/syllabus-analysis.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { receiveMultipart } from "../middleware/next-upload.js";

const syllabusAnalysisRouter = Router();
const receiveSyllabusFile = receiveMultipart({
  fields: ["file"],
  maxFileSize: 10 * 1024 * 1024,
  single: true,
});

syllabusAnalysisRouter.use(requireAuth, requireRole("user"));
syllabusAnalysisRouter.get("/", listSyllabusAnalyses);
syllabusAnalysisRouter.post("/", receiveSyllabusFile, uploadSyllabus);
syllabusAnalysisRouter.get("/:analysisId", getSyllabusAnalysis);
syllabusAnalysisRouter.put("/:analysisId", updateSyllabusStructure);
syllabusAnalysisRouter.post("/:analysisId/regenerate", regenerateSyllabusStructure);
syllabusAnalysisRouter.post(
  "/:analysisId/confirm",
  confirmSyllabusAndFindResources,
);

export default syllabusAnalysisRouter;
