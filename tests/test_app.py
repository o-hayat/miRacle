from pathlib import Path

from streamlit.testing.v1 import AppTest


ROOT = Path(__file__).resolve().parent.parent


def test_app_loads_and_analyzes_bundled_positive():
    app = AppTest.from_file(ROOT / "app.py", default_timeout=30).run()
    assert not app.exception
    assert any("miRacle" in item.value for item in app.markdown)
    assert [tab.label for tab in app.tabs] == [
        "Discover", "Compare controls", "Evidence", "Evaluation", "Science & limitations"
    ]
    assert any(button.label == "Run comparison" for button in app.button)
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
    next(box for box in app.selectbox if box.label == "Example").select(
        "External MIR630 — AGO2 RIP"
    ).run()
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


def test_default_control_comparison_separates_positive_and_negative():
    app = AppTest.from_file(ROOT / "app.py", default_timeout=60).run()
    next(button for button in app.button if button.label == "Run comparison").click().run(
        timeout=60
    )

    assert not app.exception
    values = {metric.label: metric.value for metric in app.metric}
    assert values["Positive top score"] == "99.5/100"
    assert values["Negative top score"] == "4.8/100"
    assert values["Score separation"] == "+94.8 points"
    assert values["Decision threshold"] == "81.2/100"
    assert any("Expected contrast" in item.value for item in app.success)

    comparison_tables = [
        table.value for table in app.dataframe if "Measure" in table.value.columns
    ]
    assert len(comparison_tables) == 1
    table = comparison_tables[0]
    assert set(table.columns) == {
        "Measure",
        "MIR21 known-locus control",
        "Unannotated genomic control",
    }
    assert table.loc[table["Measure"] == "Precursor-likeness"].iloc[0].tolist() == [
        "Precursor-likeness",
        "99.5/100",
        "4.8/100",
    ]


def test_coordinate_input_loads_bundled_hg38_region():
    app = AppTest.from_file(ROOT / "app.py", default_timeout=30).run()
    next(box for box in app.selectbox if box.label == "Input method").select(
        "hg38 genomic coordinates"
    ).run()
    next(button for button in app.button if button.label == "Load region").click().run()

    assert not app.exception
    sequence = next(area for area in app.text_area if area.label == "Sequence or FASTA").value
    assert sequence.startswith(">hg38_chr17_59840773_59841772 chr17:59840773-59841772 hg38")
    assert len("".join(sequence.splitlines()[1:])) == 1_000
    assert any("Loaded chr17:59,840,773–59,841,772" in item.value for item in app.success)
