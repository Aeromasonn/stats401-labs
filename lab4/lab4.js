const status = d3.select("#chart-status");
const chart = d3.select("#chart");

const sentimentBin = score => {
    if (score < -0.2) return "Negative";
    if (score < 0.2) return "Neutral";
    return "Positive";
};

const sentimentColor = d3.scaleOrdinal()
    .domain(["Negative", "Neutral", "Positive"])
    .range(["#c2410c", "#64748d", "#15803d"]);

d3.csv("../data/sentiment_by_month.csv", 
    d => ({
        month: d3.timeParse("%Y-%m")(d.month), tweetCount: +d.tweet_count,
        sentiment: +d.mean_sentiment_score, favorites: +d.mean_favorites, retweets: +d.mean_retweets,
        sentimentBin: sentimentBin(+d.mean_sentiment_score),
})).then(data => {
    const width = 1000, height = 460, margin = { top: 30, right: 20, bottom: 60, left: 70 };
    const innerWidth = width - margin.left - margin.right, innerHeight = height - margin.top - margin.bottom;
    const svg = chart.append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img")
        .attr("aria-label", "Average RoBERTa sentiment by month; point size shows mean favorites.");
    const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const x = d3.scaleTime().domain(d3.extent(data, d => d.month)).range([0, innerWidth]);
    const y = d3.scaleLinear().domain([-1, 1]).range([innerHeight, 0]);
    const radius = d3.scaleSqrt().domain([0, d3.max(data, d => d.favorites)]).range([3, 18]);

    plot.append("g")
        .attr("class", "grid")
        .call(d3.axisLeft(y)
        .ticks(5)
        .tickSize(-innerWidth)
        .tickFormat(""));

    plot.append("path")
        .datum(data)
        .attr("class", "sentiment-line")
        .attr("d", d3.line().x(d => x(d.month)).y(d => y(d.sentiment)));

    const tooltip = chart.append("div")
                        .attr("class", "tooltip")
                        .attr("role", "status");

    plot.selectAll("circle")
        .data(data)
        .join("circle")
        .attr("class", "month-point")
        .attr("cx", d => 
            x(d.month))
            .attr("cy", d => y(d.sentiment))
            .attr("r", d => radius(d.favorites))
        .attr("fill", d => sentimentColor(d.sentimentBin))
        .on("mouseenter", (event, d) => tooltip.html(`<strong>${d3.timeFormat("%B %Y")(d.month)}</strong><br>Sentiment: ${d.sentimentBin}<br>Tweets: ${d3.format(",")(d.tweetCount)}<br>Mean favorites: ${d3.format(",.0f")(d.favorites)}<br>Mean retweets: ${d3.format(",.0f")(d.retweets)}`)
                                                .classed("visible", true))
        .on("mousemove", event => { const [xPosition, yPosition] = d3.pointer(event, chart.node()); tooltip.style("left", `${xPosition + 14}px`).style("top", `${yPosition - 12}px`); })
        .on("mouseleave", () => tooltip.classed("visible", false));
    
    plot.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat("%Y")));

    plot.append("g")
        .call(d3.axisLeft(y).ticks(5));
    plot.append("text")
        .attr("class", "axis-label")
        .attr("x", innerWidth / 2)
        .attr("y", innerHeight + 48)
        .attr("text-anchor", "middle")
        .text("Month");

    plot.append("text")
        .attr("class", "axis-label")
        .attr("transform", "rotate(-90)")
        .attr("x", -innerHeight / 2)
        .attr("y", -48)
        .attr("text-anchor", "middle");

    const legend = plot.append("g")
                        .attr("class", "sentiment-legend")
                        .attr("transform", `translate(${innerWidth - 175}, 8)`);

    legend.selectAll("g")
        .data(sentimentColor.domain())
        .join("g")
        .attr("transform", (_, index) => `translate(0, ${index * 22})`)
        .each(function(label) {
            const item = d3.select(this);
            item.append("circle").attr("r", 6).attr("fill", sentimentColor(label));
            item.append("text").attr("x", 12).attr("y", 4).text(label);
        });

    status.text(`${d3.format(",")(d3.sum(data, d => d.tweetCount))} processed tweets across ${data.length} months.`);
    
});
