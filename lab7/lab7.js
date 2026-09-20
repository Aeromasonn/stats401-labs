const networkWidth = 1050;
const networkHeight = 610;
const networkMargin = { top: 52, right: 34, bottom: 30, left: 34 };
const totalDays = 60;
const tooltip = d3.select("#tooltip");
const status = d3.select("#load-status");
const slider = d3.select("#time-slider");
const formatDate = d3.timeFormat("%B %d, %Y");
const formatMoney = d3.format("$,.0f");

let currentDay = 1;
let timer = null;
let companies = [];
let nodeById = new Map();
let linksByDay = new Map();
let simulation;
let linkSelection;
let nodeSelection;
let labelSelection;
let overviewCursor;
let overviewX;
let nodeSize;
let linkWidth;
let linkOpacity;
let linkColor;

const networkSvg = d3.select("#network")
    .append("svg")
    .attr("viewBox", `0 0 ${networkWidth} ${networkHeight}`)
    .attr("role", "img")
    .attr("aria-labelledby", "network-title network-description");

networkSvg.append("title").attr("id", "network-title")
    .text("Animated commercial transaction network");
networkSvg.append("desc").attr("id", "network-description")
    .text("Companies are nodes and daily commercial transactions are links. Use the controls to inspect all sixty days.");
networkSvg.append("rect").attr("class", "network-frame")
    .attr("x", 1).attr("y", 1).attr("width", networkWidth - 2)
    .attr("height", networkHeight - 2).attr("rx", 10);

const regionLayer = networkSvg.append("g");
const linkLayer = networkSvg.append("g");
const nodeLayer = networkSvg.append("g");
const labelLayer = networkSvg.append("g");

Promise.all([
    d3.csv("../data/lab7_assignment_companies.csv", d => ({
        id: d.id.trim(), company_name: d.company_name.trim(),
        sector: d.sector.trim(), region: d.region.trim()
    })),
    d3.csv("../data/lab7_assignment_transactions_60days.csv", d => ({
        date: d3.timeParse("%Y-%m-%d")(d.date), day: +d.day,
        source: d.source.trim(), target: d.target.trim(), amount_usd: +d.amount_usd,
        transaction_type: d.transaction_type.trim(), transaction_count: +d.transaction_count
    }))
]).then(([companyData, transactionData]) => {
    validateData(companyData, transactionData);
    companies = companyData;
    nodeById = new Map(companies.map(d => [d.id, d]));
    linksByDay = aggregateTransactions(transactionData);

    const sectors = [...new Set(companies.map(d => d.sector))];
    const regions = [...new Set(companies.map(d => d.region))];
    const transactionTypes = [...new Set(transactionData.map(d => d.transaction_type))];
    const sectorColor = d3.scaleOrdinal(sectors, d3.schemeTableau10);
    linkColor = d3.scaleOrdinal(transactionTypes, d3.schemeSet2);
    const regionX = d3.scalePoint().domain(regions)
        .range([networkMargin.left + 100, networkWidth - networkMargin.right - 100]).padding(0.45);

    const allLinks = [...linksByDay.values()].flat();
    const maximumNodeVolume = d3.max(d3.range(1, totalDays + 1), day =>
        d3.max(calculateNodeActivity(linksByDay.get(day) || []).values()) || 0) || 1;
    nodeSize = d3.scaleSqrt().domain([0, maximumNodeVolume]).range([7, 27]);
    linkWidth = d3.scaleSqrt().domain([0, d3.max(allLinks, d => d.amount_usd) || 1]).range([1.2, 8]);
    linkOpacity = d3.scaleLinear()
        .domain([1, d3.max(allLinks, d => d.transaction_count) || 1]).range([0.42, 0.9]).clamp(true);

    addRegionLabels(regions, regionX);
    drawLegends(sectors, regions, transactionTypes, sectorColor, linkColor);

    nodeSelection = nodeLayer.selectAll("circle").data(companies, d => d.id).join("circle")
        .attr("class", "network-node").attr("r", 7).attr("fill", d => sectorColor(d.sector))
        .attr("tabindex", 0).attr("aria-label", d => `${d.company_name}, ${d.sector}, ${d.region}`)
        .on("pointerenter focus", showNodeTooltip).on("pointermove", moveTooltip)
        .on("pointerleave blur", hideTooltip);

    labelSelection = labelLayer.selectAll("text").data(companies, d => d.id).join("text")
        .attr("class", "node-label").attr("text-anchor", "middle").text(d => d.company_name);

    simulation = d3.forceSimulation(companies)
        .force("link", d3.forceLink().id(d => d.id).distance(118).strength(0.23))
        .force("charge", d3.forceManyBody().strength(-340))
        .force("collision", d3.forceCollide().radius(36).strength(0.9))
        .force("x", d3.forceX(d => regionX(d.region)).strength(0.16))
        .force("y", d3.forceY(networkHeight / 2 + 15).strength(0.06)).on("tick", ticked);

    nodeSelection.call(d3.drag().on("start", dragStarted).on("drag", dragged).on("end", dragEnded));
    drawOverview(buildDailySummary());
    slider.property("disabled", false);
    d3.selectAll("#play, #pause, #reset").property("disabled", false);
    status.text("Use the animation controls or select a day in the overview.");
    showDay(1, { settle: true });
}).catch(error => {
    console.error("Unable to load Lab 7 data:", error);
    status.classed("error", true).text(
        "Unable to load the required Lab 7 CSV files. Add data/lab7_assignment_companies.csv and " +
        "data/lab7_assignment_transactions_60days.csv, then serve this repository through HTTP."
    );
    d3.selectAll("#play, #pause, #reset").property("disabled", true);
});

function validateData(companyData, transactionData) {
    if (companyData.length !== 12) throw new Error(`Expected 12 companies; received ${companyData.length}.`);
    const companyIds = new Set(companyData.map(d => d.id));
    if (companyIds.size !== companyData.length) throw new Error("Company identifiers must be unique.");
    const invalid = transactionData.find(d => !d.date || !Number.isInteger(d.day) ||
        d.day < 1 || d.day > totalDays || !companyIds.has(d.source) || !companyIds.has(d.target) ||
        !Number.isFinite(d.amount_usd) || !Number.isFinite(d.transaction_count));
    if (invalid) throw new Error("The transaction file contains an invalid date, day, company, amount, or count.");
    const availableDays = new Set(transactionData.map(d => d.day));
    if (availableDays.size !== totalDays) {
        throw new Error(`Expected transactions across 60 days; received ${availableDays.size} distinct days.`);
    }
}

function aggregateTransactions(transactions) {
    return d3.rollup(transactions, rows => {
        const pairGroups = d3.group(rows, row => [row.source, row.target].sort().join("--"));
        return [...pairGroups.entries()].map(([id, pairRows]) => {
            const types = [...new Set(pairRows.map(d => d.transaction_type))];
            const ids = id.split("--");
            return {
                id, sourceId: ids[0], targetId: ids[1], source: ids[0], target: ids[1],
                date: pairRows[0].date, day: pairRows[0].day,
                amount_usd: d3.sum(pairRows, d => d.amount_usd),
                transaction_count: d3.sum(pairRows, d => d.transaction_count),
                transaction_type: types.length === 1 ? types[0] : "Mixed", transaction_types: types
            };
        });
    }, d => d.day);
}

function calculateNodeActivity(currentLinks) {
    const volume = new Map(companies.map(d => [d.id, 0]));
    currentLinks.forEach(link => {
        volume.set(link.sourceId, volume.get(link.sourceId) + link.amount_usd);
        volume.set(link.targetId, volume.get(link.targetId) + link.amount_usd);
    });
    return volume;
}

function showDay(day, options = {}) {
    if (!linksByDay.size) return;
    if (options.stopTimer !== false) pause();
    currentDay = Math.max(1, Math.min(totalDays, Math.round(day)));
    const rawLinks = linksByDay.get(currentDay) || [];
    const currentLinks = rawLinks.map(d => ({ ...d,
        source: nodeById.get(d.sourceId), target: nodeById.get(d.targetId) }));
    const volume = calculateNodeActivity(rawLinks);
    const activeIds = new Set(rawLinks.flatMap(d => [d.sourceId, d.targetId]));
    const date = rawLinks[0]?.date;

    linkSelection = linkLayer.selectAll("line").data(currentLinks, d => d.id).join(
        enter => enter.append("line")
            .attr("stroke", d => linkStroke(d)).attr("stroke-width", d => linkWidth(d.amount_usd))
            .attr("stroke-opacity", 0).on("pointerenter", showLinkTooltip)
            .on("pointermove", moveTooltip).on("pointerleave", hideTooltip)
            .call(enter => enter.transition().duration(350)
                .attr("stroke-opacity", d => linkOpacity(d.transaction_count))),
        update => update.on("pointerenter", showLinkTooltip).on("pointermove", moveTooltip)
            .on("pointerleave", hideTooltip).call(update => update.transition().duration(300)
                .attr("stroke", d => linkStroke(d)).attr("stroke-width", d => linkWidth(d.amount_usd))
                .attr("stroke-opacity", d => linkOpacity(d.transaction_count))),
        exit => exit.call(exit => exit.transition().duration(350).attr("stroke-opacity", 0).remove())
    );

    nodeSelection.transition().duration(350).attr("r", d => nodeSize(volume.get(d.id)))
        .attr("opacity", d => activeIds.has(d.id) ? 1 : 0.28)
        .attr("stroke-width", d => activeIds.has(d.id) ? 3 : 1.5);
    labelSelection.transition().duration(350).attr("opacity", d => activeIds.has(d.id) ? 1 : 0.35);

    simulation.force("link").links(currentLinks);
    simulation.alpha(options.settle ? 0.65 : 0.24).restart();

    const crossRegion = rawLinks.filter(d =>
        nodeById.get(d.sourceId).region !== nodeById.get(d.targetId).region).length;
    d3.select("#day-label").text(`Day ${currentDay}`);
    d3.select("#date-label").text(date ? formatDate(date) : "No transactions");
    d3.select("#slider-output").text(currentDay);
    slider.property("value", currentDay);
    d3.select("#active-companies").text(activeIds.size);
    d3.select("#active-links").text(rawLinks.length);
    d3.select("#total-value").text(formatMoney(d3.sum(rawLinks, d => d.amount_usd)));
    d3.select("#cross-region-links").text(crossRegion);
    if (overviewCursor && overviewX) overviewCursor.attr("transform", `translate(${overviewX(currentDay)},0)`);
}

function linkStroke(d) { return d.transaction_type === "Mixed" ? "#536176" : linkColor(d.transaction_type); }

function buildDailySummary() {
    return d3.range(1, totalDays + 1).map(day => {
        const links = linksByDay.get(day) || [];
        return {
            day, links: links.length,
            crossRegion: links.filter(d =>
                nodeById.get(d.sourceId).region !== nodeById.get(d.targetId).region).length
        };
    });
}

function drawOverview(summary) {
    const width = 1050, height = 245;
    const margin = { top: 22, right: 68, bottom: 45, left: 52 };
    overviewX = d3.scaleLinear().domain([1, totalDays]).range([margin.left, width - margin.right]);
    const yLinks = d3.scaleLinear().domain([0, d3.max(summary, d => d.links) || 1]).nice()
        .range([height - margin.bottom, margin.top]);
    const yCross = d3.scaleLinear().domain([0, d3.max(summary, d => d.crossRegion) || 1]).nice()
        .range([height - margin.bottom, margin.top]);
    const svg = d3.select("#overview").append("svg").attr("viewBox", `0 0 ${width} ${height}`);
    svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(overviewX).ticks(12).tickFormat(d3.format("d")))
        .call(g => g.append("text").attr("x", width / 2).attr("y", 38)
            .attr("fill", "currentColor").attr("text-anchor", "middle").text("Day"));
    svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(yLinks).ticks(5))
        .call(g => g.append("text").attr("x", -margin.left).attr("y", 12)
            .attr("fill", "#2357d8").attr("text-anchor", "start").text("Active links"));
    svg.append("g").attr("transform", `translate(${width - margin.right},0)`).call(d3.axisRight(yCross).ticks(5))
        .call(g => g.append("text").attr("x", 8).attr("y", 12)
            .attr("fill", "#c85a35").attr("text-anchor", "start").text("Cross-region"));
    svg.append("path").datum(summary).attr("class", "overview-line").attr("stroke", "#2357d8")
        .attr("d", d3.line().x(d => overviewX(d.day)).y(d => yLinks(d.links)));
    svg.append("path").datum(summary).attr("class", "overview-line").attr("stroke", "#c85a35")
        .attr("d", d3.line().x(d => overviewX(d.day)).y(d => yCross(d.crossRegion)));
    overviewCursor = svg.append("line").attr("class", "overview-cursor")
        .attr("y1", margin.top).attr("y2", height - margin.bottom);
    svg.append("rect").attr("class", "overview-overlay").attr("x", margin.left).attr("y", margin.top)
        .attr("width", width - margin.left - margin.right).attr("height", height - margin.top - margin.bottom)
        .on("pointerdown pointermove", event => {
            if (event.type === "pointermove" && event.buttons !== 1) return;
            showDay(Math.round(overviewX.invert(d3.pointer(event)[0])));
        });
}

function drawLegends(sectors, regions, types, sectorColor, typeColor) {
    d3.select("#sector-legend").selectAll("span").data(sectors).join("span")
        .attr("class", "legend-item").html(d => `<i class="legend-swatch" style="background:${sectorColor(d)}"></i>${d}`);
    d3.select("#type-legend").selectAll("span").data(types).join("span")
        .attr("class", "legend-item").html(d => `<i class="legend-line" style="background:${typeColor(d)}"></i>${d}`);
    d3.select("#region-legend").selectAll("span").data(regions).join("span")
        .attr("class", "legend-item").html(d => `<i class="region-mark"></i>${d}`);
}

function addRegionLabels(regions, regionX) {
    regionLayer.selectAll("text").data(regions).join("text").attr("class", "region-label")
        .attr("x", d => regionX(d)).attr("y", 30).text(d => d);
}

function ticked() {
    companies.forEach(d => {
        d.x = Math.max(networkMargin.left + 30, Math.min(networkWidth - networkMargin.right - 30, d.x));
        d.y = Math.max(networkMargin.top + 15, Math.min(networkHeight - networkMargin.bottom - 25, d.y));
    });
    if (linkSelection) linkSelection.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    nodeSelection.attr("cx", d => d.x).attr("cy", d => d.y);
    labelSelection.attr("x", d => d.x).attr("y", d => d.y + 40);
}

function showNodeTooltip(event, d) {
    const companyLinks = (linksByDay.get(currentDay) || [])
        .filter(link => link.sourceId === d.id || link.targetId === d.id);
    tooltip.style("opacity", 1).html(`<strong>${d.company_name}</strong><br>${d.sector} · ${d.region}<br>` +
        `Day ${currentDay} volume: ${formatMoney(d3.sum(companyLinks, link => link.amount_usd))}<br>` +
        `Active relationships: ${companyLinks.length}`);
    moveTooltip(event);
}

function showLinkTooltip(event, d) {
    tooltip.style("opacity", 1).html(`<strong>${d.source.company_name} ↔ ${d.target.company_name}</strong><br>` +
        `${d.transaction_types.join(", ")}<br>Value: ${formatMoney(d.amount_usd)}<br>` +
        `Transactions: ${d3.format(",")(d.transaction_count)}`);
    moveTooltip(event);
}

function moveTooltip(event) {
    if (!event || event.pageX === undefined) return;
    tooltip.style("left", `${event.pageX + 14}px`).style("top", `${event.pageY + 14}px`);
}
function hideTooltip() { tooltip.style("opacity", 0); }
function dragStarted(event, d) { if (!event.active) simulation.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; }
function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
function dragEnded(event, d) { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }

function play() {
    if (timer || !linksByDay.size) return;
    if (currentDay >= totalDays) currentDay = 0;
    timer = d3.interval(() => {
        currentDay += 1;
        showDay(currentDay, { stopTimer: false });
        if (currentDay >= totalDays) pause();
    }, 650);
}
function pause() { if (timer) { timer.stop(); timer = null; } }
function reset() { pause(); showDay(1, { settle: true }); }

d3.select("#play").on("click", play).property("disabled", true);
d3.select("#pause").on("click", pause).property("disabled", true);
d3.select("#reset").on("click", reset).property("disabled", true);
slider.on("input", function () { showDay(+this.value); });
