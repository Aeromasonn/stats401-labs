const DATA_PATH = "data/graph.json";

const laneOrder = [
    "OpenAI",
    "Google / DeepMind",
    "Meta",
    "Microsoft",
    "Anthropic",
    "Independent labs",
    "Academic / community",
    "Other industry"
];

const laneColors = new Map([
    ["OpenAI", "#14866d"],
    ["Google / DeepMind", "#3978c5"],
    ["Meta", "#7656a8"],
    ["Microsoft", "#bd7d16"],
    ["Anthropic", "#c65b42"],
    ["Independent labs", "#b94778"],
    ["Academic / community", "#438553"],
    ["Other industry", "#737d84"]
]);

const academicTerms = [
    "stanford", "cmu", "princeton", "university", "mit", "ai2", "eleuther",
    "huggingface", "research", "tsinghua", "berkeley", "uw", "king abdullah"
];

const independentTerms = ["mistral", "deepseek", "alibaba", "xai"];

const landmarks = new Set([
    "transformers-2017", "bert-2018", "gpt2-2019", "gpt3-2020", "scaling-law-2020",
    "instructgpt-2022", "chatgpt-2022", "llama-2023", "gpt4-2023", "mistral-7b-2023",
    "gemini-2023", "claude-3-2024", "llama3-2024", "deepseek-v3-2024",
    "deepseek-r1-2025", "gpt5-2025"
]);

const parseDate = d3.timeParse("%Y-%m-%d");
const formatDate = d3.timeFormat("%B %d, %Y");
const formatYear = d3.timeFormat("%Y");

const svg = d3.select("#timeline");
const tooltip = d3.select("#tooltip");
const detailPanel = d3.select("#detail-panel");
const statusLine = d3.select("#status-line");
const searchInput = d3.select("#search-input");
const organizationFilter = d3.select("#organization-filter");
const labelToggle = d3.select("#label-toggle");

const width = 1120;
const height = 680;
const margin = { top: 48, right: 24, bottom: 35, left: 142 };

let nodes = [];
let links = [];
let nodeById = new Map();
let selectedId = null;
let searchTerm = "";
let selectedLane = "All";
let showAllLabels = false;

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function safeExternalUrl(value) {
    try {
        const url = new URL(value);
        return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
    } catch {
        return "#";
    }
}

function laneFor(organization = "") {
    const org = organization.toLowerCase();
    if (org.includes("openai")) return "OpenAI";
    if (org.includes("google") || org.includes("deepmind")) return "Google / DeepMind";
    if (org.includes("meta")) return "Meta";
    if (org.includes("microsoft")) return "Microsoft";
    if (org.includes("anthropic")) return "Anthropic";
    if (independentTerms.some(term => org.includes(term))) return "Independent labs";
    if (academicTerms.some(term => org.includes(term))) return "Academic / community";
    return "Other industry";
}

function assignTracks(laneNodes, xScale) {
    const lastX = [-Infinity, -Infinity, -Infinity, -Infinity, -Infinity];
    laneNodes
        .sort((a, b) => d3.ascending(a.dateObj, b.dateObj))
        .forEach(node => {
            const px = xScale(node.dateObj);
            let track = lastX.findIndex(previous => px - previous > 44);
            if (track < 0) track = lastX.indexOf(d3.min(lastX));
            node.track = track;
            lastX[track] = px;
        });
}

function connectionIds(id) {
    const ids = new Set([id]);
    links.forEach(link => {
        if (link.source.id === id) ids.add(link.target.id);
        if (link.target.id === id) ids.add(link.source.id);
    });
    return ids;
}

function connectedNodes(id, direction) {
    return links
        .filter(link => direction === "incoming" ? link.target.id === id : link.source.id === id)
        .map(link => direction === "incoming" ? link.source : link.target)
        .sort((a, b) => d3.ascending(a.dateObj, b.dateObj));
}

function linkPath(link) {
    const midpoint = link.source.x + (link.target.x - link.source.x) * 0.5;
    return `M${link.source.x},${link.source.y} C${midpoint},${link.source.y} ${midpoint},${link.target.y} ${link.target.x},${link.target.y}`;
}

function descendantLabel(count) {
    return `${count} direct descendant${count === 1 ? "" : "s"}`;
}

function updateDetail(node) {
    if (!node) {
        detailPanel.html(`
            <div class="detail-empty">
                <h3>Select a model</h3>
                <p>Its description, source, direct-descendant count, predecessors, and descendants will appear here.</p>
            </div>
        `);
        return;
    }

    const incoming = connectedNodes(node.id, "incoming");
    const outgoing = connectedNodes(node.id, "outgoing");
    const listMarkup = (items, emptyText) => items.length
        ? items.map(item => `<button type="button" data-node-id="${escapeHtml(item.id)}">${escapeHtml(item.name)}</button>`).join("")
        : `<span class="no-connections">${emptyText}</span>`;

    detailPanel.html(`
        <p class="detail-meta">${formatDate(node.dateObj)} · ${escapeHtml(node.properties.organization)}</p>
        <h3>${escapeHtml(node.name)}</h3>
        <p class="detail-count"><strong>Point size:</strong> ${descendantLabel(node.directDescendants)}</p>
        <p class="detail-description">${escapeHtml(node.properties.description)}</p>
        <a class="detail-source" href="${safeExternalUrl(node.link)}" target="_blank" rel="noreferrer">Open cited source</a>
        <div class="connection-block">
            <h4>Influenced by</h4>
            <div class="connection-list">${listMarkup(incoming, "No incoming link in this dataset")}</div>
            <h4>Direct descendants</h4>
            <div class="connection-list">${listMarkup(outgoing, "No outgoing link in this dataset")}</div>
        </div>
    `);

    detailPanel.selectAll("button[data-node-id]").on("click", function () {
        selectNode(this.dataset.nodeId);
    });
}

function applyVisualState() {
    const selectedConnections = selectedId ? connectionIds(selectedId) : new Set();
    const query = searchTerm.trim().toLowerCase();

    const matchesFilter = node => {
        const laneMatch = selectedLane === "All" || node.lane === selectedLane;
        const text = `${node.name} ${node.properties.organization}`.toLowerCase();
        const searchMatch = !query || text.includes(query);
        return laneMatch && searchMatch;
    };

    const visibleMatches = nodes.filter(matchesFilter);

    svg.selectAll(".model-node")
        .classed("selected", d => d.id === selectedId)
        .attr("opacity", d => {
            if (!matchesFilter(d)) return 0.1;
            if (selectedId && !selectedConnections.has(d.id)) return 0.22;
            return 1;
        });

    svg.selectAll(".node-label")
        .attr("display", d => {
            const relevantToSelection = selectedId && selectedConnections.has(d.id);
            const relevantToSearch = query && matchesFilter(d);
            return showAllLabels || landmarks.has(d.id) || relevantToSelection || relevantToSearch ? null : "none";
        })
        .attr("opacity", d => matchesFilter(d) ? 1 : 0.12);

    svg.selectAll(".lineage-link")
        .attr("opacity", d => selectedId && (d.source.id === selectedId || d.target.id === selectedId) ? 0.72 : 0)
        .attr("stroke", d => laneColors.get(d.source.lane));

    const countText = visibleMatches.length === nodes.length
        ? `Showing all ${nodes.length} models. Select a point to reveal its direct lineage links.`
        : `Showing ${visibleMatches.length} of ${nodes.length} models after filtering.`;
    statusLine.text(countText);
}

function selectNode(id) {
    selectedId = id;
    updateDetail(nodeById.get(id));
    applyVisualState();
}

function resetView() {
    selectedId = null;
    searchTerm = "";
    selectedLane = "All";
    showAllLabels = false;
    searchInput.property("value", "");
    organizationFilter.property("value", "All");
    labelToggle.property("checked", false);
    updateDetail(null);
    applyVisualState();
}

function renderColorLegend() {
    d3.select("#color-legend")
        .selectAll("span.legend-item")
        .data(laneOrder)
        .join("span")
        .attr("class", "legend-item")
        .html(d => `<span class="legend-swatch" style="background:${laneColors.get(d)}"></span>${d}`);
}

function renderSizeLegend(sizeScale, maximum) {
    const values = Array.from(new Set([0, Math.min(5, maximum), maximum])).sort((a, b) => a - b);
    const sizeSvg = d3.select("#size-legend").attr("viewBox", "0 0 270 58");
    const item = sizeSvg.selectAll("g").data(values).join("g")
        .attr("transform", (d, i) => `translate(${35 + i * 86},25)`);

    item.append("circle")
        .attr("r", d => sizeScale(d));

    item.append("text")
        .attr("x", 17)
        .attr("y", 4)
        .text(d => d);
}

function render(data) {
    nodes = data.nodes
        .map(node => ({
            ...node,
            dateObj: parseDate(node.date),
            lane: laneFor(node.properties.organization)
        }))
        .filter(node => node.dateObj);

    nodeById = new Map(nodes.map(node => [node.id, node]));
    links = data.links
        .filter(link => nodeById.has(link.source) && nodeById.has(link.target))
        .map(link => ({ source: nodeById.get(link.source), target: nodeById.get(link.target) }));

    const descendantCounts = d3.rollup(links, group => group.length, link => link.source.id);
    nodes.forEach(node => {
        node.directDescendants = descendantCounts.get(node.id) || 0;
    });

    const maxDescendants = d3.max(nodes, node => node.directDescendants);
    const sizeScale = d3.scaleSqrt().domain([0, maxDescendants]).range([4, 12]);
    nodes.forEach(node => {
        node.radius = sizeScale(node.directDescendants);
    });

    organizationFilter
        .selectAll("option.lane-option")
        .data(laneOrder)
        .join("option")
        .attr("class", "lane-option")
        .attr("value", d => d)
        .text(d => d);

    renderColorLegend();
    renderSizeLegend(sizeScale, maxDescendants);

    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const x = d3.scaleTime()
        .domain([
            d3.timeMonth.offset(d3.min(nodes, d => d.dateObj), -4),
            d3.timeMonth.offset(d3.max(nodes, d => d.dateObj), 4)
        ])
        .range([margin.left, width - margin.right]);

    const y = d3.scaleBand()
        .domain(laneOrder)
        .range([margin.top, height - margin.bottom])
        .paddingInner(0.08);

    laneOrder.forEach(lane => assignTracks(nodes.filter(node => node.lane === lane), x));
    const trackOffsets = [-22, -10, 2, 14, 26];
    nodes.forEach(node => {
        node.x = x(node.dateObj);
        node.y = y(node.lane) + y.bandwidth() / 2 + trackOffsets[node.track];
    });

    const yearStart = d3.timeYear.floor(x.domain()[0]);
    const yearEnd = d3.timeYear.ceil(x.domain()[1]);
    const years = d3.timeYears(yearStart, d3.timeYear.offset(yearEnd, 1));
    const plot = svg.append("g");

    plot.selectAll("rect.lane-bg")
        .data(laneOrder)
        .join("rect")
        .attr("class", (d, i) => `lane-bg${i % 2 ? " alt" : ""}`)
        .attr("x", margin.left)
        .attr("y", d => y(d))
        .attr("width", width - margin.left - margin.right)
        .attr("height", y.bandwidth());

    plot.selectAll("line.year-line")
        .data(years)
        .join("line")
        .attr("class", "year-line")
        .attr("x1", d => x(d))
        .attr("x2", d => x(d))
        .attr("y1", margin.top - 22)
        .attr("y2", height - margin.bottom);

    plot.selectAll("text.year-label")
        .data(years)
        .join("text")
        .attr("class", "year-label")
        .attr("x", d => x(d) + 4)
        .attr("y", margin.top - 28)
        .text(d => formatYear(d));

    plot.selectAll("text.lane-label")
        .data(laneOrder)
        .join("text")
        .attr("class", "lane-label")
        .attr("x", margin.left - 12)
        .attr("y", d => y(d) + y.bandwidth() / 2 + 4)
        .attr("text-anchor", "end")
        .text(d => d);

    plot.append("g")
        .attr("class", "links")
        .selectAll("path")
        .data(links)
        .join("path")
        .attr("class", "lineage-link")
        .attr("d", linkPath);

    const nodeGroups = plot.append("g")
        .attr("class", "nodes")
        .selectAll("g.model-node")
        .data(nodes)
        .join("g")
        .attr("class", "model-node")
        .attr("transform", d => `translate(${d.x},${d.y})`)
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", d => `${d.name}, ${d.properties.organization}, ${formatDate(d.dateObj)}, ${descendantLabel(d.directDescendants)}`)
        .on("click", (event, d) => {
            event.stopPropagation();
            selectNode(d.id);
        })
        .on("keydown", (event, d) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectNode(d.id);
            }
        })
        .on("pointerenter", (event, d) => {
            tooltip
                .attr("hidden", null)
                .html(`<strong>${escapeHtml(d.name)}</strong><span>${escapeHtml(d.properties.organization)} · ${formatDate(d.dateObj)}<br>${descendantLabel(d.directDescendants)}</span>`);
        })
        .on("pointermove", event => {
            tooltip.style("left", `${event.clientX + 14}px`).style("top", `${event.clientY + 14}px`);
        })
        .on("pointerleave", () => tooltip.attr("hidden", true));

    nodeGroups.append("circle")
        .attr("class", "halo")
        .attr("r", d => d.radius + 3)
        .attr("stroke", d => laneColors.get(d.lane));

    nodeGroups.append("circle")
        .attr("r", d => d.radius)
        .attr("fill", d => laneColors.get(d.lane));

    nodeGroups.append("title")
        .text(d => `${d.name}\n${d.properties.organization}\n${formatDate(d.dateObj)}\n${descendantLabel(d.directDescendants)}`);

    nodeGroups.append("text")
        .attr("class", "node-label")
        .attr("x", d => d.radius + 3)
        .attr("y", d => -d.radius - 2)
        .text(d => d.name);

    svg.on("click", () => {
        selectedId = null;
        updateDetail(null);
        applyVisualState();
    });

    searchInput.on("input", function () {
        searchTerm = this.value;
        applyVisualState();
    });

    organizationFilter.on("change", function () {
        selectedLane = this.value;
        applyVisualState();
    });

    labelToggle.on("change", function () {
        showAllLabels = this.checked;
        applyVisualState();
    });

    d3.select("#reset-button").on("click", resetView);
    applyVisualState();
}

d3.json(DATA_PATH)
    .then(render)
    .catch(error => {
        console.error(error);
        statusLine.text("The lineage data could not be loaded. Serve this folder through a local web server rather than opening the HTML file directly.");
    });
