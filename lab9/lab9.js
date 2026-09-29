const tooltip = d3.select("#tooltip");
const loadStatus = d3.select("#load-status");

const mapWidth = 1000;
const mapHeight = 560;
const missingColor = "#e5e7eb";
const gdpFormat = d3.format("$,.1f");

let selectedIso3 = null;


function countryIso3(properties) {
    const candidates = [
        properties.ISO_A3,
        properties.ADM0_A3,
        properties.ISO_A3_EH,
    ];

    return candidates.find(code => code && code !== "-99") || null;
}


function countryName(properties) {
    return properties.NAME_LONG || properties.ADMIN || properties.NAME || "Unknown";
}


function showTooltip(event, properties) {
    const value = properties.gdp;
    const valueText = value == null
        ? "No data in the provided top-50 dataset"
        : `${gdpFormat(value)} billion`;

    tooltip
        .classed("visible", true)
        .html(
            `<strong>${properties.gdpCountry || countryName(properties)}</strong><br>`
            + `2025 nominal GDP: ${valueText}`
            + (properties.rank == null ? "" : `<br>Top-50 rank: ${properties.rank}`),
        )
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


function updateLinkedHighlight(iso3) {
    d3.selectAll(".country, #cartogram path.feature")
        .classed("is-muted", datum => Boolean(iso3) && datum.properties.iso3 !== iso3)
        .classed("is-selected", datum => Boolean(iso3) && datum.properties.iso3 === iso3);
}


function selectCountry(iso3) {
    selectedIso3 = iso3;
    updateLinkedHighlight(iso3);
}


function attachCountryInteractions(selection, focusCountry) {
    selection
        .attr("role", "button")
        .attr("tabindex", 0)
        .on("mouseenter.linked", (event, feature) => {
            updateLinkedHighlight(feature.properties.iso3);
            showTooltip(event, feature.properties);
        })
        .on("mousemove.linked", moveTooltip)
        .on("mouseleave.linked", () => {
            hideTooltip();
            updateLinkedHighlight(selectedIso3);
        })
        .on("click.linked", (event, feature) => {
            event.stopPropagation();
            const nextIso3 = selectedIso3 === feature.properties.iso3
                ? null
                : feature.properties.iso3;

            selectCountry(nextIso3);

            if (nextIso3) {
                focusCountry(event, feature);
            }
        })
        .on("keydown.linked", (event, feature) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                const nextIso3 = selectedIso3 === feature.properties.iso3
                    ? null
                    : feature.properties.iso3;

                selectCountry(nextIso3);

                if (nextIso3) {
                    focusCountry(event, feature);
                }
            }
        });
}


function zoomTransformForBounds(bounds, centroid = null) {
    const [[x0, y0], [x1, y1]] = bounds;
    const dx = Math.max(1, x1 - x0);
    const dy = Math.max(1, y1 - y0);
    const centerX = centroid?.[0] ?? (x0 + x1) / 2;
    const centerY = centroid?.[1] ?? (y0 + y1) / 2;
    const fittedScale = 0.82 / Math.max(dx / mapWidth, dy / mapHeight);
    const scale = Math.max(2.2, Math.min(6, fittedScale));

    return d3.zoomIdentity
        .translate(mapWidth / 2, mapHeight / 2)
        .scale(scale)
        .translate(-centerX, -centerY);
}


function drawLegend(colorScale) {
    const width = 520;
    const height = 64;
    const margin = { top: 8, right: 20, bottom: 24, left: 20 };
    const legendWidth = width - margin.left - margin.right;

    const svg = d3.select("#color-legend")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("role", "img")
        .attr("aria-label", "Logarithmic legend for 2025 nominal GDP in billions of U.S. dollars");

    const gradientId = "gdp-color-gradient";
    const gradient = svg.append("defs")
        .append("linearGradient")
        .attr("id", gradientId);

    d3.range(0, 1.001, 0.05).forEach(offset => {
        const logMin = Math.log(colorScale.domain()[0]);
        const logMax = Math.log(colorScale.domain()[1]);
        const value = Math.exp(logMin + offset * (logMax - logMin));

        gradient.append("stop")
            .attr("offset", `${offset * 100}%`)
            .attr("stop-color", colorScale(value));
    });

    svg.append("rect")
        .attr("x", margin.left)
        .attr("y", margin.top)
        .attr("width", legendWidth)
        .attr("height", 14)
        .attr("fill", `url(#${gradientId})`);

    const legendScale = d3.scaleLog()
        .domain(colorScale.domain())
        .range([margin.left, margin.left + legendWidth]);

    svg.append("g")
        .attr("class", "legend-axis")
        .attr("transform", `translate(0,${margin.top + 14})`)
        .call(
            d3.axisBottom(legendScale)
                .tickValues([500, 1000, 5000, 10000, 30000])
                .tickFormat(value => `$${d3.format("~s")(value)}B`),
        );
}


function drawChoropleth(geoData, colorScale) {
    const projection = d3.geoNaturalEarth1()
        .fitExtent([[12, 12], [mapWidth - 12, mapHeight - 12]], geoData);

    const path = d3.geoPath(projection);
    const svg = d3.select("#choropleth")
        .append("svg")
        .attr("viewBox", `0 0 ${mapWidth} ${mapHeight}`)
        .attr("role", "img")
        .attr("aria-label", "World choropleth of 2025 nominal GDP for the top 50 economies");

    const mapGroup = svg.append("g");

    const countries = mapGroup.selectAll("path")
        .data(geoData.features)
        .join("path")
        .attr("class", "country")
        .attr("data-iso3", feature => feature.properties.iso3 || "")
        .attr("d", path)
        .attr("fill", feature => {
            const value = feature.properties.gdp;
            return value == null ? missingColor : colorScale(value);
        });

    countries.append("title")
        .text(feature => {
            const value = feature.properties.gdp;
            return value == null
                ? `${countryName(feature.properties)}: no data`
                : `${feature.properties.gdpCountry}: ${gdpFormat(value)} billion`;
        });

    const zoom = d3.zoom()
        .scaleExtent([1, 8])
        .on("zoom", event => {
            mapGroup.attr("transform", event.transform);
        });

    svg.call(zoom)
        .on("dblclick.zoom", null)
        .on("click.clear-selection", () => selectCountry(null));

    attachCountryInteractions(countries, (event, feature) => {
        const transform = zoomTransformForBounds(
            path.bounds(feature),
            path.centroid(feature),
        );

        svg.transition()
            .duration(600)
            .call(zoom.transform, transform);
    });

    d3.select("#reset-choropleth-zoom").on("click", () => {
        hideTooltip();
        selectCountry(null);
        svg.transition()
            .duration(450)
            .call(zoom.transform, d3.zoomIdentity);
    });
}


function drawCartogram(geoData, colorScale, minimumDisplayValue) {
    // cartogram-chart accepts TopoJSON, so convert the same joined GeoJSON used above.
    const topology = topojson.topology(
        {
            countries: {
                type: "FeatureCollection",
                features: geoData.features.filter(feature => feature.properties.ISO_A2 !== "AQ"),
            },
        },
        1e5,
    );

    const projection = d3.geoNaturalEarth1()
        .fitExtent([[12, 12], [mapWidth - 12, mapHeight - 12]], geoData);

    new Cartogram(document.getElementById("cartogram"))
        .width(mapWidth)
        .height(mapHeight)
        .topoJson(topology)
        .topoObjectName("countries")
        .projection(projection)
        .iterations(20)
        .value(feature => feature.properties.gdp ?? minimumDisplayValue)
        .color(feature => {
            const value = feature.properties.gdp;
            return value == null ? missingColor : colorScale(value);
        })
        .label(() => null)
        .tooltipContent(() => null)
        .onClick(null);

    function bindCartogramInteractions(attempt = 0) {
        const cartogramCountries = d3.selectAll("#cartogram path.feature");

        if (cartogramCountries.empty() && attempt < 20) {
            window.setTimeout(() => bindCartogramInteractions(attempt + 1), 50);
            return;
        }

        cartogramCountries.attr("data-iso3", feature => feature.properties.iso3 || "");

        cartogramCountries
            .filter(function() {
                return !this.querySelector("title");
            })
            .append("title")
            .text(feature => {
                const value = feature.properties.gdp;
                return value == null
                    ? `${countryName(feature.properties)}: no data`
                    : `${feature.properties.gdpCountry}: ${gdpFormat(value)} billion`;
            });

        const cartogramSvg = d3.select("#cartogram svg");
        const cartogramZoom = d3.zoom()
            .scaleExtent([1, 8])
            .on("zoom", event => {
                cartogramCountries.attr("transform", event.transform);
            });

        cartogramSvg.call(cartogramZoom)
            .on("dblclick.zoom", null)
            .on("click.clear-selection", () => selectCountry(null));

        const cartogramPath = d3.geoPath(null);

        attachCountryInteractions(cartogramCountries, (event, feature) => {
            const transform = zoomTransformForBounds(
                cartogramPath.bounds(feature),
                cartogramPath.centroid(feature),
            );

            cartogramSvg.transition()
                .duration(600)
                .call(cartogramZoom.transform, transform);
        });

        d3.select("#reset-cartogram-zoom").on("click", () => {
            hideTooltip();
            selectCountry(null);
            cartogramSvg.transition()
                .duration(450)
                .call(cartogramZoom.transform, d3.zoomIdentity);
        });
    }

    bindCartogramInteractions();
}


Promise.all([
    d3.json("world_countries.geojson"),
    d3.csv("lab9_gdp_2025_top50.csv", row => ({
        iso3: row.iso3,
        country: row.country,
        gdp: +row.gdp_2025_billion_usd,
        rank: +row.rank,
    })),
])
    .then(([geoData, gdpData]) => {
        const gdpByIso3 = new Map(gdpData.map(row => [row.iso3, row]));

        geoData.features.forEach(feature => {
            const iso3 = countryIso3(feature.properties);
            const record = gdpByIso3.get(iso3);

            feature.properties.iso3 = iso3;
            feature.properties.gdp = record?.gdp ?? null;
            feature.properties.rank = record?.rank ?? null;
            feature.properties.gdpCountry = record?.country ?? null;
        });

        const matchedIso3 = new Set(
            geoData.features
                .filter(feature => feature.properties.gdp != null)
                .map(feature => feature.properties.iso3),
        );

        const unmatched = gdpData.filter(row => !matchedIso3.has(row.iso3));

        if (unmatched.length > 0) {
            throw new Error(`Unmatched GDP identifiers: ${unmatched.map(row => row.iso3).join(", ")}`);
        }

        const gdpExtent = d3.extent(gdpData, row => row.gdp);
        const colorScale = d3.scaleSequentialLog(d3.interpolateBlues)
            .domain(gdpExtent);
        const minimumDisplayValue = gdpExtent[0] / 20;

        drawChoropleth(geoData, colorScale);
        drawLegend(colorScale);
        drawCartogram(geoData, colorScale, minimumDisplayValue);
    })
    .catch(error => {
        console.error(error);
        loadStatus
            .classed("error", true)
            .text("The Lab 9 data or map libraries could not be loaded. Serve the repository over HTTP and try again.");
    });
