from __future__ import annotations

import math
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from .features import FEATURE_NAMES, feature_vector
from .types import Influence


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_PATH = ROOT / "artifacts" / "model" / "model.joblib"


FEATURE_LABELS = {
    "mfe_per_nt": "normalized folding energy",
    "paired_fraction": "paired nucleotide fraction",
    "longest_stem": "longest continuous stem",
    "terminal_loop_size": "terminal loop size",
    "internal_unpaired_fraction": "internal unpaired fraction",
    "internal_unpaired_runs": "internal unpaired runs",
    "top_level_stems": "hairpin branch count",
    "gc_fraction": "GC content",
    "pair_count": "base-pair count",
    "sequence_entropy": "sequence complexity",
    "max_homopolymer": "longest homopolymer",
}


class _HeuristicModel:
    """Transparent emergency fallback; the bundled trained model is preferred."""

    def predict_proba(self, matrix: Any) -> np.ndarray:
        rows = np.asarray(matrix, dtype=float)
        index = {name: i for i, name in enumerate(FEATURE_NAMES)}
        outputs: list[list[float]] = []
        for row in rows:
            loop = row[index["terminal_loop_size"]]
            logit = (
                -0.6
                + 7.0 * (-row[index["mfe_per_nt"]] - 0.15)
                + 3.0 * (row[index["paired_fraction"]] - 0.35)
                + 0.10 * (row[index["longest_stem"]] - 5)
                - 1.2 * row[index["internal_unpaired_fraction"]]
                - 0.08 * abs(loop - 10)
                - 0.8 * abs(row[index["top_level_stems"]] - 1)
            )
            positive = 1.0 / (1.0 + math.exp(-max(-20.0, min(20.0, logit))))
            outputs.append([1.0 - positive, positive])
        return np.asarray(outputs)


class ModelScorer:
    def __init__(self, bundle: dict[str, Any] | None = None):
        if bundle:
            names = tuple(bundle.get("feature_names", ()))
            if names != FEATURE_NAMES:
                raise ValueError("Model feature schema does not match the application feature schema.")
            self.model = bundle["model"]
            self.medians = np.asarray(bundle["medians"], dtype=float)
            self.name = str(bundle.get("model_name", "Supervised classifier"))
            self.threshold = float(bundle.get("threshold", 0.5))
            self.is_fallback = False
        else:
            self.model = _HeuristicModel()
            self.medians = np.asarray(
                [80.0 if name == "length" else 0.0 for name in FEATURE_NAMES], dtype=float
            )
            self.name = "Transparent heuristic fallback"
            self.threshold = 0.5
            self.is_fallback = True

    def score_many(self, rows: list[dict[str, float]]) -> list[float]:
        if not rows:
            return []
        raw = np.asarray([feature_vector(row) for row in rows], dtype=float)
        matrix = raw if self.is_fallback else pd.DataFrame(raw, columns=FEATURE_NAMES)
        return [float(value) for value in self.model.predict_proba(matrix)[:, 1]]

    def explain(self, features: dict[str, float], limit: int = 5) -> list[Influence]:
        original = np.asarray(feature_vector(features), dtype=float)
        original_matrix = original.reshape(1, -1)
        base_input = original_matrix if self.is_fallback else pd.DataFrame(original_matrix, columns=FEATURE_NAMES)
        base = float(self.model.predict_proba(base_input)[0, 1])
        counterfactuals: list[np.ndarray] = []
        for index, name in enumerate(FEATURE_NAMES):
            counterfactual = original.copy()
            counterfactual[index] = self.medians[index]
            counterfactuals.append(counterfactual)
        counterfactual_matrix = np.asarray(counterfactuals)
        changed_input = (
            counterfactual_matrix
            if self.is_fallback
            else pd.DataFrame(counterfactual_matrix, columns=FEATURE_NAMES)
        )
        changed_scores = self.model.predict_proba(changed_input)[:, 1]
        influences: list[Influence] = []
        for index, name in enumerate(FEATURE_NAMES):
            changed = float(changed_scores[index])
            delta = base - changed
            influences.append(
                Influence(
                    feature=FEATURE_LABELS.get(name, name.replace("_", " ")),
                    delta_score=delta,
                    direction="supports" if delta >= 0 else "cautions",
                )
            )
        return sorted(influences, key=lambda item: abs(item.delta_score), reverse=True)[:limit]


@lru_cache(maxsize=2)
def load_scorer(path: str | None = None) -> ModelScorer:
    model_path = Path(path) if path else DEFAULT_MODEL_PATH
    if model_path.exists():
        return ModelScorer(joblib.load(model_path))
    return ModelScorer()
