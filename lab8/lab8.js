const status = d3.select("#load-status");
const tooltip = d3.select("#tooltip");
const formatCount = d3.format(",");
const topicColors = d3.schemeTableau10;
const topicLabels = new Map(
    [...document.querySelectorAll("#topic-filter option")]
        .filter(option => option.value !== "")
        .map(option => [+option.value, option.textContent.trim()])
);

let passages = [];
let passageById = new Map();
let pointSelection;
let matrixCells;
let matrixSelection = null;
let selectedPassage = null;
let neighborIds = new Set();
let selectedCell = null;
let zoomBehavior;
let mapSvg;

// Load the coordinated views from the same prepared corpus.
Promise.all([
    d3.csv("../data/lab8_embedding_map.csv", d => ({
        ...d,
        page: +d.page,
        word_count: +d.word_count,
        cluster: +d.cluster,
        x: +d.x,
        y: +d.y,
        neighbor_ids: d.neighbor_ids ? d.neighbor_ids.split("|") : [],
        neighbor_scores: d.neighbor_scores ? d.neighbor_scores.split("|").map(Number) : []
    })),
    d3.csv("../data/lab8_topic_section_matrix.csv", d => ({
        ...d,
        cluster: +d.cluster,
        count: +d.count,
        section_total: +d.section_total,
        proportion: +d.proportion
    })),
    d3.json("../data/lab8_corpus_summary.json")
]).then(([passageData, matrixData, summary]) => {
    if (!passageData.length || !matrixData.length) throw new Error("Lab 8 data files are empty.");
    passages = passageData;
    passageById = new Map(passages.map(d => [d.passage_id, d]));

    drawTermChart(summary.top_terms);
    drawSectionChart(summary.section_counts.slice(0, 15));
    setupFilters();
    drawTopicLegend();
    drawSemanticMap();
    drawMatrix(matrixData);
    connectControls();
}).catch(error => {
    console.error("Unable to load Lab 8 data:", error);
    status.classed("error", true).text(
        "Unable to load the Lab 8 CSV/JSON files. Run lab8/prepare_lab8.py and serve the repository through HTTP."
    );
});

function drawTermChart(data) {
    const width = 500, height = 380;
    const margin = { top: 10, right: 28, bottom: 50, left: 125 };
    const x = d3.scaleLinear().domain([0, d3.max(data, d => d.score)]).nice()
        .range([margin.left, width - margin.right]);
    const y = d3.scaleBand().domain(data.map(d => d.term))
        .range([margin.top, height - margin.bottom]).padding(0.18);
    const svg = d3.select("#term-chart").append("svg").attr("viewBox", `0 0 ${width} ${height}`);

    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(4));
    svg.append("text").attr("class", "chart-label").attr("text-anchor", "middle")
        .attr("x", (margin.left + width - margin.right) / 2).attr("y", height - 8)
        .text("Mean TF-IDF score");
    svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).tickSize(0)).call(g => g.select(".domain").remove());
    svg.selectAll("rect").data(data).join("rect")
        .attr("x", margin.left).attr("y", d => y(d.term)).attr("height", y.bandwidth())
        .attr("width", d => x(d.score) - margin.left).attr("fill", "#4c78a8");
}

function drawSectionChart(data) {
    const width = 650, height = 380;
    const margin = { top: 10, right: 45, bottom: 50, left: 285 };
    const x = d3.scaleLinear().domain([0, d3.max(data, d => d.count)]).nice()
        .range([margin.left, width - margin.right]);
    const y = d3.scaleBand().domain(data.map(d => d.section))
        .range([margin.top, height - margin.bottom]).padding(0.18);
    const svg = d3.select("#section-chart").append("svg").attr("viewBox", `0 0 ${width} ${height}`);

    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d3.format("d")));
    svg.append("text").attr("class", "chart-label").attr("text-anchor", "middle")
        .attr("x", (margin.left + width - margin.right) / 2).attr("y", height - 8)
        .text("Number of passages");
    svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).tickSize(0).tickFormat(d => shortLabel(d)))
        .call(g => g.select(".domain").remove());
    svg.selectAll("rect").data(data).join("rect")
        .attr("x", margin.left).attr("y", d => y(d.section)).attr("height", y.bandwidth())
        .attr("width", d => x(d.count) - margin.left).attr("fill", "#72a57a");
    svg.selectAll(".bar-value").data(data).join("text").attr("class", "chart-label bar-value")
        .attr("x", d => x(d.count) + 4).attr("y", d => y(d.section) + y.bandwidth() / 2 + 4)
        .text(d => d.count);
}

function setupFilters() {
    const sections = [...new Set(passages.map(d => d.section))].sort(d3.ascending);
    d3.select("#section-filter").selectAll("option.section-option").data(sections).join("option")
        .attr("class", "section-option").attr("value", d => d).text(d => d);
}

function topicName(cluster) {
    return topicLabels.get(cluster) || `Cluster ${cluster}`;
}

function topicColor(cluster) {
    return topicColors[cluster % topicColors.length];
}

function drawTopicLegend() {
    d3.select("#topic-legend").selectAll(".legend-item").each(function () {
        const cluster = +this.dataset.cluster;
        d3.select(this).select(".legend-swatch").style("background", topicColor(cluster));
    });
}

function drawSemanticMap() {
    const width = 860, height = 610;
    const margin = { top: 22, right: 22, bottom: 22, left: 22 };
    const x = d3.scaleLinear().domain(d3.extent(passages, d => d.x)).nice()
        .range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain(d3.extent(passages, d => d.y)).nice()
        .range([height - margin.bottom, margin.top]);
    const radius = d3.scaleSqrt().domain(d3.extent(passages, d => d.word_count)).range([2.2, 8]);

    mapSvg = d3.select("#semantic-map").append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", "UMAP semantic embedding map of bulletin passages");
    const zoomLayer = mapSvg.append("g");
    zoomLayer.append("rect").attr("x", margin.left).attr("y", margin.top)
        .attr("width", width - margin.left - margin.right)
        .attr("height", height - margin.top - margin.bottom)
        .attr("fill", "#fbfdff").attr("stroke", "#d7dde5");

    pointSelection = zoomLayer.selectAll("circle.passage").data(passages, d => d.passage_id).join("circle")
        .attr("class", "passage")
        .attr("cx", d => x(d.x)).attr("cy", d => y(d.y)).attr("r", d => radius(d.word_count))
        .attr("fill", d => topicColor(d.cluster)).attr("fill-opacity", 0.75)
        .attr("stroke", "#ffffff").attr("stroke-width", 0.7)
        .on("pointerenter", showPassageTooltip).on("pointermove", moveTooltip)
        .on("pointerleave", hideTooltip).on("click", (event, d) => {
            event.stopPropagation();
            selectPassage(d);
        });

    // Transform one layer so points retain their shared semantic positions.
    zoomBehavior = d3.zoom().scaleExtent([0.75, 12]).on("zoom", event => {
        zoomLayer.attr("transform", event.transform);
        pointSelection.attr("stroke-width", d => {
            const base = selectedPassage?.passage_id === d.passage_id ? 2.8 : neighborIds.has(d.passage_id) ? 1.8 : 0.7;
            return base / event.transform.k;
        });
    });
    mapSvg.call(zoomBehavior).on("dblclick.zoom", null).on("click", () => clearPassageSelection());
}

function drawMatrix(data) {
    const topics = [...topicLabels.keys()].sort(d3.ascending);
    const totals = d3.rollup(passages, rows => rows.length, d => d.section);
    const sections = [...totals.keys()].sort((a, b) => d3.descending(totals.get(a), totals.get(b)));
    const counts = d3.rollup(data, rows => rows[0].count, d => d.section, d => d.cluster);
    // Materialize zero-count combinations so the matrix remains a complete grid.
    const cells = d3.cross(sections, topics, (section, topic) => ({
        section,
        topic,
        count: counts.get(section)?.get(topic) || 0,
        total: totals.get(section)
    }));
    const width = 1120;
    const margin = { top: 205, right: 28, bottom: 24, left: 385 };
    const rowHeight = 21;
    const height = margin.top + sections.length * rowHeight + margin.bottom;
    const x = d3.scaleBand().domain(topics).range([margin.left, width - margin.right]).padding(0.04);
    const y = d3.scaleBand().domain(sections)
        .range([margin.top, height - margin.bottom]).padding(0.04);
    const color = d3.scaleSequentialSqrt(d3.interpolateBlues)
        .domain([0, d3.max(cells, d => d.count) || 1]);

    const svg = d3.select("#matrix").append("svg").attr("viewBox", `0 0 ${width} ${height}`)
        .style("min-width", "900px").attr("role", "img")
        .attr("aria-label", "Matrix of passage counts by bulletin section and semantic topic");
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${margin.top})`)
        .call(d3.axisTop(x).tickSize(0).tickFormat(topicName)).call(g => g.select(".domain").remove())
        .selectAll("text").attr("transform", "rotate(-38)").attr("text-anchor", "start");
    svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).tickSize(0).tickFormat(d => shortLabel(d, 56)))
        .call(g => g.select(".domain").remove());

    matrixCells = svg.append("g").selectAll("rect").data(cells).join("rect")
        .attr("class", "matrix-cell").attr("x", d => x(d.topic)).attr("y", d => y(d.section))
        .attr("width", x.bandwidth()).attr("height", y.bandwidth())
        // Use an inline style so browser color/extension styles cannot hide the heatmap values.
        .style("fill", d => d.count ? color(d.count) : "#f3f4f6", "important")
        .attr("stroke", "#ffffff").attr("stroke-width", 0.6)
        .on("pointerenter", showMatrixTooltip).on("pointermove", moveTooltip)
        .on("pointerleave", hideTooltip).on("click", (event, d) => {
            event.stopPropagation();
            const same = matrixSelection?.section === d.section && matrixSelection?.topic === d.topic;
            matrixSelection = same ? null : { section: d.section, topic: d.topic };
            updateStyles();
        });
}

function connectControls() {
    d3.selectAll("#search, #section-filter, #topic-filter").on("input change", updateStyles);
    d3.select("#reset").on("click", () => {
        d3.select("#search").property("value", "");
        d3.select("#section-filter").property("value", "");
        d3.select("#topic-filter").property("value", "");
        matrixSelection = null;
        clearPassageSelection();
        mapSvg.transition().duration(350).call(zoomBehavior.transform, d3.zoomIdentity);
    });
}

function matchesFilters(d) {
    const query = d3.select("#search").property("value").trim().toLowerCase();
    const section = d3.select("#section-filter").property("value");
    const topic = d3.select("#topic-filter").property("value");
    const searchable = `${d.text} ${d.chapter} ${d.section} ${d.subsection}`.toLowerCase();
    return (!query || searchable.includes(query))
        && (!section || d.section === section)
        && (!topic || d.cluster === +topic)
        && (!matrixSelection || (d.section === matrixSelection.section && d.cluster === matrixSelection.topic));
}

function updateStyles() {
    if (!pointSelection || !matrixCells) return;
    // Apply search, filters, neighbor selection, and matrix selection together.
    pointSelection
        .attr("opacity", d => matchesFilters(d) ? 0.88 : 0.035)
        .attr("stroke", d => selectedPassage?.passage_id === d.passage_id || neighborIds.has(d.passage_id)
            ? "#111827" : "#ffffff")
        .attr("stroke-width", d => selectedPassage?.passage_id === d.passage_id
            ? 2.8 : neighborIds.has(d.passage_id) ? 1.8 : 0.7);

    matrixCells
        .attr("opacity", d => !matrixSelection
            || (d.section === matrixSelection.section && d.topic === matrixSelection.topic) ? 1 : 0.35)
        .attr("stroke", d => {
            const activeMatrix = matrixSelection?.section === d.section && matrixSelection?.topic === d.topic;
            const activePoint = selectedCell?.section === d.section && selectedCell?.topic === d.topic;
            return activeMatrix || activePoint ? "#111827" : "#ffffff";
        })
        .attr("stroke-width", d => {
            const activeMatrix = matrixSelection?.section === d.section && matrixSelection?.topic === d.topic;
            const activePoint = selectedCell?.section === d.section && selectedCell?.topic === d.topic;
            return activeMatrix || activePoint ? 2.4 : 0.6;
        });
}

function selectPassage(d) {
    selectedPassage = d;
    neighborIds = new Set(d.neighbor_ids);
    selectedCell = { section: d.section, topic: d.cluster };
    showDetails(d);
    updateStyles();
}

function clearPassageSelection() {
    selectedPassage = null;
    neighborIds = new Set();
    selectedCell = null;
    d3.select("#detail-panel").html("<h4>Passage Details</h4><p>Select a point to inspect its structure, full text, and nearest neighbors.</p>");
    updateStyles();
}

function showDetails(d) {
    const panel = d3.select("#detail-panel").html("");
    panel.append("h4").text(d.section);
    const details = panel.append("dl");
    addDetail(details, "Passage", d.passage_id);
    addDetail(details, "Chapter", d.chapter);
    addDetail(details, "Subsection", d.subsection || "-");
    addDetail(details, "Page", d.page);
    addDetail(details, "Topic", topicName(d.cluster));
    addDetail(details, "Length", `${d.word_count} words`);
    panel.append("p").text(d.text);
    panel.append("h5").text("Five nearest semantic neighbors");
    const list = panel.append("ol").attr("class", "neighbor-list");
    d.neighbor_ids.forEach((id, index) => {
        const neighbor = passageById.get(id);
        if (!neighbor) return;
        list.append("li").append("button").attr("type", "button")
            .text(`${neighbor.section}, p. ${neighbor.page} (similarity ${d.neighbor_scores[index].toFixed(3)})`)
            .on("click", () => selectPassage(neighbor));
    });
}

function addDetail(list, term, value) {
    list.append("dt").text(term);
    list.append("dd").text(value);
}

function showPassageTooltip(event, d) {
    tooltip.style("opacity", 1).html(
        `<strong>${escapeHtml(topicName(d.cluster))}</strong><br>`
        + `${escapeHtml(d.section)} · p. ${d.page}<br>${d.word_count} words`
    );
    moveTooltip(event);
}

function showMatrixTooltip(event, d) {
    const proportion = d.total ? d.count / d.total : 0;
    tooltip.style("opacity", 1).html(
        `<strong>${escapeHtml(d.section)}</strong><br>${escapeHtml(topicName(d.topic))}<br>`
        + `${formatCount(d.count)} passages (${d3.format(".1%")(proportion)} of section)`
    );
    moveTooltip(event);
}

function moveTooltip(event) {
    tooltip.style("left", `${event.pageX + 14}px`).style("top", `${event.pageY + 14}px`);
}

function hideTooltip() {
    tooltip.style("opacity", 0);
}

function shortLabel(value, limit = 42) {
    return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;"
    })[character]);
}
