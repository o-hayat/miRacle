"""Export the scientific reference without training or silently changing the model.

Run with the pinned requirements-reference.lock environment, from any directory.
--fixtures also computes every control in all three preprocessing modes.
"""
from __future__ import annotations

import argparse
import ast
import csv
import hashlib
import io
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from dataclasses import asdict
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import joblib
import numpy as np
import RNA
import sklearn
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from mirna_app import evidence
from mirna_app.exon_mask import _load_exons, DEFAULT_CDS_PATH, DEFAULT_EXON_PATH
from mirna_app.features import FEATURE_NAMES
from mirna_app.model import FEATURE_LABELS
from mirna_app.pipeline import analyze, COMPARATIVE_REFERENCE_SETS, RFAM_DECOY_PATH
from mirna_app.sequence import infer_input_type, parse_sequence_text
from mirna_app.similarity import DEFAULT_REFERENCE_PATH, ReferenceMatcher, read_fasta

ENGINE = "ViennaRNA-2.7.2-RNAfold-windows-v1"
PUBLIC = ROOT / "web/public"


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def export_model(bundle):
    if tuple(bundle.get("feature_names", ())) != FEATURE_NAMES:
        raise ValueError("Unsupported model feature schema")
    model = bundle.get("model")
    if type(model) is not Pipeline or len(model.steps) != 2:
        raise ValueError("Only a StandardScaler + LogisticRegression pipeline is supported")
    scale, classifier = (step for _, step in model.steps)
    if type(scale) is not StandardScaler or type(classifier) is not LogisticRegression:
        raise ValueError("Unsupported trained model; refusing to substitute scoring")
    if not scale.with_mean or not scale.with_std or classifier.classes_.tolist() != [0, 1]:
        raise ValueError("Unsupported scaling or class order")
    size = len(FEATURE_NAMES)
    if classifier.coef_.shape != (1, size) or len(bundle["medians"]) != size:
        raise ValueError("Unsupported coefficient or median dimensions")
    result = dict(feature_names=list(FEATURE_NAMES), mean=scale.mean_.tolist(),
                  scale=scale.scale_.tolist(), coefficients=classifier.coef_[0].tolist(),
                  intercept=float(classifier.intercept_[0]), medians=np.asarray(bundle["medians"]).tolist(),
                  threshold=float(bundle["threshold"]), name=bundle["model_name"], feature_labels=FEATURE_LABELS)
    encode(result)  # Reject NaN/Inf, not just schema mismatches.
    if any(x <= 0 for x in result["scale"]):
        raise ValueError("Invalid scaling parameters")
    return result


def export_matcher(path, species, source):
    matcher = ReferenceMatcher(read_fasta(path), species, source)
    if not matcher.records:
        raise ValueError(f"Required reference missing: {path}")
    matrix = matcher.matrix
    return dict(records=matcher.records, species=species, source=source,
                vocabulary={key: int(value) for key, value in matcher.vectorizer.vocabulary_.items()},
                idf=matcher.vectorizer.idf_.tolist(), indptr=matrix.indptr.tolist(),
                indices=matrix.indices.tolist(), data=matrix.data.tolist())


def request_key(text, options, version):
    parsed = parse_sequence_text(text, options["input_id"])
    return digest(encode([ENGINE, version, parsed.sequence, parsed.description, parsed.identifier,
                          options["input_type"], options["mask_mode"]]))


def export_functions():
    """Use the actual app's serializers without executing Streamlit's interface."""
    tree = ast.parse((ROOT / "app.py").read_text())
    nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef)
             and node.name in {"candidates_csv", "candidates_fasta"}]
    namespace = {"csv": csv, "io": io, "AnalysisResult": object}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), "app.py", "exec"), namespace)
    return namespace


def compute_fixture(job):
    name, text, mode, version = job
    options = dict(input_type=infer_input_type(text), input_id="input_sequence", mask_mode=mode)
    # Always select the browser-compatible path, even on hosts with RNALfold.
    with patch("mirna_app.folding.shutil.which", return_value=None):
        result = analyze(text, input_type=options["input_type"], exclude_coding_exons=mode != "none",
                         exon_mask_mode="all_exons" if mode == "all_exons" else "cds")
    layouts, expected_evidence = {}, {}
    for candidate in result.export_candidates:
        xy = RNA.get_xy_coordinates(candidate.dot_bracket)
        layouts[candidate.id] = [[xy.get(i).X, xy.get(i).Y] for i in range(len(candidate.sequence_rna))]
        literature = evidence.literature_context(candidate)
        expected_evidence[candidate.id] = dict(level=evidence.evidence_level(candidate),
            arms=evidence.mature_arms(candidate), machinery=[asdict(x) for x in evidence.machinery_evidence(candidate)],
            targets=[asdict(x) for x in evidence.validated_targets(candidate)],
            literature=asdict(literature) if literature else None)
    serializers = export_functions()
    return dict(name=name, text=text, options=options, analysis=dict(result=result.to_dict(), layouts=layouts,
        provenance=dict(engine=ENGINE, data=version, key=request_key(text, options, version), source="saved"),
        memory_bytes=0), evidence=expected_evidence, csv=serializers["candidates_csv"](result).decode(),
        fasta=serializers["candidates_fasta"](result).decode())


def control_labels():
    tree = ast.parse((ROOT / "app.py").read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "control_options" for t in node.targets):
            return {v: k for k, v in ast.literal_eval(node.value).items()}
    raise ValueError("Control labels missing")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixtures", action="store_true")
    parser.add_argument("--jobs", type=int, default=4)
    args = parser.parse_args()
    if sklearn.__version__ != "1.5.0" or RNA.__version__ != "2.7.2" or np.__version__ != "1.26.4":
        raise RuntimeError("Use Python 3.12 and requirements-reference.lock")
    model = export_model(joblib.load(ROOT / "artifacts/model/model.joblib"))
    runtime_files = [PUBLIC / "wasm" / name for name in ["vienna-2.7.2.mjs", "vienna-2.7.2.wasm"]]
    for path in runtime_files:
        if not path.exists():
            raise RuntimeError("Build ViennaRNA WASM before exporting browser assets")
    inputs = sorted([*(ROOT / "assets").rglob("*"), *(ROOT / "mirna_app").glob("*.py"),
                     *(ROOT / "web/src/lib/analysis").glob("*.ts"), *runtime_files,
                     ROOT / "wasm/bridge.c",
                     ROOT / "artifacts/model/model.joblib", ROOT / "artifacts/evaluation/metrics.json",
                     Path(__file__)])
    fingerprint = hashlib.sha256()
    for path in inputs:
        if path.is_file():
            fingerprint.update(str(path.relative_to(ROOT)).encode()); fingerprint.update(path.read_bytes())
    version = "v1-" + fingerprint.hexdigest()[:16]
    out = PUBLIC / "data" / version
    out.mkdir(parents=True, exist_ok=True)
    (out / "engine").mkdir(exist_ok=True)
    for source in runtime_files:
        (out / "engine" / source.name).write_bytes(source.read_bytes())
    def write(name, data):
        target = out / name; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(encode(data))
        return name
    references = [write(f"references/{i}.json", export_matcher(path, species, source))
        for i, (species, source, path) in enumerate([
            ("Human", "MirGeneDB 3.0", DEFAULT_REFERENCE_PATH),
            ("Non-miRNA", "Rfam", RFAM_DECOY_PATH), *COMPARATIVE_REFERENCE_SETS])]
    annotations = {}
    for mode, source in [("cds", DEFAULT_CDS_PATH), ("all_exons", DEFAULT_EXON_PATH)]:
        for chrom, (_, records) in _load_exons(str(source)).items():
            annotations.setdefault(chrom, {})[mode] = write(f"annotations/{chrom}-{mode}.json", records)
    target_path = evidence.MIRTARBASE_PATH if evidence.MIRTARBASE_PATH.exists() else evidence.BUNDLED_TARGET_PATH
    with target_path.open(encoding="utf-8-sig", newline="") as file:
        targets = list(csv.DictReader(file))
    evidence_data = dict(mature=evidence._mature_records(), external=evidence._external_machinery_records(),
                         literature=evidence._literature_records(), targets=targets,
                         proteins=[asdict(x) for x in evidence.BIOGENESIS_PROTEINS])
    labels = control_labels()
    examples = [dict(name=name, label=label, text=(ROOT / "assets/examples" / name).read_text(),
                     saved=f"saved/{Path(name).stem}.json") for name, label in labels.items()]
    manifest = dict(schema=1, version=version, engine=ENGINE, base=f"/data/{version}/",
        source_hashes={str(p.relative_to(ROOT)): digest(p.read_bytes()) for p in inputs if p.is_file()},
        model=write("model.json", model), references=references, annotations=annotations,
        evidence=write("evidence.json", evidence_data),
        metrics=write("metrics.json", json.loads((ROOT / "artifacts/evaluation/metrics.json").read_text())),
        examples=write("examples.json", examples))
    if args.fixtures:
        jobs = [(e["name"], e["text"], mode, version) for e in examples for mode in ["cds", "all_exons", "none"]]
        fixture_dir = ROOT / "web/tests/fixtures"; fixture_dir.mkdir(parents=True, exist_ok=True)
        index = []
        with ProcessPoolExecutor(max_workers=args.jobs) as pool:
            for fixture in pool.map(compute_fixture, jobs):
                stem = Path(fixture["name"]).stem
                filename = f"{stem}-{fixture['options']['mask_mode']}.json"
                (fixture_dir / filename).write_bytes(encode(fixture)); index.append(filename)
                if fixture["options"]["mask_mode"] == "cds":
                    write(f"saved/{stem}.json", fixture["analysis"])
                print(f"Reference: {filename}", flush=True)
        (fixture_dir / "index.json").write_bytes(encode(index))
        # Signature figure is actual MIR21, with the same native layout as results.
        signature = json.loads((fixture_dir / "mir21_region-cds.json").read_text())["analysis"]
        write("signature.json", dict(candidate=signature["result"]["candidates"][0], coordinates=signature["layouts"]["candidate-1"]))
    manifest["files"] = {str(p.relative_to(out)): dict(sha256=digest(p.read_bytes()), bytes=p.stat().st_size)
                         for p in sorted(out.rglob("*")) if p.is_file()}
    if any(v["bytes"] > 25 * 1024**2 for v in manifest["files"].values()):
        raise RuntimeError("Asset exceeds Cloudflare's 25 MiB limit")
    (PUBLIC / "data/manifest.json").write_bytes(encode(manifest))
    print(f"Exported {version}: {len(manifest['files'])} assets", flush=True)


if __name__ == "__main__":
    main()
