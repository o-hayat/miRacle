from copy import deepcopy
import joblib
import pytest
from sklearn.ensemble import RandomForestClassifier
from scripts.export_browser_assets import ROOT, export_model


def test_export_retains_model_schema_and_threshold():
    bundle = joblib.load(ROOT / "artifacts/model/model.joblib")
    exported = export_model(bundle)
    assert len(exported["coefficients"]) == 36
    assert exported["threshold"] == bundle["threshold"]
    assert exported["medians"] == bundle["medians"].tolist()


def test_export_rejects_unsupported_models_and_schemas():
    bundle = joblib.load(ROOT / "artifacts/model/model.joblib")
    invalid = deepcopy(bundle)
    invalid["feature_names"] = ["unknown"]
    with pytest.raises(ValueError, match="schema"):
        export_model(invalid)
    invalid = deepcopy(bundle)
    invalid["model"].steps[1] = ("model", RandomForestClassifier())
    with pytest.raises(ValueError, match="Unsupported trained model"):
        export_model(invalid)
    invalid = deepcopy(bundle)
    invalid["model"].steps[0][1].with_mean = False
    with pytest.raises(ValueError, match="scaling"):
        export_model(invalid)
