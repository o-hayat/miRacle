from pathlib import Path

from streamlit.testing.v1 import AppTest


ROOT = Path(__file__).resolve().parent.parent


def test_app_loads_and_analyzes_bundled_positive():
    app = AppTest.from_file(ROOT / "app.py", default_timeout=30).run()
    assert not app.exception
    assert [tab.label for tab in app.tabs] == [
        "Discover", "Evidence", "Evaluation", "Science & limitations"
    ]
    assert not app.radio
    next(button for button in app.button if button.label == "Run candidate scan").click().run(timeout=30)
    assert not app.exception
    values = {metric.label: metric.value for metric in app.metric}
    assert values["Input length"] == "1,000 nt"
    assert values["Candidates"] == "10"
    assert values["Model"] in {
        "Logistic regression",
        "Random Forest",
        "Extra Trees",
        "Histogram Gradient Boosting",
    }
    assert [radio.label for radio in app.radio] == ["Structure view"]
    assert app.radio[0].value == "ViennaRNA 2D"
    app.radio[0].set_value("Base-pair arcs").run()
    assert not app.exception
    assert app.radio[0].value == "Base-pair arcs"


def test_external_control_displays_primary_machinery_evidence():
    app = AppTest.from_file(ROOT / "app.py", default_timeout=30).run()
    app.selectbox[0].select("External MIR630 — AGO2 RIP").run()
    next(button for button in app.button if button.label == "Load selected control").click().run()
    next(button for button in app.button if button.label == "Run candidate scan").click().run(timeout=30)

    assert not app.exception
    machinery_tables = [
        table.value for table in app.dataframe
        if "Candidate-specific result" in table.value.columns
    ]
    assert len(machinery_tables) == 1
    ago2 = machinery_tables[0].loc[machinery_tables[0]["Protein"] == "AGO2"].iloc[0]
    drosha = machinery_tables[0].loc[machinery_tables[0]["Protein"] == "DROSHA"].iloc[0]
    assert ago2["Candidate-specific result"] == "Supported interaction"
    assert ago2["Primary source"] == "https://pubmed.ncbi.nlm.nih.gov/38991944/"
    assert drosha["Candidate-specific result"] == "Not tested in bundled evidence"
    assert any("AGO2" in item.value for item in app.success)
