const tooltip = d3.select("#tooltip");
const loadStatus = d3.select("#load-status");

const populationFormat = d3.format(",");
const gdpFormat = d3.format(",");

const continentColor = d3.scaleOrdinal()
    .domain(["North America", "Europe", "Asia"])
    .range(["#4e79a7", "#f28e2b", "#59a14f"]);

const statusColor = d3.scaleOrdinal()
    .domain(["Increase", "Unchanged", "Decrease"])
    .range(["#4daf70", "#94a3b8", "#e76f51"]);


function hierarchyPath(node) {
    return node.ancestors()
        .reverse()
        .map(ancestor => ancestor.data.name)
        .join(" → ");
}


function topLevelAncestor(node) {
    let current = node;

    while (current.depth > 1) {
        current = current.parent;
    }

    return current;
}


function showTooltip(event, html) {
    tooltip
        .classed("visible", true)
        .html(html)
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY + 12}px`);
}


function moveTooltip(event) {
    tooltip
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY + 12}px`);
}


function hideTooltip() {
    tooltip.classed("visible", false);
}


function renderCollapsibleTree(data) {
    const width = 1100;
    const height = 650;
    const margin = { top: 35, right: 190, bottom: 35, left: 110 };

    const root = d3.hierarchy(data)
        .sum(d => d.value || 0);

    root.eachBefore((node, index) => {
        node.id = index;
    });

    const treeLayout = d3.tree()
        .size([
            height - margin.top - margin.bottom,
            width - margin.left - margin.right,
        ]);

    const svg = d3.select("#tree")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", "Collapsible hierarchy from World to cities");

    const treeGroup = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const linkLayer = treeGroup.append("g");
    const nodeLayer = treeGroup.append("g");
    const horizontalLink = d3.linkHorizontal()
        .x(node => node.y)
        .y(node => node.x);

    function toggleNode(event, node) {
        if (node.children) {
            node._children = node.children;
            node.children = null;
        } else if (node._children) {
            node.children = node._children;
            node._children = null;
        }

        updateTree();
    }

    function updateTree() {
        treeLayout(root);

        linkLayer.selectAll("path")
            .data(root.links(), link => link.target.id)
            .join(
                enter => enter.append("path")
                    .attr("class", "tree-link")
                    .attr("d", horizontalLink),
                update => update,
                exit => exit.remove(),
            )
            .transition()
            .duration(350)
            .attr("d", horizontalLink);

        const nodes = nodeLayer.selectAll("g")
            .data(root.descendants(), node => node.id)
            .join(
                enter => {
                    const group = enter.append("g")
                        .attr("class", "tree-node")
                        .on("click", toggleNode)
                        .on("keydown", (event, node) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggleNode(event, node);
                            }
                        });

                    group.append("circle")
                        .attr("r", 7);

                    group.append("text")
                        .attr("dy", "0.35em")
                        .text(node => node.data.name);

                    return group;
                },
                update => update,
                exit => exit.remove(),
            )
            .attr("class", node =>
                node.children || node._children
                    ? "tree-node is-branch"
                    : "tree-node"
            )
            .attr("role", node => node.children || node._children ? "button" : null)
            .attr("tabindex", node => node.children || node._children ? 0 : null)
            .attr("aria-label", node =>
                node.children || node._children
                    ? `${node.data.name}: ${node.children ? "expanded" : "collapsed"}`
                    : node.data.name
            );

        nodes.transition()
            .duration(350)
            .attr("transform", node => `translate(${node.y},${node.x})`);

        nodes.select("circle")
            .attr("fill", node => {
                if (node._children) return "#1d4ed8";
                if (node.children) return "#4e79a7";
                return "#f28e2b";
            });

        nodes.select("text")
            .attr("x", node => node.children || node._children ? -11 : 11)
            .attr("text-anchor", node =>
                node.children || node._children ? "end" : "start"
            );
    }

    updateTree();
}


function renderPopulationTreemap(data) {
    const width = 1000;
    const height = 520;

    const root = d3.hierarchy(data)
        .sum(d => d.value || 0)
        .sort((a, b) => b.value - a.value);

    d3.treemap()
        .tile(d3.treemapSquarify)
        .size([width, height])
        .paddingInner(3)
        .paddingOuter(3)(root);

    const svg = d3.select("#population-treemap")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", "Zoomable treemap of population by geographic hierarchy");

    const backButton = d3.select("#population-back");
    const pathLabel = d3.select("#population-path");
    let focus = root;

    function renderFocus() {
        const visibleNodes = focus.children || [focus];
        const x = d3.scaleLinear()
            .domain([focus.x0, focus.x1])
            .range([0, width]);
        const y = d3.scaleLinear()
            .domain([focus.y0, focus.y1])
            .range([0, height]);

        const cells = svg.selectAll("g")
            .data(visibleNodes, node => hierarchyPath(node))
            .join(enter => {
                const cell = enter.append("g")
                    .attr("class", "population-cell")
                    .on("click", (event, node) => {
                        if (node.children) {
                            hideTooltip();
                            focus = node;
                            renderFocus();
                        }
                    })
                    .on("mouseenter", (event, node) => {
                        showTooltip(
                            event,
                            `<strong>${node.data.name}</strong><br>`
                            + `${hierarchyPath(node)}<br>`
                            + `Population: ${populationFormat(node.value)} thousand`,
                        );
                    })
                    .on("mousemove", moveTooltip)
                    .on("mouseleave", hideTooltip);

                cell.append("rect");
                cell.append("text")
                    .attr("class", "population-name");
                cell.append("text")
                    .attr("class", "population-value");

                return cell;
            })
            .attr("class", node =>
                node.children
                    ? "population-cell is-branch"
                    : "population-cell"
            );

        cells.transition()
            .duration(450)
            .attr("transform", node => `translate(${x(node.x0)},${y(node.y0)})`);

        cells.select("rect")
            .transition()
            .duration(450)
            .attr("width", node => Math.max(0, x(node.x1) - x(node.x0)))
            .attr("height", node => Math.max(0, y(node.y1) - y(node.y0)))
            .attr("fill", node => continentColor(topLevelAncestor(node).data.name))
            .attr("fill-opacity", node => node.children ? 0.78 : 0.9);

        cells.select(".population-name")
            .attr("x", 10)
            .attr("y", 25)
            .text(node => node.data.name)
            .style("display", node =>
                x(node.x1) - x(node.x0) > 85 && y(node.y1) - y(node.y0) > 42
                    ? null
                    : "none"
            );

        cells.select(".population-value")
            .attr("x", 10)
            .attr("y", 45)
            .text(node => `${populationFormat(node.value)} thousand`)
            .style("display", node =>
                x(node.x1) - x(node.x0) > 120 && y(node.y1) - y(node.y0) > 62
                    ? null
                    : "none"
            );

        pathLabel.text(hierarchyPath(focus));
        backButton.property("disabled", !focus.parent);
    }

    backButton.on("click", () => {
        if (focus.parent) {
            hideTooltip();
            focus = focus.parent;
            renderFocus();
        }
    });

    renderFocus();
}


function renderGdpTreemap(selector, data, tileMethod, accessibleName) {
    const width = 1000;
    const height = 590;

    const root = d3.hierarchy(data)
        .sum(d => d.gdp || 0)
        .sort((a, b) => b.value - a.value);

    d3.treemap()
        .tile(tileMethod)
        .size([width, height])
        .paddingOuter(4)
        .paddingInner(2)
        .paddingTop(node => {
            if (node.depth === 1) return 22;
            if (node.depth === 2) return 17;
            return 0;
        })(root);

    const svg = d3.select(selector)
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", accessibleName);

    const leaves = root.leaves();
    const cells = svg.append("g")
        .selectAll("g")
        .data(leaves)
        .join("g")
        .attr("class", "gdp-cell")
        .attr("transform", node => `translate(${node.x0},${node.y0})`)
        .on("mouseenter", (event, node) => {
            const continent = node.ancestors()
                .find(ancestor => ancestor.depth === 1)
                .data.name;
            const area = node.parent.data.name;

            showTooltip(
                event,
                `<strong>${node.data.name}</strong><br>`
                + `Continent: ${continent}<br>`
                + `Area: ${area}<br>`
                + `GDP: $${gdpFormat(node.data.gdp)} billion<br>`
                + `GDP status: ${node.data.status}`,
            );
        })
        .on("mousemove", moveTooltip)
        .on("mouseleave", hideTooltip);

    cells.append("rect")
        .attr("width", node => Math.max(0, node.x1 - node.x0))
        .attr("height", node => Math.max(0, node.y1 - node.y0))
        .attr("fill", node => statusColor(node.data.status));

    cells.append("text")
        .attr("class", "country-label")
        .attr("x", 5)
        .attr("y", 16)
        .text(node => node.data.name)
        .style("display", node =>
            node.x1 - node.x0 > 48 && node.y1 - node.y0 > 23
                ? null
                : "none"
        );

    cells.append("title")
        .text(node =>
            `${node.data.name}: $${gdpFormat(node.data.gdp)} billion, ${node.data.status}`
        );

    const groups = root.descendants()
        .filter(node => node.depth === 1 || node.depth === 2);

    svg.append("g")
        .selectAll("rect")
        .data(groups)
        .join("rect")
        .attr("class", node =>
            node.depth === 1
                ? "group-outline continent-outline"
                : "group-outline area-outline"
        )
        .attr("x", node => node.x0)
        .attr("y", node => node.y0)
        .attr("width", node => Math.max(0, node.x1 - node.x0))
        .attr("height", node => Math.max(0, node.y1 - node.y0));

    svg.append("g")
        .selectAll("text")
        .data(groups)
        .join("text")
        .attr("class", node =>
            node.depth === 1
                ? "group-label continent-label"
                : "group-label area-label"
        )
        .attr("x", node => node.x0 + 5)
        .attr("y", node => node.y0 + (node.depth === 1 ? 15 : 12))
        .text(node => node.data.name)
        .style("display", node =>
            node.x1 - node.x0 > 55 && node.y1 - node.y0 > 20
                ? null
                : "none"
        );
}


Promise.all([
    d3.json("../data/lab6_small_hierarchy.json"),
    d3.json("../data/lab6_assignment_gdp.json"),
])
    .then(([populationData, gdpData]) => {
        renderCollapsibleTree(populationData);
        renderPopulationTreemap(populationData);

        renderGdpTreemap(
            "#gdp-squarify",
            gdpData,
            d3.treemapSquarify,
            "GDP treemap using squarify segmentation",
        );

        renderGdpTreemap(
            "#gdp-slice-dice",
            gdpData,
            d3.treemapSliceDice,
            "GDP treemap using slice-dice segmentation",
        );

    })
    .catch(error => {
        console.error(error);
        loadStatus
            .classed("error", true)
            .text("The Lab 6 data could not be loaded. Run convert_hierarchy.py and serve the repository over HTTP.");
    });
