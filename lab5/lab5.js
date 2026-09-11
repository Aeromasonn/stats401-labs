Promise.all([
    d3.csv(
        "../data/lab5_assignment_stations.csv",
        d => ({
            id: d.id,
            station_name: d.station_name,
            district: d.district,
            daily_passengers: +d.daily_passengers,
            station_type: d.station_type
        })
    ),
    d3.csv(
        "../data/lab5_assignment_routes.csv",
        d => ({
            source: d.source,
            target: d.target,
            travel_time_min: +d.travel_time_min,
            route_type: d.route_type
        })
    )
])
    .then(([nodes, links]) => {
        const width = 900;
        const height = 650;

        const graphPadding = {
            top: 35,
            right: 85,
            bottom: 35,
            left: 35
        };

        const svg = d3.select("#chart")
            .append("svg")
            .attr("width", width)
            .attr("height", height)
            .attr("viewBox", `0 0 ${width} ${height}`);

        const sizeScale = d3.scaleSqrt()
            .domain(d3.extent(nodes, d => d.daily_passengers))
            .range([6, 18]);

        const districts = Array.from(new Set(nodes.map(d => d.district)));

        const colorScale = d3.scaleOrdinal()
            .domain(districts)
            .range(d3.schemeTableau10);

        const linkWidthScale = d3.scaleLinear()
            .domain(d3.extent(links, d => d.travel_time_min))
            .range([1, 6]);

        const routeTypes = Array.from(new Set(links.map(d => d.route_type)));

        const linkColorScale = d3.scaleOrdinal()
            .domain(routeTypes)
            .range(d3.schemeSet2);

        const stationTypeScale = d3.scaleOrdinal()
            .domain(new Set(["Local", "Transfer", "Terminal"]))
            .range([
                d3.symbolCircle,
                d3.symbolTriangle,
                d3.symbolSquare
            ]);

        const link = svg.append("g")
            .attr("class", "links")
            .selectAll("line")
            .data(links)
            .join("line")
            .attr("stroke", d => linkColorScale(d.route_type))
            .attr("stroke-width", d => linkWidthScale(d.travel_time_min))
            .attr("stroke-opacity", 0.6);

        const node = svg.append("g")
            .attr("class", "nodes")
            .selectAll("path")
            .data(nodes)
            .join("path")
            .attr(
                "d",
                d => d3.symbol()
                    .type(stationTypeScale(d.station_type))
                    .size(Math.PI * sizeScale(d.daily_passengers) ** 2)()
            )
            .attr("fill", d => colorScale(d.district))
            .attr("stroke", "#ffffff")
            .attr("stroke-width", 1)
            .attr("aria-label", d => `${d.station_name}: ${d.station_type}`);

        const label = svg.append("g")
            .attr("class", "labels")
            .selectAll("text")
            .data(nodes)
            .join("text")
            .text(d => d.station_name)
            .attr("font-size", 12)
            .attr("dx", 12)
            .attr("dy", 4);

        const simulation = d3.forceSimulation(nodes)
            .force(
                "link",
                d3.forceLink(links)
                    .id(d => d.id)
                    .distance(75)
            )
            .force(
                "charge",
                d3.forceManyBody()
                    .strength(-160)
            )
            .force(
                "center",
                d3.forceCenter(width / 2, height / 2)
            )
            .force(
                "collision",
                d3.forceCollide()
                    .radius(25)
            )
            .force(
                "x",
                d3.forceX(width / 2)
                    .strength(0.04)
            )
            .force(
                "y",
                d3.forceY(height / 2)
                    .strength(0.04)
            );

        simulation.on(
            "tick",
            () => {
                nodes.forEach(
                    currentNode => {
                        currentNode.x = Math.max(
                            graphPadding.left,
                            Math.min(width - graphPadding.right, currentNode.x)
                        );

                        currentNode.y = Math.max(
                            graphPadding.top,
                            Math.min(height - graphPadding.bottom, currentNode.y)
                        );
                    }
                );

                link
                    .attr("x1", d => d.source.x)
                    .attr("y1", d => d.source.y)
                    .attr("x2", d => d.target.x)
                    .attr("y2", d => d.target.y);

                node
                    .attr("transform", d => `translate(${d.x},${d.y})`);

                label
                    .attr("x", d => d.x)
                    .attr("y", d => d.y);
            }
        );

        function dragStarted(event, d) {
            if (!event.active) {
                simulation
                    .alphaTarget(0.3)
                    .restart();
            }

            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }

        function dragEnded(event, d) {
            if (!event.active) {
                simulation.alphaTarget(0);
            }

            d.fx = null;
            d.fy = null;
        }

        node.call(
            d3.drag()
                .on("start", dragStarted)
                .on("drag", dragged)
                .on("end", dragEnded)
        );

        function isConnected(nodeA, nodeB) {
            return links.some(
                networkLink =>
                    (
                        networkLink.source.id === nodeA.id
                        && networkLink.target.id === nodeB.id
                    )
                    ||
                    (
                        networkLink.source.id === nodeB.id
                        && networkLink.target.id === nodeA.id
                    )
            );
        }

        const tooltip = d3.select("#tooltip");

        node
            .on(
                "mouseover.highlight",
                function(event, d) {
                    node.attr(
                        "opacity",
                        other =>
                            other.id === d.id || isConnected(d, other)
                                ? 1
                                : 0.15
                    );

                    link.attr(
                        "opacity",
                        networkLink =>
                            networkLink.source.id === d.id
                            || networkLink.target.id === d.id
                                ? 1
                                : 0.1
                    );

                    label.attr(
                        "opacity",
                        other =>
                            other.id === d.id || isConnected(d, other)
                                ? 1
                                : 0.15
                    );
                }
            )
            .on(
                "mouseout.highlight",
                function() {
                    node.attr("opacity", 1);
                    link.attr("opacity", 0.6);
                    label.attr("opacity", 1);
                }
            )
            .on(
                "mouseover.tooltip",
                function(event, d) {
                    tooltip
                        .style("opacity", 1)
                        .html(`
                            <strong>${d.station_name}</strong><br>
                            District: ${d.district}<br>
                            Daily passengers: ${d.daily_passengers}<br>
                            Station type: ${d.station_type}
                        `);
                }
            )
            .on(
                "mousemove.tooltip",
                function(event) {
                    tooltip
                        .style("left", `${event.pageX + 10}px`)
                        .style("top", `${event.pageY + 10}px`);
                }
            )
            .on(
                "mouseout.tooltip",
                function() {
                    tooltip.style("opacity", 0);
                }
            );

        const matrixData = [];

        nodes.forEach(
            rowNode => {
                nodes.forEach(
                    colNode => {
                        const foundLink = links.find(
                            networkLink =>
                                (
                                    networkLink.source.id === rowNode.id
                                    && networkLink.target.id === colNode.id
                                )
                                ||
                                (
                                    networkLink.source.id === colNode.id
                                    && networkLink.target.id === rowNode.id
                                )
                        );

                        matrixData.push({
                            row: rowNode.id,
                            col: colNode.id,
                            travel_time_min:
                                foundLink
                                    ? foundLink.travel_time_min
                                    : 0,
                            route_type:
                                foundLink
                                    ? foundLink.route_type
                                    : null
                        });
                    }
                );
            }
        );

        const matrixSize = 650;

        const matrixMargin = {
            top: 105,
            right: 20,
            bottom: 20,
            left: 110
        };

        const matrixWidth =
            matrixMargin.left
            + matrixSize
            + matrixMargin.right;

        const matrixHeight =
            matrixMargin.top
            + matrixSize
            + matrixMargin.bottom;

        const matrixX = d3.scaleBand()
            .domain(nodes.map(d => d.id))
            .range([0, matrixSize])
            .padding(0.02);

        const matrixY = d3.scaleBand()
            .domain(nodes.map(d => d.id))
            .range([0, matrixSize])
            .padding(0.02);

        const opacityScale = d3.scaleLinear()
            .domain(d3.extent(links, d => d.travel_time_min))
            .range([0.25, 1]);

        const matrixSvg = d3.select("#matrix")
            .append("svg")
            .attr("width", matrixWidth)
            .attr("height", matrixHeight)
            .attr("viewBox", `0 0 ${matrixWidth} ${matrixHeight}`);

        const matrixGroup = matrixSvg.append("g")
            .attr(
                "transform",
                `translate(${matrixMargin.left},${matrixMargin.top})`
            );

        matrixGroup
            .selectAll("rect")
            .data(matrixData)
            .join("rect")
            .attr("x", d => matrixX(d.col))
            .attr("y", d => matrixY(d.row))
            .attr("width", matrixX.bandwidth())
            .attr("height", matrixY.bandwidth())
            .attr(
                "fill",
                d => d.travel_time_min > 0 ? "steelblue" : "#f3f3f3"
            )
            .attr(
                "fill-opacity",
                d =>
                    d.travel_time_min > 0
                        ? opacityScale(d.travel_time_min)
                        : 1
            );

        matrixGroup.append("g")
            .selectAll("text")
            .data(nodes)
            .join("text")
            .attr("class", "matrix-column-label")
            .attr("x", d => matrixX(d.id) + matrixX.bandwidth() / 2)
            .attr("y", -8)
            .attr("text-anchor", "start")
            .attr(
                "transform",
                d => {
                    const x = matrixX(d.id) + matrixX.bandwidth() / 2;

                    return `rotate(-90, ${x}, -8)`;
                }
            )
            .text(d => d.station_name);

        matrixGroup.append("g")
            .selectAll("text")
            .data(nodes)
            .join("text")
            .attr("class", "matrix-row-label")
            .attr("x", -8)
            .attr("y", d => matrixY(d.id) + matrixY.bandwidth() / 2)
            .text(d => d.station_name);
    });
