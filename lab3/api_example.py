from pathlib import Path
import time

import pandas as pd
import requests


POSTS_URL = "https://jsonplaceholder.typicode.com/posts"
DATA_DIRECTORY = Path(__file__).resolve().parent.parent / "data"


def get_json(url: str, params: dict[str, object] | None = None) -> list[dict]:
    """Request an API endpoint and return its JSON array."""
    response = requests.get(url, params=params, timeout=10)
    response.raise_for_status()
    return response.json()


def select_post_fields(posts: list[dict]) -> list[dict[str, object]]:
    return [
        {
            "id": post["id"],
            "user_id": post["userId"],
            "title": post["title"],
        }
        for post in posts
    ]


def fetch_paginated_records(
    url: str, page_count: int = 10, limit: int = 100, delay_seconds: float = 1
) -> list[dict]:
    all_records = []

    for page in range(1, page_count + 1):
        try:
            page_data = get_json(url, params={"page": page, "limit": limit})
        except requests.RequestException as error:
            print(f"Failed on page {page}: {error}")
            continue

        all_records.extend(page_data)

        if len(all_records) >= page_count * limit:
            break

        time.sleep(delay_seconds)

    return all_records


def main() -> None:
    try:
        posts = get_json(POSTS_URL)
    except requests.RequestException as error:
        print(f"Request failed: {error}")
        return

    print(f"Received {len(posts)} posts.")
    print("First post:", posts[0])

    records = select_post_fields(posts)
    DATA_DIRECTORY.mkdir(exist_ok=True)
    pd.DataFrame(records).to_csv(DATA_DIRECTORY / "posts.csv", index=False)
    print(f"Saved {len(records)} records to {DATA_DIRECTORY / 'posts.csv'}.")

    # Query-parameter example: this returns only posts for user 1.
    try:
        user_one_posts = get_json(POSTS_URL, params={"userId": 1})
        print(f"Posts returned for user 1: {len(user_one_posts)}")
    except requests.RequestException as error:
        print(f"Filtered request failed: {error}")


if __name__ == "__main__":
    main()
