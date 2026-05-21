from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd


BASE_DIR = Path(__file__).resolve().parents[1]
RAW_DIR = BASE_DIR / "data" / "raw" / "oulad"
PROCESSED_DIR = BASE_DIR / "data" / "processed"
REPORT_DIR = BASE_DIR / "reports" / "deadline-risk"

OBSERVATION_GAP_DAYS = 7


def ensure_dirs() -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)


def load_core_tables() -> dict[str, pd.DataFrame]:
    assessments = pd.read_csv(RAW_DIR / "assessments.csv")
    student_assessment = pd.read_csv(RAW_DIR / "studentAssessment.csv")
    student_info = pd.read_csv(RAW_DIR / "studentInfo.csv")
    student_registration = pd.read_csv(RAW_DIR / "studentRegistration.csv")

    return {
        "assessments": assessments,
        "student_assessment": student_assessment,
        "student_info": student_info,
        "student_registration": student_registration,
    }


def build_candidate_student_assessments(
    assessments: pd.DataFrame,
    student_info: pd.DataFrame,
    student_registration: pd.DataFrame,
    student_assessment: pd.DataFrame,
) -> pd.DataFrame:
    """
    One row = one student-assessment pair.

    We exclude:
    - Exams, because final exam submission rows are often unavailable in OULAD.
    - Assessments without a due date.
    - Students who unregistered before the deadline.
    """

    usable_assessments = assessments[
        (assessments["assessment_type"] != "Exam")
        & assessments["date"].notna()
    ].copy()

    usable_assessments = usable_assessments.rename(
        columns={
            "date": "due_day",
            "weight": "assessment_weight",
        }
    )

    student_base = student_info[
        [
            "code_module",
            "code_presentation",
            "id_student",
        ]
    ].drop_duplicates()

    student_base = student_base.merge(
        student_registration[
            [
                "code_module",
                "code_presentation",
                "id_student",
                "date_registration",
                "date_unregistration",
            ]
        ],
        on=["code_module", "code_presentation", "id_student"],
        how="left",
    )

    candidate_pairs = student_base.merge(
        usable_assessments[
            [
                "code_module",
                "code_presentation",
                "id_assessment",
                "assessment_type",
                "due_day",
                "assessment_weight",
            ]
        ],
        on=["code_module", "code_presentation"],
        how="inner",
    )

    # Remove students who had already unregistered before the assessment deadline.
    candidate_pairs = candidate_pairs[
        candidate_pairs["date_unregistration"].isna()
        | (candidate_pairs["date_unregistration"] >= candidate_pairs["due_day"])
    ].copy()

    candidate_pairs["prediction_day"] = (
        candidate_pairs["due_day"] - OBSERVATION_GAP_DAYS
    )

    submissions = student_assessment[
        [
            "id_assessment",
            "id_student",
            "date_submitted",
            "is_banked",
            "score",
        ]
    ].copy()

    dataset = candidate_pairs.merge(
        submissions,
        on=["id_assessment", "id_student"],
        how="left",
    )

    dataset["deadline_risk"] = (
        dataset["date_submitted"].isna()
        | (dataset["date_submitted"] > dataset["due_day"])
    ).astype(int)

    return dataset


def aggregate_vle_features(dataset: pd.DataFrame) -> pd.DataFrame:
    """
    Build pre-deadline engagement features from studentVle.csv.

    To avoid leakage:
    - We use only interactions at or before prediction_day.
    - prediction_day = due_day - 7.
    """

    vle_path = RAW_DIR / "studentVle.csv"

    usecols = [
        "code_module",
        "code_presentation",
        "id_student",
        "date",
        "sum_click",
    ]

    student_vle = pd.read_csv(vle_path, usecols=usecols)

    student_vle_daily = (
        student_vle
        .groupby(
            [
                "code_module",
                "code_presentation",
                "id_student",
                "date",
            ],
            as_index=False,
        )["sum_click"]
        .sum()
    )

    output_chunks: list[pd.DataFrame] = []

    grouping_columns = [
        "code_module",
        "code_presentation",
        "id_assessment",
        "prediction_day",
    ]

    for group_key, candidate_group in dataset.groupby(grouping_columns):
        code_module, code_presentation, _, prediction_day = group_key

        vle_group = student_vle_daily[
            (student_vle_daily["code_module"] == code_module)
            & (student_vle_daily["code_presentation"] == code_presentation)
        ]

        total_history = vle_group[
            vle_group["date"] <= prediction_day
        ]

        last_7d_history = vle_group[
            (vle_group["date"] > prediction_day - 7)
            & (vle_group["date"] <= prediction_day)
        ]

        total_agg = (
            total_history
            .groupby("id_student", as_index=False)
            .agg(
                engagement_events_total=("sum_click", "sum"),
                active_days_total=("date", "nunique"),
            )
        )

        recent_agg = (
            last_7d_history
            .groupby("id_student", as_index=False)
            .agg(
                engagement_events_last_7d=("sum_click", "sum"),
                active_days_last_7d=("date", "nunique"),
            )
        )

        enriched = candidate_group.merge(
            total_agg,
            on="id_student",
            how="left",
        ).merge(
            recent_agg,
            on="id_student",
            how="left",
        )

        output_chunks.append(enriched)

    enriched_dataset = pd.concat(output_chunks, ignore_index=True)

    feature_cols = [
        "engagement_events_total",
        "active_days_total",
        "engagement_events_last_7d",
        "active_days_last_7d",
    ]

    enriched_dataset[feature_cols] = enriched_dataset[feature_cols].fillna(0)

    return enriched_dataset


def aggregate_prior_assessment_features(dataset: pd.DataFrame) -> pd.DataFrame:
    """
    For each student-assessment prediction row, build history features
    from assessments that happened before prediction_day.
    """

    output_rows: list[pd.DataFrame] = []

    for _, row_group in dataset.groupby(
        [
            "code_module",
            "code_presentation",
            "id_assessment",
            "prediction_day",
        ]
    ):
        sample_row = row_group.iloc[0]

        code_module = sample_row["code_module"]
        code_presentation = sample_row["code_presentation"]
        prediction_day = sample_row["prediction_day"]

        historical_rows = dataset[
            (dataset["code_module"] == code_module)
            & (dataset["code_presentation"] == code_presentation)
            & (dataset["due_day"] < prediction_day)
        ].copy()

        if historical_rows.empty:
            enriched = row_group.copy()
            enriched["prior_deadline_items_count"] = 0
            enriched["prior_submissions_count"] = 0
            enriched["prior_late_submissions_count"] = 0
            enriched["prior_submission_rate"] = 0.0
            enriched["prior_late_rate"] = 0.0
            output_rows.append(enriched)
            continue

        historical_rows["submitted_flag"] = (
            historical_rows["date_submitted"].notna()
        ).astype(int)

        historical_rows["late_flag"] = (
            historical_rows["date_submitted"].notna()
            & (historical_rows["date_submitted"] > historical_rows["due_day"])
        ).astype(int)

        history_agg = (
            historical_rows
            .groupby("id_student", as_index=False)
            .agg(
                prior_deadline_items_count=("id_assessment", "count"),
                prior_submissions_count=("submitted_flag", "sum"),
                prior_late_submissions_count=("late_flag", "sum"),
            )
        )

        history_agg["prior_submission_rate"] = np.where(
            history_agg["prior_deadline_items_count"] > 0,
            history_agg["prior_submissions_count"]
            / history_agg["prior_deadline_items_count"],
            0.0,
        )

        history_agg["prior_late_rate"] = np.where(
            history_agg["prior_submissions_count"] > 0,
            history_agg["prior_late_submissions_count"]
            / history_agg["prior_submissions_count"],
            0.0,
        )

        enriched = row_group.merge(
            history_agg,
            on="id_student",
            how="left",
        )

        history_cols = [
            "prior_deadline_items_count",
            "prior_submissions_count",
            "prior_late_submissions_count",
            "prior_submission_rate",
            "prior_late_rate",
        ]

        enriched[history_cols] = enriched[history_cols].fillna(0)

        output_rows.append(enriched)

    return pd.concat(output_rows, ignore_index=True)


def select_final_feature_table(dataset: pd.DataFrame) -> pd.DataFrame:
    """
    Keep only the modelling columns we want for the transferable
    Deadline Risk Classifier.
    """

    final_columns = [
        "assessment_weight",
        "engagement_events_total",
        "active_days_total",
        "engagement_events_last_7d",
        "active_days_last_7d",
        "prior_deadline_items_count",
        "prior_submissions_count",
        "prior_late_submissions_count",
        "prior_submission_rate",
        "prior_late_rate",
        "deadline_risk",
    ]

    final_dataset = dataset[final_columns].copy()

    final_dataset = final_dataset.replace([np.inf, -np.inf], np.nan)
    final_dataset = final_dataset.fillna(0)

    return final_dataset


def write_dataset_report(
    raw_dataset: pd.DataFrame,
    final_dataset: pd.DataFrame,
) -> None:
    target_distribution = (
        final_dataset["deadline_risk"]
        .value_counts(normalize=False)
        .sort_index()
        .to_dict()
    )

    target_distribution_ratio = (
        final_dataset["deadline_risk"]
        .value_counts(normalize=True)
        .sort_index()
        .round(4)
        .to_dict()
    )

    report = {
        "raw_candidate_rows": int(len(raw_dataset)),
        "final_training_rows": int(len(final_dataset)),
        "feature_columns": [
            col for col in final_dataset.columns
            if col != "deadline_risk"
        ],
        "target_column": "deadline_risk",
        "target_distribution_count": {
            str(key): int(value)
            for key, value in target_distribution.items()
        },
        "target_distribution_ratio": {
            str(key): float(value)
            for key, value in target_distribution_ratio.items()
        },
        "observation_gap_days": OBSERVATION_GAP_DAYS,
    }

    report_path = REPORT_DIR / "dataset_build_report.json"

    with report_path.open("w", encoding="utf-8") as file:
        json.dump(report, file, indent=2)


def main() -> None:
    ensure_dirs()

    print("Loading core OULAD tables...")
    tables = load_core_tables()

    print("Building student-assessment prediction rows...")
    candidate_dataset = build_candidate_student_assessments(
        assessments=tables["assessments"],
        student_info=tables["student_info"],
        student_registration=tables["student_registration"],
        student_assessment=tables["student_assessment"],
    )

    print(f"Candidate rows: {len(candidate_dataset):,}")

    print("Aggregating VLE behavioural features...")
    dataset_with_vle = aggregate_vle_features(candidate_dataset)

    print("Aggregating prior deadline-history features...")
    dataset_with_history = aggregate_prior_assessment_features(dataset_with_vle)

    print("Selecting final model-ready columns...")
    final_dataset = select_final_feature_table(dataset_with_history)

    output_path = PROCESSED_DIR / "deadline_risk_dataset.csv"
    final_dataset.to_csv(output_path, index=False)

    write_dataset_report(
        raw_dataset=candidate_dataset,
        final_dataset=final_dataset,
    )

    print(f"Saved training dataset to: {output_path}")
    print("Dataset build completed successfully.")


if __name__ == "__main__":
    main()