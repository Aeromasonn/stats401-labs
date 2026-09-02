const table = d3.select("#data-table");
const status = d3.select("#table-status");
const recordCount = d3.select("#record-count");

d3.csv("../data/lab3_data.csv")
    .then(data => {
        const columns = data.columns;
        const sortDirections = new Map();

        const header = table.select("thead")
            .append("tr");

        header.selectAll("th")
            .data(columns)
            .join("th")
            .text(column => column)
            .attr("tabindex", 0)
            .attr("role", "button")
            .attr("aria-sort", "none")
            .on("click", (_, column) => sortBy(column))
            .on("keydown", (event, column) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    sortBy(column);
                }
            });

        function compareValues(a, b) {
            const aNumber = Number(a);
            const bNumber = Number(b);

            if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) {
                return d3.ascending(aNumber, bNumber);
            }

            return d3.ascending(a, b);
        }

        function sortBy(column) {
            const ascending = !sortDirections.get(column);
            sortDirections.clear();
            sortDirections.set(column, ascending);

            data.sort((a, b) => {
                const result = compareValues(a[column], b[column]);
                return ascending ? result : -result;
            });

            header.selectAll("th")
                .attr("aria-sort", name => (
                    name === column
                        ? (ascending ? "ascending" : "descending")
                        : "none"
                ));

            updateRows();
        }

        function updateRows() {
            table.select("tbody")
                .selectAll("tr")
                .data(data)
                .join("tr")
                .selectAll("td")
                .data(row => columns.map(column => row[column]))
                .join("td")
                .text(value => value);
        }

        updateRows();
        recordCount.text(d3.format(",")(data.length));
        status.text(`${data.length} records loaded. Click a heading to sort.`);
    })
    .catch(error => {
        console.error(error);
        recordCount.text("Unavailable");
        status.text("Unable to load the practice dataset. Run scrape_example.py first.");
    });
