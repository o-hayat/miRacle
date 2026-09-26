from __future__ import annotations

import csv
import io
import json
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import streamlit as st
import streamlit.components.v1 as components

from mirna_app.evidence import (
    BIOGENESIS_PROTEINS,
    evidence_level,
    literature_context,
    machinery_evidence,
    mature_arms,
)
from mirna_app.pipeline import analyze
from mirna_app.sequence import SequenceValidationError, infer_input_type
from mirna_app.types import AnalysisResult, CandidateResult
from mirna_app.visualization import structure_visual


ROOT = Path(__file__).resolve().parent
EXAMPLES = ROOT / "assets" / "examples"
METRICS_PATH = ROOT / "artifacts" / "evaluation" / "metrics.json"

st.set_page_config(page_title="MIR-NA", page_icon="🧬", layout="wide")
st.markdown(
    """
    <style>
    header[data-testid="stHeader"], [data-testid="stAppHeader"], [data-testid="stToolbar"], [data-testid="stDecoration"] {display:none !important; height:0 !important;}
    [data-testid="stAppViewContainer"] {margin-top:0 !important;}
    .stApp {background: radial-gradient(circle at 12% 0%, #10233d 0%, #07101d 36%, #050a12 100%);}
    .block-container {max-width: 1220px; padding-top: 1rem;}
    .hero-kicker {color:#2dd4bf; letter-spacing:.16em; font-weight:700; font-size:.78rem;}
    .hero-title {font-size:3.15rem; line-height:1; font-weight:760; color:#f8fafc; margin:.25rem 0 .7rem;}
    .hero-copy {font-size:1.05rem; color:#a8b6c8; max-width:760px;}
    .disclaimer {border:1px solid #334155; background:#0b1524; border-radius:12px; padding:.75rem 1rem; color:#a8b6c8;}
    .evidence {border:1px solid #25354b; background:linear-gradient(145deg,#0b1627,#0a1220); border-radius:16px; padding:1rem; min-height:120px;}
    .evidence-label {color:#7dd3fc; text-transform:uppercase; letter-spacing:.09em; font-size:.68rem; font-weight:700;}
    .evidence-value {color:#f8fafc; font-size:1.45rem; font-weight:700; margin-top:.25rem;}
    .evidence-note {color:#94a3b8; font-size:.8rem; margin-top:.35rem;}
    div[data-testid="stMetric"] {background:#0b1524; border:1px solid #25354b; padding:1rem; border-radius:14px;}
    </style>
    <div class="hero-kicker">EXPLAINABLE miRNA CANDIDATE TRIAGE</div>
    <div class="hero-title">MIR-NA</div>
    <div class="hero-copy">From a short human genomic sequence to a ranked, inspectable shortlist of precursor-miRNA-like hairpins.</div>
    """,
    unsafe_allow_html=True,
)
st.markdown(
    '<div class="disclaimer">Sequence-only candidate ranking—not experimental validation. Scores do not establish expression, precise processing, targets, function, or disease relevance.</div>',
    unsafe_allow_html=True,
)


def read_example(name: str) -> str:
    path = EXAMPLES / name
    return path.read_text() if path.exists() else ""


def set_example(name: str) -> None:
    st.session_state.sequence_input = read_example(name)


def result_frame(result: AnalysisResult) -> pd.DataFrame:
    rows = []
    for candidate in result.candidates:
        f = candidate.features
        rows.append(
            {
                "Rank": candidate.rank,
                "Candidate": candidate.id,
                "Coordinates": f"{candidate.start:,}–{candidate.end:,}",
                "Strand": candidate.strand,
                "Length": int(f["length"]),
                "Score": round(candidate.model_score * 100, 1),
                "MFE (kcal/mol)": round(candidate.mfe_kcal_mol, 2),
                "MFE/nt": round(f["mfe_per_nt"], 3),
                "Paired": f"{f['paired_fraction']:.0%}",
                "Nearest curated reference": candidate.nearest_reference.name,
            }
        )
    return pd.DataFrame(rows)


def candidates_csv(result: AnalysisResult) -> bytes:
    buffer = io.StringIO()
    fieldnames = [
        "rank", "id", "start", "end", "strand", "sequence_rna", "dot_bracket",
        "mfe_kcal_mol", "model_score", "nearest_reference", "identity", "coverage",
        "nearest_non_mirna", "non_mirna_identity", "non_mirna_coverage",
        "comparative_matches",
    ]
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for c in result.export_candidates:
        writer.writerow(
            {
                "rank": c.rank, "id": c.id, "start": c.start, "end": c.end,
                "strand": c.strand, "sequence_rna": c.sequence_rna,
                "dot_bracket": c.dot_bracket, "mfe_kcal_mol": c.mfe_kcal_mol,
                "model_score": c.model_score,
                "nearest_reference": c.nearest_reference.name,
                "identity": c.nearest_reference.identity,
                "coverage": c.nearest_reference.coverage,
                "nearest_non_mirna": c.nearest_non_mirna.name,
                "non_mirna_identity": c.nearest_non_mirna.identity,
                "non_mirna_coverage": c.nearest_non_mirna.coverage,
                "comparative_matches": "; ".join(
                    f"{match.species}:{match.name}:{match.identity:.3f}:{match.coverage:.3f}"
                    for match in c.comparative_matches
                ),
            }
        )
    return buffer.getvalue().encode("utf-8")


def candidates_fasta(result: AnalysisResult) -> bytes:
    records = []
    for c in result.export_candidates:
        records.append(
            f">{c.id} relative={c.start}-{c.end}({c.strand}) score={c.model_score:.4f}\n{c.sequence_rna}"
        )
    return ("\n".join(records) + "\n").encode("utf-8")


def position_figure(result: AnalysisResult) -> go.Figure:
    figure = go.Figure()
    figure.add_trace(
        go.Scatter(
            x=[1, result.input_length], y=[0, 0], mode="lines",
            line={"color": "#334155", "width": 8}, hoverinfo="skip", showlegend=False,
        )
    )
    for candidate in result.candidates:
        y = 0.36 if candidate.strand == "+" else -0.36
        color_value = candidate.model_score
        figure.add_trace(
            go.Scatter(
                x=[candidate.start, candidate.end], y=[y, y], mode="lines+markers",
                line={"color": f"hsl({165 + color_value * 45}, 75%, 55%)", "width": 10},
                marker={"size": 7}, name=candidate.id,
                customdata=[[candidate.model_score * 100], [candidate.model_score * 100]],
                hovertemplate=(
                    f"<b>{candidate.id}</b><br>{candidate.start:,}–{candidate.end:,} ({candidate.strand})"
                    "<br>score %{customdata[0]:.1f}<extra></extra>"
                ),
            )
        )
    figure.update_layout(
        height=245, margin={"l": 20, "r": 20, "t": 30, "b": 25},
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        xaxis={"title": "Position in submitted sequence (nt)", "gridcolor": "#172235"},
        yaxis={"tickvals": [-0.36, 0.36], "ticktext": ["− strand", "+ strand"], "range": [-0.8, 0.8], "gridcolor": "#172235"},
        showlegend=False, font={"color": "#a8b6c8"},
    )
    return figure


def influence_figure(candidate: CandidateResult) -> go.Figure:
    ordered = list(reversed(candidate.influences))
    figure = go.Figure(
        go.Bar(
            x=[item.delta_score * 100 for item in ordered],
            y=[item.feature for item in ordered],
            orientation="h",
            marker_color=["#2dd4bf" if item.delta_score >= 0 else "#fb7185" for item in ordered],
            hovertemplate="%{y}: %{x:+.2f} score points<extra></extra>",
        )
    )
    figure.update_layout(
        height=280, margin={"l": 10, "r": 10, "t": 15, "b": 30},
        paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)",
        xaxis={"title": "One-feature sensitivity (score points)", "gridcolor": "#172235"},
        yaxis={"gridcolor": "#172235"}, font={"color": "#a8b6c8"},
    )
    return figure


def evidence_card(label: str, value: str, note: str) -> None:
    st.markdown(
        f'<div class="evidence"><div class="evidence-label">{label}</div><div class="evidence-value">{value}</div><div class="evidence-note">{note}</div></div>',
        unsafe_allow_html=True,
    )


def confusion_figure(confusion: dict[str, int]) -> go.Figure:
    raw = [
        [confusion["tn"], confusion["fp"]],
        [confusion["fn"], confusion["tp"]],
    ]
    row_totals = [max(1, sum(row)) for row in raw]
    labels = [["TN", "FP"], ["FN", "TP"]]
    normalized = [
        [raw[row][column] / row_totals[row] for column in range(2)]
        for row in range(2)
    ]
    text = [
        [
            f"{labels[row][column]}<br>{raw[row][column]}<br>{normalized[row][column]:.1%}"
            for column in range(2)
        ]
        for row in range(2)
    ]
    figure = go.Figure(
        go.Heatmap(
            z=normalized,
            x=["Predicted negative", "Predicted positive"],
            y=["Actual negative", "Actual positive"],
            text=text,
            texttemplate="%{text}",
            colorscale=[[0, "#0b1524"], [0.5, "#2563eb"], [1, "#2dd4bf"]],
            showscale=False,
            customdata=raw,
            hovertemplate="%{y}<br>%{x}<br>Count: %{customdata}<br>Row fraction: %{z:.1%}<extra></extra>",
        )
    )
    figure.update_layout(
        height=330,
        margin={"l": 20, "r": 20, "t": 20, "b": 20},
        paper_bgcolor="rgba(0,0,0,0)",
        plot_bgcolor="rgba(0,0,0,0)",
        font={"color": "#cbd5e1"},
    )
    return figure


discover_tab, evidence_tab, evaluation_tab, science_tab = st.tabs(
    ["Discover", "Evidence", "Evaluation", "Science & limitations"]
)
selected_candidate: CandidateResult | None = None

with discover_tab:
    st.subheader("Analyze a short human sequence")
    controls, input_column = st.columns([0.30, 0.70], gap="large")
    with controls:
        st.caption("Bundled controls")
        control_options = {
            "MIR21 positive control": "mir21_region.fa",
            "External MIR630 — AGO2 RIP": "external_ncbi_mirnas/nr_030359_mir630.fa",
            "External MIR632 — AGO2 RIP": "external_ncbi_mirnas/nr_030362_mir632.fa",
            "External MIR663A — AGO2 RIP": "external_ncbi_mirnas/nr_030386_mir663a.fa",
            "External MIR1207 — AGO2 RIP": "external_ncbi_mirnas/nr_031612_mir1207.fa",
            "External MIR1290 — AGO2 RIP": "external_ncbi_mirnas/nr_031622_mir1290.fa",
            "External MIR1225 — DROSHA processing": "external_ncbi_mirnas/nr_030646_mir1225.fa",
            "External MIR1228 — DROSHA processing": "external_ncbi_mirnas/nr_031597_mir1228.fa",
            "MIR630 genomic context (±500 nt)": "external_ncbi_mirnas_flanked/nr_030359_mir630_plusminus500.fa",
            "MIR632 genomic context (±500 nt)": "external_ncbi_mirnas_flanked/nr_030362_mir632_plusminus500.fa",
            "MIR663A genomic context (±500 nt)": "external_ncbi_mirnas_flanked/nr_030386_mir663a_plusminus500.fa",
            "MIR1207 genomic context (±500 nt)": "external_ncbi_mirnas_flanked/nr_031612_mir1207_plusminus500.fa",
            "MIR1290 genomic context (±500 nt)": "external_ncbi_mirnas_flanked/nr_031622_mir1290_plusminus500.fa",
            "MIR1225 genomic context (±500 nt)": "external_ncbi_mirnas_flanked/nr_030646_mir1225_plusminus500.fa",
            "MIR1228 genomic context (±500 nt)": "external_ncbi_mirnas_flanked/nr_031597_mir1228_plusminus500.fa",
            "Genomic negative control": "negative_control.fa",
            "Rfam tRNA control": "rfam_trna_control.fa",
            "Rfam rRNA control": "rfam_rrna_control.fa",
            "Rfam snoRNA control": "rfam_snorna_control.fa",
            "Rfam ribozyme control": "rfam_ribozyme_control.fa",
        }
        selected_control = st.selectbox("Example", list(control_options))
        st.button(
            "Load selected control",
            width="stretch",
            on_click=set_example,
            args=(control_options[selected_control],),
        )
        uploaded = st.file_uploader("Upload one FASTA or text record", type=["fa", "fasta", "txt"])
        mask_choice = st.selectbox(
            "Protein-region preprocessing",
            [
                "Mask protein-coding CDS (recommended)",
                "Mask all exons of protein-coding genes",
                "Do not mask protein regions",
            ],
            help=(
                "Applied only to genomic DNA whose FASTA header contains a length-matched "
                "hg38/GRCh38 chr:start-end interval. CDS masking preserves untranslated exonic "
                "regions where genuine miRNAs can occur; all-exon masking is more aggressive."
            ),
        )
        st.caption("Strand handling is automatic: sequences containing U but no T are treated as transcribed RNA; all other inputs are scanned on both strands.")
        st.caption("Input limit: 20,000 nt. Coordinates in results are relative to this input and are 1-based inclusive.")
    with input_column:
        if "sequence_input" not in st.session_state:
            st.session_state.sequence_input = read_example("mir21_region.fa")
        if uploaded is not None:
            st.session_state.sequence_input = uploaded.getvalue().decode("utf-8", errors="replace")
        sequence_text = st.text_area(
            "Sequence or FASTA", key="sequence_input", height=235,
            placeholder=">region_1\nACGTTGCA…",
        )
        analyze_clicked = st.button("Run candidate scan", type="primary", width="stretch")

    if analyze_clicked:
        try:
            with st.spinner("Folding candidate structures and ranking precursor-like hairpins…"):
                st.session_state.analysis_result = analyze(
                    sequence_text,
                    input_type=infer_input_type(sequence_text),
                    exclude_coding_exons=mask_choice != "Do not mask protein regions",
                    exon_mask_mode=(
                        "all_exons" if mask_choice == "Mask all exons of protein-coding genes" else "cds"
                    ),
                )
        except SequenceValidationError as error:
            st.error(str(error))
        except Exception as error:
            st.error(f"Analysis could not complete: {error}")

    result: AnalysisResult | None = st.session_state.get("analysis_result")
    if result:
        st.divider()
        metrics_columns = st.columns(4)
        metrics_columns[0].metric("Input length", f"{result.input_length:,} nt")
        metrics_columns[1].metric("Candidates", len(result.candidates))
        metrics_columns[2].metric("Runtime", f"{result.runtime_ms / 1000:.2f} s")
        metrics_columns[3].metric("Model", result.model_name)
        st.caption(f"Scanner: {result.scanner}")
        if result.genomic_interval:
            genes = ", ".join(result.overlapping_coding_genes[:8])
            if len(result.overlapping_coding_genes) > 8:
                genes += f" +{len(result.overlapping_coding_genes) - 8} more"
            st.caption(
                f"Coordinate-aware preprocessing: {result.genomic_interval} · "
                f"{result.masked_exonic_nt:,} annotated nt excluded ({result.exon_mask_mode})"
                + (f" · genes: {genes}" if genes else "")
            )
        for warning in result.warnings:
            st.warning(warning)

        if result.candidates:
            st.plotly_chart(position_figure(result), width="stretch", config={"displayModeBar": False})
            frame = result_frame(result)
            st.dataframe(frame, width="stretch", hide_index=True)

            download_left, download_right, _ = st.columns([0.18, 0.18, 0.64])
            download_left.download_button(
                "Download CSV", candidates_csv(result), "mirna_candidates.csv", "text/csv", width="stretch"
            )
            download_right.download_button(
                "Download FASTA", candidates_fasta(result), "mirna_candidates.fa", "text/plain", width="stretch"
            )

            selected_id = st.selectbox(
                "Inspect candidate",
                [candidate.id for candidate in result.candidates],
                format_func=lambda value: next(
                    f"#{c.rank} · {c.start:,}–{c.end:,} ({c.strand}) · {c.model_score * 100:.1f}/100"
                    for c in result.candidates if c.id == value
                ),
            )
            candidate = next(c for c in result.candidates if c.id == selected_id)
            selected_candidate = candidate
            st.session_state.selected_candidate_id = selected_id
            st.subheader(f"Candidate #{candidate.rank}")
            f = candidate.features
            cards = st.columns(4)
            with cards[0]:
                evidence_card("Precursor-likeness", f"{candidate.model_score * 100:.1f}/100", "Ranking score, not a biological probability")
            with cards[1]:
                evidence_card("Folding energy", f"{candidate.mfe_kcal_mol:.1f} kcal/mol", f"{f['mfe_per_nt']:.3f} kcal/mol/nt")
            with cards[2]:
                evidence_card("Hairpin pairing", f"{f['paired_fraction']:.0%}", f"{int(f['pair_count'])} pairs · stem {int(f['longest_stem'])}")
            with cards[3]:
                match = candidate.nearest_reference
                evidence_card("Nearest reference", match.name, f"{match.identity:.0%} identity · {match.coverage:.0%} reference coverage")

            level, level_note = evidence_level(candidate)
            decoy = candidate.nearest_non_mirna
            evidence_cards = st.columns(2)
            with evidence_cards[0]:
                evidence_card("Evidence level", level, level_note)
            with evidence_cards[1]:
                evidence_card(
                    "Nearest non-miRNA decoy",
                    decoy.name.split("|")[1] if "|" in decoy.name else decoy.name,
                    f"{decoy.identity:.0%} identity · {decoy.coverage:.0%} reference coverage",
                )

            structure_column, explanation_column = st.columns([0.57, 0.43], gap="large")
            with structure_column:
                st.markdown("#### Predicted secondary structure")
                layout_label = st.radio(
                    "Structure view",
                    ["ViennaRNA 2D", "Base-pair arcs"],
                    horizontal=True,
                    key=f"structure-view-{candidate.id}",
                )
                layout = "vienna" if layout_label == "ViennaRNA 2D" else "arc"
                svg, renderer = structure_visual(candidate.sequence_rna, candidate.dot_bracket, layout)
                # Inline SVG is isolated in a local component because st.html's
                # sanitizer removes SVG elements and st.image does not decode SVG.
                components.html(
                    '<style>html,body{margin:0;background:#08111f;overflow:hidden}'
                    'svg{display:block;margin:auto}</style>' + svg,
                    height=520,
                    scrolling=False,
                )
                st.markdown(
                    '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:-2px 0 10px;color:#94a3b8;font-size:.82rem">'
                    '<span><b style="color:#2dd4bf">A</b> adenine</span>'
                    '<span><b style="color:#60a5fa">C</b> cytosine</span>'
                    '<span><b style="color:#f59e0b">G</b> guanine</span>'
                    '<span><b style="color:#f472b6">U</b> uracil</span>'
                    '</div>',
                    unsafe_allow_html=True,
                )
                structure_actions = st.columns([0.52, 0.48])
                structure_actions[0].caption(
                    f"{renderer} · minimum-free-energy fold · {len(candidate.sequence_rna)} nt"
                )
                structure_actions[1].download_button(
                    "Download structure SVG",
                    data=svg.encode("utf-8"),
                    file_name=f"{candidate.id}_structure.svg",
                    mime="image/svg+xml",
                    width="stretch",
                    key=f"download-structure-{candidate.id}-{layout}",
                )
                with st.expander("Sequence and dot-bracket notation"):
                    st.code(candidate.sequence_rna + "\n" + candidate.dot_bracket, language=None)
            with explanation_column:
                st.markdown("#### Why it ranked here")
                for line in candidate.summary:
                    st.markdown(f"- {line}")
                st.plotly_chart(influence_figure(candidate), width="stretch", config={"displayModeBar": False})
                st.caption("Influences replace one feature at a time with the training median. They are local sensitivity estimates, not causal effects or additive SHAP values.")

            with st.expander("Evidence this analysis does not provide", expanded=True):
                for limitation in candidate.limitations:
                    st.markdown(f"- {limitation}")

with evidence_tab:
    st.subheader("Evidence ladder and protein context")
    st.caption(
        "Computed resemblance, curated identity, processing machinery, and validated downstream targets are different evidence types. MIR-NA keeps them separate."
    )
    if selected_candidate is None:
        st.info("Run an analysis and select a candidate to inspect its evidence chain.")
    else:
        candidate = selected_candidate
        match = candidate.nearest_reference
        decoy = candidate.nearest_non_mirna
        arms = mature_arms(candidate)
        protein_evidence = machinery_evidence(candidate)
        level, level_note = evidence_level(candidate)
        evidence_rows = [
            {
                "Layer": "Predicted secondary structure",
                "Status": "Available",
                "Evidence type": "Computed",
                "What it supports": "The sequence can form a local hairpin under the folding model.",
                "What it does not prove": "Expression or biological processing",
            },
            {
                "Layer": "Supervised model",
                "Status": f"{candidate.model_score * 100:.1f}/100",
                "Evidence type": "Learned resemblance",
                "What it supports": "Similarity to curated precursors versus genomic and Rfam decoys.",
                "What it does not prove": "A calibrated probability or causal mechanism",
            },
            {
                "Layer": "Curated precursor match",
                "Status": f"{match.identity:.0%} identity / {match.coverage:.0%} coverage",
                "Evidence type": "Independent sequence annotation",
                "What it supports": "Known-like sequence when both values are high.",
                "What it does not prove": "Activity in the submitted sample",
            },
            {
                "Layer": "Rfam non-miRNA conflict",
                "Status": f"{decoy.identity:.0%} identity / {decoy.coverage:.0%} coverage",
                "Evidence type": "Alternative-family sequence match",
                "What it supports": "A warning when the sequence resembles another structured RNA.",
                "What it does not prove": "That a distant match excludes miRNA function",
            },
            {
                "Layer": "Mature-arm annotation",
                "Status": ", ".join(name for name, _ in arms) if arms else "Unavailable",
                "Evidence type": "Curated after an exact external-control segment or near-exact reference match",
                "What it supports": "Known mature sequence and arm for downstream lookup.",
                "What it does not prove": "De novo cleavage boundaries for a novel candidate",
            },
            {
                "Layer": "miRNA-machinery experiment",
                "Status": ", ".join(sorted({item.protein for item in protein_evidence})) if protein_evidence else "No bundled candidate-specific study",
                "Evidence type": "RIP, biochemical processing, or dependency perturbation",
                "What it supports": "Only the specific protein result reported in the linked primary study.",
                "What it does not prove": "Interaction with every canonical machinery protein",
            },
        ]
        st.markdown(f"#### Overall evidence label: **{level}**")
        st.caption(level_note)
        st.dataframe(pd.DataFrame(evidence_rows), width="stretch", hide_index=True)

        st.markdown("#### Cross-species precursor similarity")
        st.caption(
            "These are independent sequence matches and are not model inputs. A similar precursor in another species supports family-level known-likeness, not conservation of the submitted genomic locus."
        )
        st.dataframe(
            pd.DataFrame(
                [
                    {
                        "Species": item.species,
                        "Nearest precursor": item.name,
                        "Strength": (
                            "Near-exact"
                            if item.identity >= 0.90 and item.coverage >= 0.85
                            else "Moderate"
                            if item.identity >= 0.75 and item.coverage >= 0.70
                            else "Weak"
                        ),
                        "Identity": item.identity,
                        "Reference coverage": item.coverage,
                        "Reference source": item.source,
                    }
                    for item in candidate.comparative_matches
                ]
            ).style.format({"Identity": "{:.1%}", "Reference coverage": "{:.1%}"}),
            width="stretch",
            hide_index=True,
        )

        literature = literature_context(candidate)
        st.markdown("#### Curated literature context")
        if literature:
            st.markdown(f"**{literature.display_name}.** {literature.summary}")
            st.caption(f"Evidence used in the cited study: {literature.evidence}")
            st.warning(literature.caveat)
            st.link_button(literature.source_label, literature.source_url)
        elif match.identity >= 0.90 and match.coverage >= 0.85:
            st.info(
                "This is a strong reference match, but MIR-NA does not yet bundle a manually curated literature card for it. No summary is generated automatically."
            )
        else:
            st.info("Literature context is shown only for a strong human curated-reference match.")

        st.markdown("#### Mature sequence evidence")
        if arms:
            st.dataframe(
                pd.DataFrame([{"Curated arm": name, "Sequence": sequence} for name, sequence in arms]),
                width="stretch",
                hide_index=True,
            )
        else:
            st.info("Mature arms are not inferred for a candidate without a near-exact curated precursor match.")

        st.markdown("#### miRNA-associated protein machinery")
        if protein_evidence:
            supported = sorted({
                item.protein for item in protein_evidence
                if item.result.startswith("Supported")
            })
            st.success(
                "Candidate-specific experimental evidence: "
                + (", ".join(supported) if supported else "pathway dependency was experimentally tested")
            )
        else:
            st.info(
                "No candidate-specific machinery experiment is bundled for this sequence. The canonical roles remain biological context, not inferred interactions."
            )

        machinery_rows = []
        for protein in BIOGENESIS_PROTEINS:
            matching = [item for item in protein_evidence if item.protein == protein.symbol]
            if matching:
                machinery_rows.append(
                    {
                        "Protein": protein.symbol,
                        "Stage": protein.stage,
                        "Canonical role": protein.relationship,
                        "Candidate-specific result": " / ".join(item.result for item in matching),
                        "Evidence": " / ".join(item.evidence_type for item in matching),
                        "Experiment and context": " / ".join(
                            f"{item.experiment} ({item.biological_context})" for item in matching
                        ),
                        "Primary source": matching[0].source_url,
                    }
                )
            else:
                machinery_rows.append(
                    {
                        "Protein": protein.symbol,
                        "Stage": protein.stage,
                        "Canonical role": protein.relationship,
                        "Candidate-specific result": "Not tested in bundled evidence",
                        "Evidence": "—",
                        "Experiment and context": "—",
                        "Primary source": "",
                    }
                )
        st.dataframe(
            pd.DataFrame(machinery_rows),
            width="stretch",
            hide_index=True,
            column_config={"Primary source": st.column_config.LinkColumn("Primary source")},
        )
        st.caption(
            "Supported interaction requires candidate-specific RIP or biochemical binding/processing evidence. ‘Not tested’ means unknown here—not absent. ‘Not required’ is a pathway-dependency result, not proof that physical contact never occurs."
        )

with evaluation_tab:
    st.subheader("Held-out benchmark")
    st.caption(
        "Positive families, genomic regions, and Rfam ncRNA families are separated across splits. Similarity matching is excluded from the classifier."
    )
    if METRICS_PATH.exists():
        report = json.loads(METRICS_PATH.read_text())
        test = report["test"]
        selected = report["selection"]["selected_model"]
        selected_results = test[selected]
        summary_columns = st.columns(5)
        summary_columns[0].metric("Selected model", selected)
        summary_columns[1].metric("Precision", f"{selected_results['precision']:.3f}")
        summary_columns[2].metric("Recall", f"{selected_results['recall']:.3f}")
        summary_columns[3].metric("F1", f"{selected_results['f1']:.3f}")
        summary_columns[4].metric("PR-AUC", f"{selected_results['pr_auc']:.3f}")

        st.markdown("#### Model selection")
        validation_frame = pd.DataFrame(
            [
                {
                    "Model": name,
                    "Validation PR-AUC": value,
                    "Validation-selected threshold": report["selection"]["validation_thresholds"][name],
                    "Selected": "Yes" if name == selected else "No",
                }
                for name, value in report["selection"]["validation_pr_auc"].items()
            ]
        )
        st.dataframe(
            validation_frame.style.format(
                {"Validation PR-AUC": "{:.3f}", "Validation-selected threshold": "{:.3f}"}
            ),
            width="stretch",
            hide_index=True,
        )
        st.caption(
            "The model was selected only by validation PR-AUC. Test-set differences are reported but were not used to switch models."
        )

        st.markdown("#### Final test performance")
        rows = []
        for name, values in test.items():
            rows.append(
                {
                    "Method": name,
                    "Precision": values["precision"],
                    "Recall": values["recall"],
                    "F1": values["f1"],
                    "PR-AUC": values["pr_auc"],
                    "FP / 100 negatives": values["false_positives_per_100_negatives"],
                }
            )
        metrics_frame = pd.DataFrame(rows)
        st.dataframe(metrics_frame.style.format({column: "{:.3f}" for column in metrics_frame.columns if column != "Method"}), width="stretch", hide_index=True)
        chart = go.Figure()
        for metric, color in [("Precision", "#2dd4bf"), ("Recall", "#60a5fa"), ("F1", "#f59e0b"), ("PR-AUC", "#f472b6")]:
            chart.add_bar(name=metric, x=metrics_frame["Method"], y=metrics_frame[metric], marker_color=color)
        chart.update_layout(
            barmode="group", height=380, yaxis={"range": [0, 1], "gridcolor": "#172235"},
            paper_bgcolor="rgba(0,0,0,0)", plot_bgcolor="rgba(0,0,0,0)", font={"color": "#a8b6c8"},
        )
        st.plotly_chart(chart, width="stretch", config={"displayModeBar": False})
        confusion = test[selected]["confusion_matrix"]
        st.markdown(f"#### Confusion matrix — {selected}")
        st.plotly_chart(confusion_figure(confusion), width="stretch", config={"displayModeBar": False})
        st.caption(
            f"Raw counts at the validation-selected threshold {report['selection']['threshold']:.3f}; row percentages are shown inside each cell."
        )

        st.markdown("#### Negative-set stress tests")
        stratified_rows = []
        for subset, values in report.get("stratified_test", {}).items():
            stratified_rows.append(
                {
                    "Negative subset": subset.replace("_", " ").title(),
                    "Precision": values["precision"],
                    "Recall on shared positives": values["recall"],
                    "PR-AUC": values["pr_auc"],
                    "False positives / 100 negatives": values["false_positives_per_100_negatives"],
                }
            )
        st.dataframe(
            pd.DataFrame(stratified_rows).style.format(
                {
                    "Precision": "{:.3f}",
                    "Recall on shared positives": "{:.3f}",
                    "PR-AUC": "{:.3f}",
                    "False positives / 100 negatives": "{:.3f}",
                }
            ),
            width="stretch",
            hide_index=True,
        )
        with st.expander("Dataset composition and limitations", expanded=False):
            st.json(report["dataset"], expanded=True)
        for limitation in report["limitations"]:
            st.warning(limitation)
    else:
        st.info("Training metrics have not been generated yet. Run `python scripts/train_model.py` after fetching the training chromosomes.")

with science_tab:
    st.subheader("What the evidence means")
    st.markdown(
        """
        **Hairpin geometry and folding energy** identify thermodynamically plausible local stem-loops. Many genomic sequences can form hairpins, so these signals are necessary but not sufficient.

        **The supervised score** combines sequence and structure features learned from curated human precursors, candidate-like genomic negatives, and structurally plausible Rfam non-miRNA decoys. Logistic regression remains the selected model because it achieved the best validation PR-AUC; Random Forest, Extra Trees, and histogram gradient boosting are retained in the benchmark. It is a triage score, not proof or a calibrated probability of biological function.

        **Curated-reference similarity** is displayed separately. A close match supports “known-like”; a distant match does not prove novelty.

        **Cross-species similarity** compares the folded candidate with separate mouse, orangutan, chimpanzee, gorilla, and limited bottlenose-dolphin precursor panels. It can support family-level sequence similarity but is not a locus-level phylogenetic-conservation calculation and does not alter the classifier score.

        **Protein-region preprocessing** is coordinate-aware rather than sequence-guessed. With a length-matched hg38 FASTA interval, the default masks only annotated protein-coding CDS. An optional aggressive mode masks every exon of a protein-coding transcript, but this can remove genuine miRNAs in untranslated exonic regions. Without trustworthy coordinates, no gene/exon claim is made.

        **Rfam conflict evidence** asks whether the sequence closely resembles another structured RNA family. A close match is a warning, while a distant match cannot exclude every non-miRNA RNA class.

        **Protein-machinery evidence** distinguishes canonical roles from candidate-specific experiments. DROSHA, DGCR8, XPO5, DICER1, TARBP2, AGO2, and TNRC6A are not inferred binding partners merely because a candidate forms a hairpin. A “supported interaction” requires RIP or biochemical binding/processing evidence for the matched external control. “Tested—not required” describes pathway dependency and does not prove that physical contact is impossible.

        **Literature cards** are short, manually curated summaries shown only after a strong human reference match. They report evidence for the known miRNA in the cited experimental context; they are not evidence about expression or function of the submitted sample.

        **Missing evidence** includes transcription, tissue expression, precise mature/star processing, locus-level evolutionary conservation, RISC loading, mRNA targeting, pathway effects, and disease causality.

        The intended decision is: **which few candidate loci should a researcher investigate experimentally first?**
        """
    )
