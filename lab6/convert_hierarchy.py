from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

import pandas as pd


DATA_DIRECTORY = Path(__file__).resolve().parent.parent / "data"


def build_hierarchy(
    dataframe: pd.DataFrame,
    levels: list[str],
    leaf_values: Callable[[pd.Series], dict[str, Any]],
) -> list[dict[str, Any]]:
    current_level = levels[0]

    if len(levels) == 1:
        return [
            {
                "name": str(row[current_level]),
                **leaf_values(row),
            }
            for _, row in dataframe.iterrows()
        ]

    children = []
    for name, group in dataframe.groupby(current_level, sort=False):
        children.append(
            {
                "name": str(name),
                "children": build_hierarchy(group, levels[1:], leaf_values),
            }
        )

    return children


def write_json(data: dict[str, Any], output_name: str) -> None:
    """Write readable UTF-8 JSON without escaping geographic names."""
    output_path = DATA_DIRECTORY / output_name

    with output_path.open("w", encoding="utf-8") as file:
        json.dump(data, file, indent=2, ensure_ascii=False)

    print(f"Created {output_path}")


def convert_population_data() -> None:
    dataframe = pd.read_csv(DATA_DIRECTORY / "lab6_small_hierarchy.csv")
    root_names = dataframe["root"].dropna().unique()

    if len(root_names) != 1:
        raise ValueError("The population CSV must contain exactly one root name.")

    hierarchy = {
        "name": str(root_names[0]),
        "children": build_hierarchy(
            dataframe,
            ["continent", "country", "region", "city"],
            lambda row: {"value": int(row["population_thousands"])},
        ),
    }

    write_json(hierarchy, "lab6_small_hierarchy.json")


def convert_gdp_data() -> None:
    dataframe = pd.read_csv(DATA_DIRECTORY / "lab6_assignment_gdp.csv")

    hierarchy = {
        "name": "World",
        "children": build_hierarchy(
            dataframe,
            ["continent", "area", "country"],
            lambda row: {
                "gdp": int(row["gdp_billion_usd"]),
                "status": str(row["gdp_status"]),
            },
        ),
    }

    write_json(hierarchy, "lab6_assignment_gdp.json")


if __name__ == "__main__":
    convert_population_data()
    convert_gdp_data()
