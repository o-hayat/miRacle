from __future__ import annotations

import html
import re
import tempfile
from pathlib import Path

from .structure import build_pair_table


BASE_COLORS = {"A": "#2dd4bf", "C": "#60a5fa", "G": "#f59e0b", "U": "#f472b6"}


def _style_vienna_svg(svg: str) -> str:
    """Make ViennaRNA's RNAplot SVG responsive and legible in the dark app."""
    # st.html expects an HTML fragment. RNAplot writes a standalone XML document,
    # whose declaration causes Streamlit's sanitizer to discard the entire block.
    svg = re.sub(r"^\s*<\?xml[^>]*>\s*", "", svg, count=1)
    size_match = re.search(r'<svg[^>]*height="([\d.]+)"[^>]*width="([\d.]+)"', svg)
    if size_match:
        height, width = size_match.groups()
        svg = re.sub(
            r"<svg([^>]*)>",
            rf'<svg\1 viewBox="0 0 {width} {height}" preserveAspectRatio="xMidYMid meet" '
            'role="img" aria-label="ViennaRNA minimum-free-energy secondary structure">',
            svg,
            count=1,
        )

    # Remove RNAplot's click-to-hide script/handler. The visualization is static in
    # Streamlit, and removing it makes the downloaded SVG safer and more portable.
    svg = re.sub(r"\s*<script.*?</script>", "", svg, flags=re.DOTALL)
    svg = re.sub(r"\s*<style.*?</style>", "", svg, flags=re.DOTALL)
    svg = re.sub(r'\s+onclick="[^"]*"', "", svg)
    svg = re.sub(
        r'<rect style="stroke: white; fill: white"',
        '<rect class="structure-background"',
        svg,
        count=1,
    )

    # ViennaRNA emits one text element per base. Add a base-specific class while
    # retaining every original coordinate and the native RNAplot layout.
    svg = re.sub(
        r'(<text class="nucleotide)("[^>]*>)([ACGU])(<\/text>)',
        lambda match: (
            f'{match.group(1)} nucleotide-{match.group(3).lower()}'
            f'{match.group(2)}{match.group(3)}{match.group(4)}'
        ),
        svg,
    )

    theme = """
  <title>ViennaRNA minimum-free-energy secondary structure</title>
  <desc>Nucleotides are colored by base; grey lines connect predicted base pairs.</desc>
  <style type="text/css">
    svg { width: 100%; height: auto; max-height: 520px; background: #08111f; }
    .structure-background { stroke: #08111f !important; fill: #08111f !important; }
    .nucleotide { font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important; font-weight: 700; font-size: 12px; }
    .nucleotide-a { fill: #2dd4bf !important; }
    .nucleotide-c { fill: #60a5fa !important; }
    .nucleotide-g { fill: #f59e0b !important; }
    .nucleotide-u { fill: #f472b6 !important; }
    .backbone { stroke: #64748b !important; fill: none; stroke-width: 1.8; }
    .basepairs { stroke: #cbd5e1 !important; fill: none; stroke-width: 2.1; opacity: 0.8; }
  </style>
"""
    return re.sub(r"(<svg[^>]*>)", rf"\1{theme}", svg, count=1)


def _vienna_svg(sequence: str, structure: str) -> str | None:
    try:
        import RNA  # type: ignore
    except ImportError:
        return None
    with tempfile.TemporaryDirectory(prefix="mirna-svg-") as directory:
        path = Path(directory) / "structure.svg"
        try:
            status = RNA.svg_rna_plot(sequence, structure, str(path))
            if status and path.exists():
                return _style_vienna_svg(path.read_text())
        except Exception:
            return None
    return None


def _arc_svg(sequence: str, structure: str) -> str:
    width, height, margin = 940, 340, 34
    count = max(1, len(sequence))
    step = (width - 2 * margin) / max(1, count - 1)
    baseline = height - 58
    table = build_pair_table(structure)
    elements = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="RNA secondary structure arc diagram">',
        '<rect width="100%" height="100%" rx="18" fill="#08111f"/>',
        '<text x="28" y="32" fill="#94a3b8" font-family="sans-serif" font-size="14">Base-pair connectivity (fallback arc layout)</text>',
    ]
    max_span = max((j - i for i, j in enumerate(table) if j > i), default=1)
    for i, j in enumerate(table):
        if j <= i:
            continue
        x1, x2 = margin + i * step, margin + j * step
        arc_height = 28 + 190 * ((j - i) / max_span)
        path = f"M {x1:.2f} {baseline:.2f} Q {(x1+x2)/2:.2f} {baseline-arc_height:.2f} {x2:.2f} {baseline:.2f}"
        elements.append(f'<path d="{path}" fill="none" stroke="#334155" stroke-width="1.4"/>')
    radius = max(2.2, min(5.0, step * 0.37))
    show_letters = step >= 8
    for i, base in enumerate(sequence):
        x = margin + i * step
        color = BASE_COLORS.get(base, "#cbd5e1")
        elements.append(f'<circle cx="{x:.2f}" cy="{baseline}" r="{radius:.2f}" fill="{color}"/>')
        if show_letters:
            elements.append(
                f'<text x="{x:.2f}" y="{baseline+20}" text-anchor="middle" fill="#cbd5e1" font-family="monospace" font-size="8">{html.escape(base)}</text>'
            )
    elements.append("</svg>")
    return "".join(elements)


def structure_visual(sequence: str, structure: str, layout: str = "vienna") -> tuple[str, str]:
    """Return an SVG and a human-readable renderer label.

    The ViennaRNA layout is preferred and generated entirely offline. The arc
    renderer is both a user-selectable alternate view and the automatic fallback
    when the optional ViennaRNA Python binding is unavailable.
    """
    if layout == "arc":
        return _arc_svg(sequence, structure), "Base-pair arc diagram"
    vienna = _vienna_svg(sequence, structure)
    if vienna is not None:
        return vienna, "ViennaRNA RNAplot"
    return _arc_svg(sequence, structure), "Base-pair arc diagram (ViennaRNA renderer unavailable)"


def structure_svg(sequence: str, structure: str, layout: str = "vienna") -> str:
    return structure_visual(sequence, structure, layout)[0]
