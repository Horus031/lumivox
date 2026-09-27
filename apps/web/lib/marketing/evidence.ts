// Source: services/ai-api/ml/artifacts/native-task-risk/
// logistic_regression_balanced_metadata.json
// Verified against the active ml_model_versions record on 2026-09-27.

export const evidenceSnapshotDate = "2026-09-27";

export const modelEvaluation = {
  modelVersion: "native-task-risk-v2-20260925-021822",
  algorithm: "Logistic regression with balanced class weights",
  predictionHorizonDays: 14,
  threshold: 0.4,
  datasetRows: 70_379,
  uniqueTasks: 6_643,
  uniqueUsers: 129,
  testRows: 14_315,
  testTasks: 1_329,
  metrics: {
    accuracy: 0.6731,
    precision: 0.595,
    recall: 0.769,
    specificity: 0.5997,
    balancedAccuracy: 0.6844,
    f1: 0.6709,
    rocAuc: 0.7512,
    averagePrecision: 0.6937,
    brierScore: 0.2004,
  },
  confusionMatrix: {
    trueNegative: 4_865,
    falsePositive: 3_247,
    falseNegative: 1_433,
    truePositive: 4_770,
  },
  deploymentReady: true,
} as const;

export const modelEvidence = [
  {
    key: "snapshots",
    value: "70,379",
    label: "Task snapshots",
    description:
      "Samples used in the native task-risk modeling dataset.",
  },
  {
    key: "tasks",
    value: "6,643",
    label: "Unique tasks",
    description:
      "Distinct tasks represented in the model dataset.",
  },
  {
    key: "recall",
    value: "76.9%",
    label: "Test recall",
    description:
      "Recall for identifying delayed tasks on the held-out test set.",
  },
  {
    key: "rocAuc",
    value: "0.751",
    label: "ROC-AUC",
    description:
      "Discrimination performance on the held-out test set.",
  },
] as const;

// Source: C:/Users/Dell/Downloads/Usability Study  (Responses) -
// Form Responses 1.csv. SUS uses the standard alternating-item formula.
// Participant names and verbatim comments are intentionally not published.
export const usabilityEvidence = {
  participants: 15,
  averageSus: 63.5,
  minimumSus: 47.5,
  maximumSus: 92.5,
  completedTaskChecks: 166,
  totalTaskChecks: 180,
  taskCompletionRate: 0.922,
} as const;

// Source: aggregate counts from Supabase project lslybjylsxtnznghrtyj.
// These are record counts at the snapshot date, not outcome or efficacy claims.
export const platformEvidence = {
  profileRecords: 168,
  taskRecords: 6_697,
  goalRecords: 462,
  focusSessionRecords: 46_932,
  completedFocusMinutes: 1_944_760,
} as const;
