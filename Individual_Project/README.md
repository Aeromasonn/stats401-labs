# Individual Project — LLM Family Tree Critique and Redesign

This directory contains the submission-ready GitHub Pages implementation for the STATS 401 individual visualization critique and redesign project, pending final review.

## Selected visualization

- **Title:** LLM Family Tree
- **Creator:** Josh Janes
- **Live visualization:** https://jjanes.ca/llm-tree/
- **Source repository and data:** https://github.com/josh-janes/llm-tree
- **Original demonstration:** https://github.com/josh-janes/llm-tree/blob/main/llm-tree-banner.gif
- **Local data:** `data/graph.json`

The original is a directed node-link visualization of influential language models and research contributions from 2017–2026. The source notes that some relationships involving closed models are inferred from public papers and announcements.

## Page coverage

The page includes all required components from the Canvas instructions:

1. Original visualization, title, source, link, and data description.
2. Intended message, audience, and viewer tasks.
3. Two strengths and three evidence-based weaknesses.
4. A working D3 redesign using external JSON data.
5. Three redesign decisions and an original-versus-redesign comparison.
6. Data sources, references, limitations, and source attribution.

The four Part 5 explanations are each 150–200 words and together form a report-length design rationale.

## Redesign encodings

- **Horizontal position:** publication date on a continuous 2017–2026 scale.
- **Vertical position:** broad organization swimlane.
- **Color:** broad organization group.
- **Point size:** number of direct descendants, calculated as the node's outgoing-link count in `graph.json`.
- **Links:** hidden by default and shown only for the selected node.

The size legend uses reference values from the data. The maximum is 20 direct descendants. Size does not represent parameter count, compute, popularity, or benchmark performance.

## Interactions

- Search by model or organization.
- Filter by organization group.
- Show all model labels.
- Select a point to display its description, source, predecessors, descendants, and direct-descendant count.
- Select a connected model in the detail panel to continue exploring.

## Run locally

From the repository root:

```powershell
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/Individual_Project/
```

## Files

- `index.html` — complete critique, redesign, explanations, and references
- `style.css` — simple course-site-aligned styling
- `main.js` — D3 rendering and interactions
- `data/graph.json` — external lineage dataset from the selected source
- `llm-tree-original/llm-tree-banner.gif` — attributed original demonstration
