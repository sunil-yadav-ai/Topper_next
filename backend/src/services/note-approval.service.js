import { env } from "../config/env.js";

export function decideNoteApproval(
  report,
  minimumStatements = env.minimumVerifiableStatements,
) {
  const verifiableStatementCount = Number.isInteger(report.totalVerifiableStatements)
    ? report.totalVerifiableStatements
    : 0;
  const issues = Array.isArray(report.issues) ? report.issues : [];
  const confirmedErrorCount = (report.issues ?? []).filter(
    (issue) => issue.classification === "CONFIRMED_ERROR",
  ).length;
  const unreadablePageCount = report.unreadablePageCount ?? 0;
  const unresolvedConcern = issues.some(
    (issue) =>
      [
        "potential_safety_concern",
        "potential_copyright_concern",
        "other_content_concern",
      ].includes(issue.errorCategory),
  );
  const humanReviewReason =
    unresolvedConcern
      ? "An unresolved verification concern requires human review."
      : !report.analysisReliable ||
    !Array.isArray(report.pages) ||
    (report.pages.length > 0 && unreadablePageCount === report.pages.length)
      ? "The document could not be reliably analyzed; human review is required."
      : verifiableStatementCount < minimumStatements
        ? `Only ${verifiableStatementCount} verifiable statements were found; at least ${minimumStatements} are required for automatic approval.`
        : "";

  if (humanReviewReason) {
    return {
      decision: "NEEDS_HUMAN_REVIEW",
      verifiableStatementCount,
      confirmedErrorCount,
      mistakePercentage: null,
      humanReviewReason,
    };
  }

  const mistakePercentage =
    (confirmedErrorCount / verifiableStatementCount) * 100;
  return {
    decision:
      mistakePercentage <= 5
        ? "APPROVED"
        : mistakePercentage <= 10
          ? "APPROVED_WITH_WARNING"
          : "REJECTED",
    verifiableStatementCount,
    confirmedErrorCount,
    mistakePercentage,
    humanReviewReason: "",
  };
}

export function getNotePublicationFields(decision) {
  if (!decision) throw new Error("An AI verification decision is required.");
  return {
    publicationStatus: "published",
    visibility: "public",
  };
}
