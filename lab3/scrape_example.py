"""Tasks 6--10 and 16: scrape five Books to Scrape catalogue pages.

Before running this script with a different source, check its robots.txt and
terms of service. Do not bypass access restrictions or rate limits.
"""

from pathlib import Path
import time

import pandas as pd
import requests
from bs4 import BeautifulSoup


HEADERS = {"User-Agent": "STATS401-Class-Exercise/1.0"}
DATA_DIRECTORY = Path(__file__).resolve().parent.parent / "data"

# Books to Scrape has 20 catalogue records per page.
PAGE_COUNT = 50
RECORDS_PER_PAGE = 20
EXPECTED_RECORD_COUNT = PAGE_COUNT * RECORDS_PER_PAGE


def main():
    records = []
    table_path = DATA_DIRECTORY / "lab3_data.csv"
    completed_pages = set()

    # Resume an interrupted run without repeating pages already collected.
    if table_path.exists():
        existing_data = pd.read_csv(table_path)
        if set(existing_data.columns) == {"title", "price", "page"}:
            existing_data = existing_data[
                existing_data["page"].between(1, PAGE_COUNT)
            ]
            records = existing_data.to_dict("records")
            completed_pages = set(existing_data["page"].astype(int))
            print(f"Resuming with {len(records)} existing records.")

    for page in range(1, PAGE_COUNT + 1):
        if page in completed_pages:
            continue

        url = f"https://books.toscrape.com/catalogue/page-{page}.html"

        try:
            response = requests.get(url, headers=HEADERS, timeout=10)
            response.raise_for_status()

        except requests.RequestException as error:
            print("Request failed:", error)
            continue

        soup = BeautifulSoup(response.content, "html.parser")
        items = soup.select("article.product_pod")

        for item in items:
            title = item.select_one("h3 a")["title"]
            price_text = item.select_one(".price_color").get_text(strip=True)
            price = float(price_text.replace("£", ""))

            records.append(
                {
                    "title": title,
                    "price": price,
                    "page": page,
                }
            )

        print(f"Collected {len(records)} records")

        # Checkpoint each completed page, so an interrupted run can resume.
        DATA_DIRECTORY.mkdir(exist_ok=True)
        pd.DataFrame(records).to_csv(table_path, index=False)

        if page < PAGE_COUNT:
            time.sleep(1)

    dataframe = pd.DataFrame(records)

    if len(dataframe) < EXPECTED_RECORD_COUNT:
        raise RuntimeError(
            f"Expected at least {EXPECTED_RECORD_COUNT} records, "
            f"but collected {len(dataframe)}. CSV files were not updated."
        )

    DATA_DIRECTORY.mkdir(exist_ok=True)

    dataframe.to_csv(DATA_DIRECTORY / "books.csv", index=False)
    dataframe.to_json(DATA_DIRECTORY / "books.json", orient="records", indent=2)

    dataframe.to_csv(table_path, index=False)
    print(f"Saved and verified {len(dataframe)} records.")


if __name__ == "__main__":
    main()
