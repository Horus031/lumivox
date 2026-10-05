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

export type TaskReviewSourceMode =
  | "document_grounded"
  | "topic_inferred";

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

export type TaskReviewSourceSummary = {
  mode:
    TaskReviewSourceMode;

  document_count: number;

  retrieved_chunk_count:
    number;
};

export type TaskReviewQuestionFeedback = {
  question_id: string;

  correct: boolean;

  selected_option_indices:
    number[];

  correct_option_indices:
    number[];

  explanation: string;

  weak_area:
    | string
    | null;
};

export type TaskReviewFeedback = {
  correct_count: number;

  total_questions: number;

  score: number;

  passed: boolean;

  questions:
    TaskReviewQuestionFeedback[];
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

  feedback:
    | TaskReviewFeedback
    | null;

  weak_areas: string[];

  source:
    TaskReviewSourceSummary;

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

  submitted_at:
    | string
    | null;

  completed_at:
    | string
    | null;
};

export type TaskReviewAnswerSubmission = {
  questionId: string;

  selectedOptionIndices:
    number[];
};

export type LatestTaskReviewResponse = {
  attempt:
    | TaskReviewAttempt
    | null;
};