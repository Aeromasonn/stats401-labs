const width = 1000;
const height = 600;

const margin = {
    top: 40,
    right: 280,
    bottom: 70,
    left: 70
};

const tooltip = d3.select("#tooltip");

d3.csv(
    "../data/cities_multivariate.csv",
    d => ({
        city: d.city,
        population: +d.population,
        temp_c: +d.temp_c,
        development_lv: d.development_level,
        region: d.region
    })
)
.then(data => {

    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const xScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.population))
        .nice()
        .range([
            margin.left,
            width - margin.right
        ]);

    const yScale = d3.scaleLinear()
        .domain(d3.extent(data, d => d.temp_c))
        .nice()
        .range([
            height - margin.bottom,
            margin.top
        ]);

    const region = Array.from(
        new Set(data.map(d => d.region))
    );

    const colorScale = d3.scaleOrdinal()
        .domain(region)
        .range(d3.schemeTableau10);

    const sizeScale = d3.scaleOrdinal()
        .domain([
            "Low",
            "Medium",
            "High"
        ])
        .range([5, 7, 9]);

    svg.append("g")
        .attr(
            "transform",
            `translate(0, ${height - margin.bottom})`
        )
        .call(d3.axisBottom(xScale));

    svg.append("g")
        .attr(
            "transform",
            `translate(${margin.left}, 0)`
        )
        .call(d3.axisLeft(yScale));

    svg.selectAll(".city")
        .data(data)
        .join("circle")
        .attr("class", "city")
        .attr(
            "cx",
            d => xScale(d.population)
        )
        .attr(
            "cy",
            d => yScale(d.temp_c)
        )
        .attr(
            "r",
            d => sizeScale(d.development_lv)
        )
        .attr(
            "fill",
            d => colorScale(d.region)
        )
        .attr("opacity", 0.8)
        .on("mouseover", function(event, d) {

            tooltip
                .style("opacity", 1)
                .html(`
                    <strong>${d.city}</strong><br>
                    Population: ${d.population}<br>
                    Development Level: ${d.development_lv}<br>
                    Region: ${d.region}<br>
                `);
        })
        .on("mousemove", function(event) {

            tooltip
                .style(
                    "left",
                    `${event.pageX + 10}px`
                )
                .style(
                    "top",
                    `${event.pageY + 10}px`
                );
        })
        .on("mouseout", function() {

            tooltip
                .style("opacity", 0);
        });

    const legendX = width - margin.right + 40;

    const legend = svg.append("g")
        .attr("transform", `translate(${legendX}, 100)`);

    legend.append("text")
        .attr("x", 0)
        .attr("y", 0)
        .attr("font-weight", "bold")
        .text("Region");

    const devLegend = legend.selectAll(".dev-legend")
        .data(colorScale.domain())
        .join("g")
        .attr("Region", "dev-legend")
        .attr("transform", (d, i) => `translate(0, ${30+i*25})`);
    
    devLegend.append("circle")
        .attr("r", 7)
        .attr("fill", d => colorScale(d))

    devLegend.append("text")
        .attr("x", 20)
        .attr("y", 5)
        .text(d => d);

    svg.append("text")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", height - 20)
        .attr("text-anchor", "middle")
        .text("Population");
    
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -(margin.top + height - margin.bottom) / 2)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .text("Temperature")
});

