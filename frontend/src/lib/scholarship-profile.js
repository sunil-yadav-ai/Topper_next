export function eligibilityNeedsProfile(evaluation) {
  return evaluation?.result === "MORE_INFORMATION_REQUIRED" &&
    evaluation.criteriaAvailable !== false &&
    Array.isArray(evaluation.missingFields) &&
    evaluation.missingFields.length > 0;
}
