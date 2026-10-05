export type TaskReviewQuestionKind =
  | "single_choice"
  | "multiple_select"
  | "true_false";

export type TaskReviewAttemptStatus =
  | "generating"
  | "ready"
  | "passed"
  | "failed"
  | "generation_failed"
  | "cancelled";

export type TaskReviewFlashcard = {
  id: string;
  front: string;
  back: string;
};

export type TaskReviewQuestion = {
  id: string;

  kind:
    TaskReviewQuestionKind;

  prompt: string;

  options: string[];
};

export type TaskReviewAssessment = {
  title: string;
  summary: string;

  flashcards:
    TaskReviewFlashcard[];

  questions:
    TaskReviewQuestion[];
};

export type TaskReviewAttempt = {
  attempt_id: string;

  task_id: string;

  attempt_number: number;

  status:
    TaskReviewAttemptStatus;

  pass_threshold: number;

  score: number | null;

  assessment:
    | TaskReviewAssessment
    | null;

  provider: string | null;

  model: string | null;

  prompt_version:
    | string
    | null;

  latency_ms:
    | number
    | null;

  generation_error:
    | string
    | null;

  created_at: string;

  ready_at:
    | string
    | null;
};

export type LatestTaskReviewResponse = {
  attempt:
    | TaskReviewAttempt
    | null;
};