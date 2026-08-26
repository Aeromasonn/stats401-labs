d3.csv("../data/students.csv", d => ({
    name: d.name,
    score: +d.score
}))
.then(data => {
    console.log(data);

    const svgWidth = 600;
    const svgHeight = 350;

    const barWidth = 40;
    const gap = 25;
    const scale = 2.5;

    const bottomMargin = 50;

    const svg = d3.select("#chart")
        .append("svg")
        .attr("width", svgWidth)
        .attr("height", svgHeight);

    svg.selectAll("rect")
        .data(data)
        .join("rect")
        .attr("x", (d, i) => 30 + i * (barWidth + gap))
        .attr("y", d => svgHeight - bottomMargin - d.score * scale)
        .attr("width", barWidth)
        .attr("height", d => d.score * scale)
        .attr("fill", "steelblue");

    svg.selectAll(".name")
        .data(data)
        .join("text")
        .attr("class", "name")
        .attr("x", (d, i) => 30 + i * (barWidth + gap) + barWidth / 2)
        .attr("y", svgHeight - 25)
        .attr("text-anchor", "middle")
        .text(d => d.name);

    svg.selectAll(".score")
        .data(data)
        .join("text")
        .attr("class", "score")
        .attr("x", (d, i) => 30 + i * (barWidth + gap) + barWidth / 2)
        .attr("y", d => svgHeight - bottomMargin - d.score * scale - 8)
        .attr("text-anchor", "middle")
        .text(d => d.score);

});
