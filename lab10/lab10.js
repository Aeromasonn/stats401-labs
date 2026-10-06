const width = 900;
const height = 620;
const padding = 42;
const formatNumber = d3.format(",");

const tooltip = d3.select("#tooltip");
const status = d3.select("#load-status");
const districtFilter = d3.select("#district-filter");
const typeFilter = d3.select("#type-filter");
const stationSelect = d3.select("#station-select");

let nodes = [];
let links = [];
let nodeById = new Map();
let selectedStationId = null;
let activeDistrict = "All";
let activeType = "All";

let nodeSelection;
let labelSelection;
let linkSelection;
let simulation;

Promise.all([
    d3.csv("../data/lab5_assignment_stations.csv", d => ({
        id: d.id.trim(),
        station_name: d.station_name.trim(),
        district: d.district.trim(),
        daily_passengers: +d.daily_passengers,
        station_type: d.station_type.trim()
    })),
    d3.csv("../data/lab5_assignment_routes.csv", d => ({
        sourceId: d.source.trim(),
        targetId: d.target.trim(),
        source: d.source.trim(),
        target: d.target.trim(),
        travel_time_min: +d.travel_time_min,
        route_type: d.route_type.trim()
    }))
]).then(([stationData, routeData]) => {
    validateData(stationData, routeData);

    nodes = stationData;
    links = routeData;
    nodeById = new Map(nodes.map(d => [d.id, d]));

    buildControls();
    drawNetwork();
    connectFallbackControls();
    setupVoiceControl();
    updateVisualization();

    status.text("");
}).catch(error => {
    console.error("Unable to load Lab 10:", error);
    status.classed("error", true).text(
        "Unable to load the Lab 5 station and route files. Serve this repository through HTTP and try again."
    );
});

function validateData(stationData, routeData) {
    const stationIds = new Set(stationData.map(d => d.id));

    if (!stationData.length || stationIds.size !== stationData.length) {
        throw new Error("Station identifiers must be present and unique.");
    }

    const invalidStation = stationData.find(d =>
        !d.id || !d.station_name || !d.district || !d.station_type ||
        !Number.isFinite(d.daily_passengers)
    );

    const invalidRoute = routeData.find(d =>
        !stationIds.has(d.sourceId) || !stationIds.has(d.targetId) ||
        !d.route_type || !Number.isFinite(d.travel_time_min)
    );

    if (invalidStation || invalidRoute) {
        throw new Error("The station or route file contains an invalid value.");
    }
}

function buildControls() {
    const districts = [...new Set(nodes.map(d => d.district))].sort();
    const stationTypes = [...new Set(nodes.map(d => d.station_type))].sort();

    districtFilter.selectAll("option.district-option")
        .data(districts)
        .join("option")
        .attr("class", "district-option")
        .attr("value", d => d)
        .text(d => d);

    typeFilter.selectAll("option.type-option")
        .data(stationTypes)
        .join("option")
        .attr("class", "type-option")
        .attr("value", d => d)
        .text(d => d);

    stationSelect.selectAll("option.station-option")
        .data(nodes)
        .join("option")
        .attr("class", "station-option")
        .attr("value", d => d.id)
        .text(d => d.station_name);
}

function drawNetwork() {
    const districts = [...new Set(nodes.map(d => d.district))];
    const routeTypes = [...new Set(links.map(d => d.route_type))];

    const districtColor = d3.scaleOrdinal(districts, d3.schemeTableau10);
    const routeColor = d3.scaleOrdinal(routeTypes, d3.schemeSet2);
    const nodeSize = d3.scaleSqrt()
        .domain(d3.extent(nodes, d => d.daily_passengers))
        .range([7, 18]);
    const linkWidth = d3.scaleLinear()
        .domain(d3.extent(links, d => d.travel_time_min))
        .range([1.5, 7]);
    const stationShape = d3.scaleOrdinal()
        .domain(["Local", "Transfer", "Terminal"])
        .range([d3.symbolCircle, d3.symbolTriangle, d3.symbolSquare]);

    const svg = d3.select("#network")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-labelledby", "network-title network-description");

    svg.append("title")
        .attr("id", "network-title")
        .text("Voice-controlled urban transit network");

    svg.append("desc")
        .attr("id", "network-description")
        .text("Stations are connected by transit routes. Voice and fallback controls can filter or highlight stations.");

    svg.append("rect")
        .attr("class", "network-frame")
        .attr("x", 1)
        .attr("y", 1)
        .attr("width", width - 2)
        .attr("height", height - 2)
        .attr("rx", 8);

    linkSelection = svg.append("g")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke", d => routeColor(d.route_type))
        .attr("stroke-width", d => linkWidth(d.travel_time_min));

    nodeSelection = svg.append("g")
        .selectAll("path")
        .data(nodes, d => d.id)
        .join("path")
        .attr("class", "network-node")
        .attr("d", d => d3.symbol()
            .type(stationShape(d.station_type))
            .size(Math.PI * nodeSize(d.daily_passengers) ** 2)())
        .attr("fill", d => districtColor(d.district))
        .attr("tabindex", 0)
        .attr("role", "button")
        .attr("aria-label", d => `${d.station_name}, ${d.station_type}, ${d.district}`)
        .on("pointerenter focus", showStationTooltip)
        .on("pointermove", moveTooltip)
        .on("pointerleave blur", hideTooltip)
        .on("click", (event, d) => {
            event.stopPropagation();
            highlightStation(d.id, `Mouse action: highlighted ${d.station_name}.`);
        })
        .on("keydown", (event, d) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                highlightStation(d.id, `Keyboard action: highlighted ${d.station_name}.`);
            }
        });

    labelSelection = svg.append("g")
        .selectAll("text")
        .data(nodes, d => d.id)
        .join("text")
        .attr("class", "node-label")
        .attr("dx", 13)
        .attr("dy", 4)
        .text(d => d.station_name);

    simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(75))
        .force("charge", d3.forceManyBody().strength(-165))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collision", d3.forceCollide().radius(27))
        .force("x", d3.forceX(width / 2).strength(0.04))
        .force("y", d3.forceY(height / 2).strength(0.04))
        .on("tick", ticked);

    nodeSelection.call(
        d3.drag()
            .on("start", dragStarted)
            .on("drag", dragged)
            .on("end", dragEnded)
    );

    svg.on("click", () => {
        selectedStationId = null;
        stationSelect.property("value", "");
        updateDetails();
        updateVisualization();
    });

    drawLegends(districtColor, routeColor);
}

function drawLegends(districtColor, routeColor) {
    d3.select("#district-legend")
        .selectAll("span")
        .data(districtColor.domain())
        .join("span")
        .attr("class", "legend-item")
        .html(d => `<i class="legend-color" style="background:${districtColor(d)}"></i>${d}`);

    d3.select("#station-legend")
        .selectAll("span")
        .data(["Local", "Transfer", "Terminal"])
        .join("span")
        .attr("class", "legend-item")
        .html(d => `<i class="legend-shape ${d.toLowerCase()}"></i>${d}`);

    d3.select("#route-legend")
        .selectAll("span")
        .data(routeColor.domain())
        .join("span")
        .attr("class", "legend-item")
        .html(d => `<i class="legend-line" style="background:${routeColor(d)}"></i>${d}`);
}

function connectFallbackControls() {
    districtFilter.on("change", function() {
        activeDistrict = this.value;
        updateVisualization();
        setActionFeedback(`Fallback action: showing ${displayFilterName(activeDistrict, "district")}.`);
    });

    typeFilter.on("change", function() {
        activeType = this.value;
        updateVisualization();
        setActionFeedback(`Fallback action: showing ${displayFilterName(activeType, "station type")}.`);
    });

    stationSelect.on("change", function() {
        if (this.value) {
            const station = nodeById.get(this.value);
            highlightStation(this.value, `Fallback action: highlighted ${station.station_name}.`);
        } else {
            selectedStationId = null;
            updateDetails();
            updateVisualization();
        }
    });

    d3.select("#reset-button").on("click", () => {
        resetVisualization("Fallback action: visualization reset.");
    });
}

function setupVoiceControl() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const voiceButton = d3.select("#voice-button");

    if (!SpeechRecognition) {
        voiceButton.property("disabled", true);
        d3.select("#voice-status").text(
            "Speech recognition is unavailable in this browser. Use the fallback controls."
        );
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    voiceButton.on("click", () => {
        d3.select("#voice-transcript").text("Waiting for a command...");
        d3.select("#voice-action").text("No action yet.");

        try {
            recognition.start();
        } catch (error) {
            d3.select("#voice-status").text("Voice control is already listening.");
        }
    });

    recognition.onstart = () => {
        voiceButton.property("disabled", true);
        d3.select("#voice-status").text("Listening...");
    };

    recognition.onresult = event => {
        const transcript = event.results[0][0].transcript.toLowerCase().trim();
        d3.select("#voice-transcript").text(`“${transcript}”`);
        handleVoiceCommand(transcript);
    };

    recognition.onerror = event => {
        const message = event.error === "not-allowed"
            ? "Microphone permission was not granted. Use the fallback controls."
            : `Recognition error: ${event.error}. Try again or use the fallback controls.`;

        d3.select("#voice-status").text(message);
        d3.select("#voice-action").text("No visualization action was applied.");
    };

    recognition.onend = () => {
        voiceButton.property("disabled", false);

        if (d3.select("#voice-status").text() === "Listening...") {
            d3.select("#voice-status").text("Voice control inactive.");
        }
    };
}

function handleVoiceCommand(command) {
    const district = districtFilter.selectAll("option.district-option")
        .data()
        .find(name => command.includes(name.toLowerCase()));

    const stationType = typeFilter.selectAll("option.type-option")
        .data()
        .find(name => command.includes(name.toLowerCase()));

    const stationNumber = command.match(/station\s+(\d+)/)?.[1];
    const station = stationNumber
        ? nodeById.get(`s${Number(stationNumber)}`)
        : nodes.find(d => command.includes(d.station_name.toLowerCase()));

    if (command.includes("reset") || command.includes("show all")) {
        resetVisualization("Voice action: visualization reset.");
    } else if ((command.includes("highlight") || command.includes("select")) && station) {
        highlightStation(station.id, `Voice action: highlighted ${station.station_name}.`);
    } else if (command.includes("show") && district) {
        activeDistrict = district;
        activeType = "All";
        selectedStationId = null;
        updateControls();
        updateDetails();
        updateVisualization();
        setActionFeedback(`Voice action: showing the ${district} district.`);
    } else if (command.includes("show") && stationType) {
        activeDistrict = "All";
        activeType = stationType;
        selectedStationId = null;
        updateControls();
        updateDetails();
        updateVisualization();
        setActionFeedback(`Voice action: showing ${stationType} stations.`);
    } else {
        setActionFeedback(
            "Command not recognized. Try “show central,” “show terminal stations,” “highlight station 23,” or “reset.”"
        );
    }

    d3.select("#voice-status").text("Voice control inactive.");
}

function highlightStation(id, feedback) {
    const station = nodeById.get(id);
    if (!station) return;

    selectedStationId = id;

    const stationIsVisible =
        (activeDistrict === "All" || station.district === activeDistrict) &&
        (activeType === "All" || station.station_type === activeType);

    if (!stationIsVisible) {
        activeDistrict = "All";
        activeType = "All";
    }

    updateControls();
    updateDetails();
    updateVisualization();
    if (feedback) setActionFeedback(feedback);
}

function resetVisualization(feedback) {
    activeDistrict = "All";
    activeType = "All";
    selectedStationId = null;

    updateControls();
    updateDetails();
    updateVisualization();
    setActionFeedback(feedback);
}

function updateControls() {
    districtFilter.property("value", activeDistrict);
    typeFilter.property("value", activeType);
    stationSelect.property("value", selectedStationId || "");
}

function updateVisualization() {
    if (!nodeSelection) return;

    const visibleIds = new Set(nodes.filter(d =>
        (activeDistrict === "All" || d.district === activeDistrict) &&
        (activeType === "All" || d.station_type === activeType)
    ).map(d => d.id));

    nodeSelection
        .classed("selected", d => d.id === selectedStationId)
        .attr("opacity", d => {
            if (!visibleIds.has(d.id)) return 0.06;
            if (!selectedStationId) return 1;
            return d.id === selectedStationId || areConnected(d.id, selectedStationId) ? 1 : 0.16;
        })
        .style("pointer-events", d => visibleIds.has(d.id) ? "all" : "none");

    labelSelection.attr("opacity", d => {
        if (!visibleIds.has(d.id)) return 0.04;
        if (!selectedStationId) return 1;
        return d.id === selectedStationId || areConnected(d.id, selectedStationId) ? 1 : 0.12;
    });

    linkSelection
        .attr("stroke-opacity", d => {
            const isVisible = visibleIds.has(d.sourceId) && visibleIds.has(d.targetId);
            if (!isVisible) return 0.02;
            if (!selectedStationId) return 0.58;
            return d.sourceId === selectedStationId || d.targetId === selectedStationId ? 1 : 0.06;
        });

    const visibleRouteCount = links.filter(d =>
        visibleIds.has(d.sourceId) && visibleIds.has(d.targetId)
    ).length;

    d3.select("#filter-summary").text(
        `${visibleIds.size} of ${nodes.length} stations and ${visibleRouteCount} of ${links.length} routes are visible.`
    );
}

function updateDetails() {
    const details = d3.select("#selection-details");

    if (!selectedStationId) {
        details.html("<p>Highlight a station by voice, dropdown, mouse, or keyboard.</p>");
        return;
    }

    const station = nodeById.get(selectedStationId);
    const stationLinks = links.filter(d =>
        d.sourceId === selectedStationId || d.targetId === selectedStationId
    );

    const connections = stationLinks.map(link => {
        const otherId = link.sourceId === selectedStationId ? link.targetId : link.sourceId;
        return `<li>${nodeById.get(otherId).station_name}: ${link.route_type}, ${link.travel_time_min} minutes</li>`;
    }).join("");

    details.html(`
        <h4>${station.station_name}</h4>
        <div class="details-grid">
            <p><strong>District:</strong> ${station.district}</p>
            <p><strong>Station type:</strong> ${station.station_type}</p>
            <p><strong>Daily passengers:</strong> ${formatNumber(station.daily_passengers)}</p>
            <p><strong>Direct connections:</strong> ${stationLinks.length}</p>
        </div>
        <ul class="connection-list">${connections}</ul>
    `);
}

function setActionFeedback(message) {
    d3.select("#voice-action").text(message);
}

function displayFilterName(value, label) {
    return value === "All" ? `all ${label}s` : value;
}

function areConnected(firstId, secondId) {
    return links.some(d =>
        (d.sourceId === firstId && d.targetId === secondId) ||
        (d.sourceId === secondId && d.targetId === firstId)
    );
}

function ticked() {
    nodes.forEach(d => {
        d.x = Math.max(padding, Math.min(width - padding - 70, d.x));
        d.y = Math.max(padding, Math.min(height - padding, d.y));
    });

    linkSelection
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

    nodeSelection.attr("transform", d => `translate(${d.x},${d.y})`);
    labelSelection.attr("x", d => d.x).attr("y", d => d.y);
}

function showStationTooltip(event, station) {
    tooltip.style("opacity", 1).html(`
        <strong>${station.station_name}</strong><br>
        ${station.district} · ${station.station_type}<br>
        Daily passengers: ${formatNumber(station.daily_passengers)}
    `);
    moveTooltip(event);
}

function moveTooltip(event) {
    if (!event || event.pageX === undefined) return;

    tooltip
        .style("left", `${event.pageX + 14}px`)
        .style("top", `${event.pageY + 14}px`);
}

function hideTooltip() {
    tooltip.style("opacity", 0);
}

function dragStarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.25).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
}

function dragEnded(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
}
