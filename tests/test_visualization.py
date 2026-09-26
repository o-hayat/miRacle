from mirna_app.visualization import structure_visual


SEQUENCE = "GC" * 9 + "A" * 7 + "GC" * 9
STRUCTURE = "(" * 18 + "." * 7 + ")" * 18


def test_vienna_structure_visual_is_accessible_and_colored():
    svg, renderer = structure_visual(SEQUENCE, STRUCTURE)

    assert "<svg" in svg
    assert "role=\"img\"" in svg
    assert "ViennaRNA" in renderer
    assert "nucleotide-g" in svg
    assert "#f59e0b" in svg
    assert "onclick=" not in svg
    assert "<script" not in svg


def test_arc_structure_visual_can_be_selected_explicitly():
    svg, renderer = structure_visual(SEQUENCE, STRUCTURE, layout="arc")

    assert renderer == "Base-pair arc diagram"
    assert "RNA secondary structure arc diagram" in svg
    assert "fallback arc layout" in svg
