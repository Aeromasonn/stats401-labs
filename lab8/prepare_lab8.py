"""Prepare passage, embedding, topic, and matrix data for Lab 8."""

from __future__ import annotations

import json
import os
import re
import tempfile
from collections import defaultdict
from pathlib import Path

os.environ.setdefault(
    "NUMBA_CACHE_DIR", str(Path(tempfile.gettempdir()) / "stats401_lab8_numba_cache")
)

import numpy as np
import pandas as pd
import pdfplumber
import umap
from sentence_transformers import SentenceTransformer
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "data" / "V2021-22_DKU_UG_Bulletin.pdf"
PASSAGES_PATH = ROOT / "data" / "lab8_bulletin_passages.csv"
MAP_PATH = ROOT / "data" / "lab8_embedding_map.csv"
MATRIX_PATH = ROOT / "data" / "lab8_topic_section_matrix.csv"
SUMMARY_PATH = ROOT / "data" / "lab8_corpus_summary.json"
TOPIC_REVIEW_PATH = Path(__file__).with_name("topic_review.txt")

MODEL_NAME = "all-MiniLM-L6-v2"
N_CLUSTERS = 8
RANDOM_STATE = 401
ACCESSED_DATE = "2026-09-23"


def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([,.;:!?])", r"\1", text)
    text = re.sub(r"(?<=\w)\s+-\s+(?=\w)", "-", text)
    return text


def page_lines(page) -> list[dict]:
    words = page.extract_words(extra_attrs=["size", "fontname"], use_text_flow=True)
    grouped = defaultdict(list)
    for word in words:
        grouped[round(word["top"], 1)].append(word)

    lines = []
    for top, row in sorted(grouped.items()):
        row.sort(key=lambda word: word["x0"])
        text = clean_text(" ".join(word["text"] for word in row))
        if not text:
            continue
        lines.append({
            "top": top,
            "text": text,
            "size": max(float(word["size"]) for word in row),
            "bold": any("Bold" in word["fontname"] for word in row),
        })
    return lines


def is_page_number(line: dict, page_number: int) -> bool:
    return line["top"] > 720 and line["text"] == str(page_number)


def heading_level(line: dict) -> str | None:
    text = line["text"]
    size = line["size"]
    if re.match(r"^Part \d+:\s", text) and size >= 15:
        return "chapter"
    if size >= 13.5 and line["bold"]:
        return "section"
    if size >= 11.8 and line["bold"]:
        return "subsection"
    if size >= 10.8 and line["bold"] and (
        re.match(r"^[A-Z]{2,12}\s+\d", text)
        or text.endswith(":")
        or "Prerequisite(s)" in text
    ):
        return "block"
    return None


def join_wrapped_heading(lines: list[dict], index: int, level: str) -> tuple[str, int]:
    parts = [lines[index]["text"]]
    next_index = index + 1
    while next_index < len(lines):
        current = lines[next_index]
        if heading_level(current) != level:
            break
        if current["top"] - lines[next_index - 1]["top"] > 17:
            break
        parts.append(current["text"])
        next_index += 1
    return clean_text(" ".join(parts)), next_index


def extract_passages() -> tuple[pd.DataFrame, int]:
    records = []
    chapter = "General Information"
    section = "General Information"
    subsection = ""
    passage_lines: list[str] = []
    passage_page = 10
    previous_top = None

    def flush() -> None:
        nonlocal passage_lines
        text = clean_text(" ".join(passage_lines))
        if text:
            records.append({
                "chapter": chapter,
                "section": section,
                "subsection": subsection,
                "page": passage_page,
                "text": text,
            })
        passage_lines = []

    with pdfplumber.open(PDF_PATH) as pdf:
        # Pages 1-9 are cover material and the table of contents.
        for page_number, page in enumerate(pdf.pages[9:], start=10):
            lines = [line for line in page_lines(page) if not is_page_number(line, page_number)]
            index = 0
            previous_top = None
            while index < len(lines):
                line = lines[index]
                level = heading_level(line)
                if level in {"chapter", "section", "subsection"}:
                    flush()
                    heading, index = join_wrapped_heading(lines, index, level)
                    if level == "chapter":
                        chapter = heading
                        section = heading
                        subsection = ""
                    elif level == "section":
                        section = heading
                        subsection = ""
                    else:
                        # Subject and major headings are useful matrix rows; other
                        # 12-point headings remain subsections of the current section.
                        is_major_heading = (
                            85 <= page_number < 217
                            and not re.match(r"^[A-Z]{2,12}\s+\d", heading)
                            and not re.match(r"^(Fall|Spring|Summer)\s+\d{4}$", heading)
                            and not heading.lower().startswith("prerequisite")
                            and heading not in {"2025 and Beyond", "of 2022-2024"}
                        )
                        if heading.startswith("Courses with Course Subject:") or is_major_heading:
                            section = heading
                            subsection = ""
                        else:
                            subsection = heading
                    previous_top = None
                    continue

                if level == "block":
                    flush()
                    subsection, index = join_wrapped_heading(lines, index, level)
                    passage_lines = [subsection]
                    passage_page = page_number
                    previous_top = line["top"]
                    continue

                if previous_top is not None and line["top"] - previous_top > 20:
                    flush()
                if not passage_lines:
                    passage_page = page_number
                passage_lines.append(line["text"])
                previous_top = line["top"]
                index += 1
            flush()

    raw_count = len(records)
    frame = pd.DataFrame(records)
    frame["text_clean"] = frame["text"].map(clean_text)
    frame["word_count"] = frame["text_clean"].str.split().str.len()
    frame = frame[frame["word_count"] >= 12]
    frame = frame.drop_duplicates(subset=["text_clean"]).reset_index(drop=True)
    frame.insert(0, "passage_id", [f"p{index:04d}" for index in range(1, len(frame) + 1)])
    return frame, raw_count


def top_terms_by_group(texts: pd.Series, clusters: pd.Series) -> tuple[list[dict], dict[int, list[str]]]:
    vectorizer = TfidfVectorizer(
        stop_words="english", max_features=5000, min_df=3, max_df=0.9, ngram_range=(1, 2)
    )
    matrix = vectorizer.fit_transform(texts)
    terms = np.asarray(vectorizer.get_feature_names_out())

    overall_scores = np.asarray(matrix.mean(axis=0)).ravel()
    overall_order = overall_scores.argsort()[::-1][:15]
    overall = [
        {"term": terms[index], "score": round(float(overall_scores[index]), 5)}
        for index in overall_order
    ]

    cluster_terms = {}
    for cluster in sorted(clusters.unique()):
        scores = np.asarray(matrix[clusters.to_numpy() == cluster].mean(axis=0)).ravel()
        order = scores.argsort()[::-1][:12]
        cluster_terms[int(cluster)] = terms[order].tolist()
    return overall, cluster_terms


def write_topic_review(frame: pd.DataFrame, cluster_terms: dict[int, list[str]]) -> None:
    lines = [
        "LAB 8 CLUSTER REVIEW",
        "The display names for these numeric clusters are written directly in lab8/index.html.",
        "",
    ]
    for cluster in sorted(frame["cluster"].unique()):
        subset = frame[frame["cluster"] == cluster]
        lines.extend([
            f"CLUSTER {cluster} ({len(subset)} passages)",
            "Characteristic terms: " + ", ".join(cluster_terms[cluster]),
            "Representative passages:",
        ])
        for row in subset.sort_values("cluster_distance").head(8).itertuples():
            excerpt = row.text_clean[:360].replace("\n", " ")
            lines.append(f"- {row.passage_id} | {row.section} | p. {row.page}: {excerpt}")
        lines.append("")
    TOPIC_REVIEW_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    if not PDF_PATH.exists():
        raise FileNotFoundError(f"Missing source bulletin: {PDF_PATH}")

    frame, raw_count = extract_passages()
    frame.to_csv(PASSAGES_PATH, index=False, encoding="utf-8")

    model = SentenceTransformer(MODEL_NAME)
    embeddings = model.encode(
        frame["text_clean"].tolist(), normalize_embeddings=True, show_progress_bar=True
    )

    kmeans = KMeans(n_clusters=N_CLUSTERS, random_state=RANDOM_STATE, n_init="auto")
    frame["cluster"] = kmeans.fit_predict(embeddings)
    frame["cluster_distance"] = np.linalg.norm(
        embeddings - kmeans.cluster_centers_[frame["cluster"]], axis=1
    )

    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=15,
        min_dist=0.15,
        metric="cosine",
        random_state=RANDOM_STATE,
    )
    coordinates = reducer.fit_transform(embeddings)
    frame["x"] = coordinates[:, 0]
    frame["y"] = coordinates[:, 1]

    # Cosine similarity is a dot product because embeddings were normalized.
    similarity = embeddings @ embeddings.T
    np.fill_diagonal(similarity, -1)
    nearest = np.argsort(similarity, axis=1)[:, -5:][:, ::-1]
    frame["neighbor_ids"] = [
        "|".join(frame.iloc[indexes]["passage_id"].tolist()) for indexes in nearest
    ]
    frame["neighbor_scores"] = [
        "|".join(f"{similarity[row, index]:.4f}" for index in indexes)
        for row, indexes in enumerate(nearest)
    ]

    overall_terms, cluster_terms = top_terms_by_group(frame["text_clean"], frame["cluster"])
    write_topic_review(frame, cluster_terms)

    export_columns = [
        "passage_id", "chapter", "section", "subsection", "page", "text",
        "word_count", "cluster", "x", "y",
        "neighbor_ids", "neighbor_scores",
    ]
    frame[export_columns].to_csv(MAP_PATH, index=False, encoding="utf-8")

    matrix = (
        frame.groupby(["section", "cluster"], as_index=False)
        .size()
        .rename(columns={"size": "count"})
    )
    section_totals = frame.groupby("section").size().rename("section_total")
    matrix = matrix.join(section_totals, on="section")
    matrix["proportion"] = matrix["count"] / matrix["section_total"]
    matrix.to_csv(MATRIX_PATH, index=False, encoding="utf-8")

    section_counts = frame["section"].value_counts()
    section_average = frame.groupby("section")["word_count"].mean()
    summary = {
        "title": "Bulletin of Duke Kunshan University Undergraduate Instruction",
        "academic_year": "2021-2022",
        "source": "https://dku-web-admissions.s3.cn-north-1.amazonaws.com.cn/dkumain/files/V2021-22_DKU_UG_Bulletin.pdf",
        "accessed": ACCESSED_DATE,
        "raw_passages": raw_count,
        "clean_passages": int(len(frame)),
        "average_words": round(float(frame["word_count"].mean()), 1),
        "formal_sections": int(frame["section"].nunique()),
        "embedding_model": MODEL_NAME,
        "umap": {"n_neighbors": 15, "min_dist": 0.15, "metric": "cosine", "random_state": RANDOM_STATE},
        "clustering": {"method": "KMeans", "clusters": N_CLUSTERS, "random_state": RANDOM_STATE},
        "top_terms": overall_terms,
        "section_counts": [
            {
                "section": section,
                "count": int(count),
                "average_words": round(float(section_average[section]), 1),
            }
            for section, count in section_counts.items()
        ],
        "cluster_counts": [
            {"cluster": int(cluster), "count": int(count)}
            for cluster, count in frame["cluster"].value_counts().sort_index().items()
        ],
    }
    SUMMARY_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"Raw passages: {raw_count}")
    print(f"Clean passages: {len(frame)}")
    print(f"Formal sections: {frame['section'].nunique()}")
    print(f"Average words: {frame['word_count'].mean():.1f}")
    print(f"Wrote {MAP_PATH.name}, {MATRIX_PATH.name}, and {SUMMARY_PATH.name}")


if __name__ == "__main__":
    main()
