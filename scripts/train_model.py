#!/usr/bin/env python3
"""Train the reproducible tabular precursor-likeness classifier and benchmark."""

from __future__ import annotations

import argparse
import json
import random
import re
import sys
from collections import defaultdict
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import ExtraTreesClassifier, HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.utils.class_weight import compute_sample_weight

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from mirna_app.features import FEATURE_NAMES, extract_features, passes_candidate_gate
from mirna_app.folding import fold_one
from mirna_app.rfam import RfamSequence, load_structured_decoys, write_decoy_fasta
from mirna_app.similarity import read_fasta
from mirna_app.types import FoldHit


RAW_DIR = ROOT / "artifacts" / "raw"
MODEL_DIR = ROOT / "artifacts" / "model"
EVAL_DIR = ROOT / "artifacts" / "evaluation"
REFERENCE = ROOT / "assets" / "references" / "hsa_precursors.fa"
GFF = ROOT / "assets" / "references" / "hsa_mirgenedb.gff3"
RFAM_SEED = RAW_DIR / "Rfam.seed.gz"
RFAM_REFERENCE = ROOT / "assets" / "references" / "rfam_ncrna_decoys.fa"


def read_single_fasta(path: Path) -> str:
    return "".join(line.strip() for line in path.read_text().splitlines() if not line.startswith(">"))


def family_id(name: str) -> str:
    value = re.sub(r"^Hsa-", "", name)
    value = re.sub(r"-v\d+", "", value)
    value = re.sub(r"-P.*$", "", value)
    return value


def exclusion_intervals(chromosome: str) -> list[tuple[int, int]]:
    intervals: list[tuple[int, int]] = []
    for line in GFF.read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        fields = line.split("\t")
        if len(fields) >= 5 and fields[0] == chromosome and fields[2] == "pre_miRNA":
            intervals.append((max(0, int(fields[3]) - 201), int(fields[4]) + 200))
    return intervals


def overlaps_exclusion(start: int, end: int, intervals: list[tuple[int, int]]) -> bool:
    return any(start <= right and end >= left for left, right in intervals)


def positive_rows() -> tuple[list[dict[str, float]], list[str], list[str], list[int], list[str]]:
    rows: list[dict[str, float]] = []
    names: list[str] = []
    groups: list[str] = []
    lengths: list[int] = []
    sequences: list[str] = []
    seen: set[str] = set()
    for name, sequence in read_fasta(REFERENCE):
        if sequence in seen or not 55 <= len(sequence) <= 120:
            continue
        seen.add(sequence)
        structure, mfe = fold_one(sequence)
        hit = FoldHit(1, len(sequence), "+", sequence, structure, mfe)
        features = extract_features(hit)
        if features["pair_count"] < 10:
            continue
        rows.append(features)
        names.append(name)
        groups.append(family_id(name))
        lengths.append(len(sequence))
        sequences.append(sequence)
    return rows, names, groups, lengths, sequences


def rfam_negative_pool(
    positive_sequences: set[str],
) -> list[tuple[RfamSequence, dict[str, float]]]:
    if not RFAM_SEED.exists():
        raise FileNotFoundError(
            "Rfam.seed.gz is missing. Run `python scripts/fetch_data.py --with-rfam`."
        )
    rows: list[tuple[RfamSequence, dict[str, float]]] = []
    for record in load_structured_decoys(RFAM_SEED):
        if record.sequence in positive_sequences:
            continue
        structure, mfe = fold_one(record.sequence)
        features = extract_features(
            FoldHit(1, len(record.sequence), "+", record.sequence, structure, mfe)
        )
        if passes_candidate_gate(features):
            rows.append((record, features))
    return rows


def split_rfam_families(
    records: list[tuple[RfamSequence, dict[str, float]]],
) -> tuple[set[str], set[str], set[str]]:
    families = sorted({record.accession for record, _ in records})
    random.Random(45).shuffle(families)
    train_end = int(len(families) * 0.70)
    validation_end = train_end + int(len(families) * 0.15)
    train = set(families[:train_end])
    validation = set(families[train_end:validation_end])
    test = set(families[validation_end:])
    # Guarantee that the held-out control panel spans several ncRNA biotypes.
    for marker in ("trna", "rrna", "snorna", "ribozyme"):
        if any(
            record.accession in test and marker in record.rna_type.lower()
            for record, _ in records
        ):
            continue
        replacement = next(
            (
                record.accession
                for record, _ in records
                if record.accession in train and marker in record.rna_type.lower()
            ),
            None,
        )
        if replacement:
            train.remove(replacement)
            test.add(replacement)
    return train, validation, test


def sample_rfam_rows(
    records: list[tuple[RfamSequence, dict[str, float]]],
    families: set[str],
    target: int,
    seed: int,
) -> list[tuple[RfamSequence, dict[str, float]]]:
    """Round-robin families so large snoRNA alignments cannot dominate."""
    rng = random.Random(seed)
    grouped: dict[str, list[tuple[RfamSequence, dict[str, float]]]] = defaultdict(list)
    for item in records:
        if item[0].accession in families:
            grouped[item[0].accession].append(item)
    for values in grouped.values():
        rng.shuffle(values)
    family_order = sorted(grouped)
    rng.shuffle(family_order)
    selected: list[tuple[RfamSequence, dict[str, float]]] = []
    depth = 0
    while len(selected) < target:
        added = False
        for family in family_order:
            values = grouped[family]
            if depth < len(values):
                selected.append(values[depth])
                added = True
                if len(selected) >= target:
                    break
        if not added:
            break
        depth += 1
    return selected


def write_rfam_controls(
    records: list[tuple[RfamSequence, dict[str, float]]], test_families: set[str]
) -> None:
    categories = {
        "trna": "trna",
        "rrna": "rrna",
        "snorna": "snorna",
        "ribozyme": "ribozyme",
    }
    candidates = [item[0] for item in records if item[0].accession in test_families]
    for filename, marker in categories.items():
        record = next(
            (item for item in candidates if marker in item.rna_type.lower()),
            None,
        )
        if record is None:
            continue
        path = ROOT / "assets" / "examples" / f"rfam_{filename}_control.fa"
        path.write_text(
            f">Rfam_{record.accession}_{record.family_id}_{filename}_negative_control\n"
            f"{record.sequence}\n"
        )


def genomic_negative_rows(
    chromosome: str,
    sequence: str,
    lengths: list[int],
    target: int,
    seed: int,
    lower: int,
    upper: int,
) -> list[dict[str, float]]:
    rng = random.Random(seed)
    exclusions = exclusion_intervals(chromosome)
    rows: list[dict[str, float]] = []
    seen: set[str] = set()
    attempts = 0
    max_attempts = target * 100
    while len(rows) < target and attempts < max_attempts:
        attempts += 1
        length = rng.choice(lengths)
        start = rng.randrange(lower, max(lower + 1, upper - length))
        candidate = sequence[start : start + length].upper().replace("T", "U")
        if "N" in candidate or candidate in seen:
            continue
        if overlaps_exclusion(start + 1, start + length, exclusions):
            continue
        structure, mfe = fold_one(candidate)
        features = extract_features(FoldHit(1, length, "+", candidate, structure, mfe))
        if passes_candidate_gate(features):
            rows.append(features)
            seen.add(candidate)
    if len(rows) < target:
        raise RuntimeError(
            f"Only found {len(rows)} of {target} candidate-like negatives from {chromosome}."
        )
    return rows


def split_positives(rows: list[dict[str, float]], groups: list[str]):
    indices = np.arange(len(rows))
    first = GroupShuffleSplit(n_splits=1, train_size=0.70, random_state=42)
    train_idx, temp_idx = next(first.split(indices, groups=groups))
    temp_groups = np.asarray(groups)[temp_idx]
    second = GroupShuffleSplit(n_splits=1, train_size=0.50, random_state=43)
    val_local, test_local = next(second.split(temp_idx, groups=temp_groups))
    return train_idx, temp_idx[val_local], temp_idx[test_local]


def best_threshold(y_true: np.ndarray, scores: np.ndarray) -> float:
    candidates = np.unique(np.r_[0.0, scores, 1.0])
    return float(max(candidates, key=lambda threshold: f1_score(y_true, scores >= threshold, zero_division=0)))


def metrics(y_true: np.ndarray, scores: np.ndarray, threshold: float) -> dict[str, object]:
    predicted = scores >= threshold
    matrix = confusion_matrix(y_true, predicted, labels=[0, 1])
    tn, fp, fn, tp = matrix.ravel()
    return {
        "precision": precision_score(y_true, predicted, zero_division=0),
        "recall": recall_score(y_true, predicted, zero_division=0),
        "f1": f1_score(y_true, predicted, zero_division=0),
        "pr_auc": average_precision_score(y_true, scores),
        "roc_auc": roc_auc_score(y_true, scores),
        "false_positives_per_100_negatives": 100.0 * fp / max(1, fp + tn),
        "confusion_matrix": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
    }


def frame(positive: list[dict[str, float]], negative: list[dict[str, float]]):
    rows = positive + negative
    X = pd.DataFrame(rows)[list(FEATURE_NAMES)]
    y = np.asarray([1] * len(positive) + [0] * len(negative), dtype=int)
    return X, y


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--quick", action="store_true", help="Use smaller negative sets for a fast smoke model")
    args = parser.parse_args()

    positives, _, groups, lengths, positive_sequences = positive_rows()
    train_idx, val_idx, test_idx = split_positives(positives, groups)
    positive_train = [positives[i] for i in train_idx]
    positive_val = [positives[i] for i in val_idx]
    positive_test = [positives[i] for i in test_idx]

    chr22 = read_single_fasta(RAW_DIR / "chr22.fa")
    chr21 = read_single_fasta(RAW_DIR / "chr21.fa")
    train_factor, val_factor, test_factor = ((1, 2, 3) if args.quick else (3, 5, 10))
    boundary = int(len(chr22) * 0.70)
    negative_train = genomic_negative_rows(
        "chr22", chr22, lengths, len(positive_train) * train_factor, 42, 0, boundary
    )
    negative_val = genomic_negative_rows(
        "chr22", chr22, lengths, len(positive_val) * val_factor, 43, boundary, len(chr22)
    )
    negative_test = genomic_negative_rows(
        "chr21", chr21, lengths, len(positive_test) * test_factor, 44, 0, len(chr21)
    )

    rfam_pool = rfam_negative_pool(set(positive_sequences))
    rfam_train_families, rfam_val_families, rfam_test_families = split_rfam_families(rfam_pool)
    rfam_train_items = sample_rfam_rows(
        rfam_pool, rfam_train_families, len(positive_train) * (1 if args.quick else 2), 46
    )
    rfam_val_items = sample_rfam_rows(
        rfam_pool, rfam_val_families, len(positive_val) * 2, 47
    )
    rfam_test_items = sample_rfam_rows(
        rfam_pool, rfam_test_families, len(positive_test) * 2, 48
    )
    rfam_train = [features for _, features in rfam_train_items]
    rfam_val = [features for _, features in rfam_val_items]
    rfam_test = [features for _, features in rfam_test_items]
    write_decoy_fasta([record for record, _ in rfam_pool], RFAM_REFERENCE)
    write_rfam_controls(rfam_pool, rfam_test_families)

    X_train, y_train = frame(positive_train, negative_train + rfam_train)
    X_val, y_val = frame(positive_val, negative_val + rfam_val)
    X_test, y_test = frame(positive_test, negative_test + rfam_test)

    logistic = Pipeline(
        [
            ("scale", StandardScaler()),
            ("model", LogisticRegression(class_weight="balanced", max_iter=2000, random_state=42)),
        ]
    )
    forest = RandomForestClassifier(
        n_estimators=300,
        max_depth=8,
        min_samples_leaf=3,
        class_weight="balanced_subsample",
        random_state=42,
        n_jobs=-1,
    )
    extra_trees = ExtraTreesClassifier(
        n_estimators=500,
        max_depth=12,
        min_samples_leaf=2,
        max_features="sqrt",
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    histogram_boosting = HistGradientBoostingClassifier(
        learning_rate=0.06,
        max_iter=250,
        max_leaf_nodes=15,
        min_samples_leaf=15,
        l2_regularization=1.0,
        random_state=42,
    )
    models = {
        "Logistic regression": logistic,
        "Random Forest": forest,
        "Extra Trees": extra_trees,
        "Histogram Gradient Boosting": histogram_boosting,
    }
    validation_scores: dict[str, float] = {}
    validation_thresholds: dict[str, float] = {}
    for name, model in models.items():
        if name == "Histogram Gradient Boosting":
            model.fit(X_train, y_train, sample_weight=compute_sample_weight("balanced", y_train))
        else:
            model.fit(X_train, y_train)
        model_validation_scores = model.predict_proba(X_val)[:, 1]
        validation_scores[name] = average_precision_score(y_val, model_validation_scores)
        validation_thresholds[name] = best_threshold(y_val, model_validation_scores)

    best_name = max(validation_scores, key=validation_scores.get)
    improvement = validation_scores[best_name] - validation_scores["Logistic regression"]
    selected_name = best_name if improvement > 0.005 else "Logistic regression"
    selected = models[selected_name]
    validation_prediction = selected.predict_proba(X_val)[:, 1]
    threshold = validation_thresholds[selected_name]
    test_prediction = selected.predict_proba(X_test)[:, 1]

    baseline_val = -X_val["mfe_per_nt"].to_numpy()
    baseline_threshold = best_threshold(y_val, baseline_val)
    baseline_test = -X_test["mfe_per_nt"].to_numpy()

    all_test_metrics = {
        name: metrics(
            y_test,
            model.predict_proba(X_test)[:, 1],
            validation_thresholds[name],
        )
        for name, model in models.items()
    }
    all_test_metrics["MFE/nt baseline"] = metrics(y_test, baseline_test, baseline_threshold)
    X_genomic, y_genomic = frame(positive_test, negative_test)
    X_rfam, y_rfam = frame(positive_test, rfam_test)
    selected_genomic_scores = selected.predict_proba(X_genomic)[:, 1]
    selected_rfam_scores = selected.predict_proba(X_rfam)[:, 1]

    results = {
        "dataset": {
            "positive_total": len(positives),
            "rfam_candidate_like_total": len(rfam_pool),
            "rfam_family_total": len({record.accession for record, _ in rfam_pool}),
            "train": {
                "positive": len(positive_train),
                "genomic_negative": len(negative_train),
                "rfam_negative": len(rfam_train),
            },
            "validation": {
                "positive": len(positive_val),
                "genomic_negative": len(negative_val),
                "rfam_negative": len(rfam_val),
            },
            "test": {
                "positive": len(positive_test),
                "genomic_negative": len(negative_test),
                "rfam_negative": len(rfam_test),
            },
            "negative_sources": (
                "hg38 chr22 train/validation; hg38 chr21 test; Rfam seed structural RNAs "
                "split by family"
            ),
        },
        "selection": {
            "selected_model": selected_name,
            "validation_pr_auc": validation_scores,
            "validation_thresholds": validation_thresholds,
            "threshold": threshold,
        },
        "test": all_test_metrics,
        "stratified_test": {
            "genomic_negatives": metrics(y_genomic, selected_genomic_scores, threshold),
            "rfam_ncrna_negatives": metrics(y_rfam, selected_rfam_scores, threshold),
        },
        "limitations": [
            "Unannotated genomic hairpins are weak negative labels.",
            "Rfam seed decoys are multi-species and are not a population-matched human background.",
            "Model scores are ranking values, not calibrated biological probabilities.",
            "Evaluation is human-specific and sequence/structure-only.",
        ],
    }

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    EVAL_DIR.mkdir(parents=True, exist_ok=True)
    bundle = {
        "model": selected,
        "model_name": selected_name,
        "feature_names": FEATURE_NAMES,
        "medians": X_train.median().to_numpy(),
        "threshold": threshold,
        "training_summary": results["dataset"],
        "validation_pr_auc": validation_scores,
    }
    joblib.dump(bundle, MODEL_DIR / "model.joblib")
    (EVAL_DIR / "metrics.json").write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
