"""Lab 4 cleaning, TF-IDF, and sentiment workflow"""

from pathlib import Path
import re

import nltk
import pandas as pd
from nltk.corpus import stopwords
from nltk.stem import WordNetLemmatizer
from nltk.tokenize import word_tokenize
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
from transformers import pipeline

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_CSV = PROJECT_ROOT / "data" / "realdonaldtrump.csv"
CLEAN_CSV = PROJECT_ROOT / "data" / "lab4_clean_tweets.csv"
SENTIMENT_COUNTS_CSV = PROJECT_ROOT / "data" / "sentiment_counts.csv"
SENTIMENT_WEEKDAY_CSV = PROJECT_ROOT / "data" / "sentiment_by_weekday.csv"
SENTIMENT_MONTH_CSV = PROJECT_ROOT / "data" / "sentiment_by_month.csv"
SENTIMENT_MODEL = "cardiffnlp/twitter-roberta-base-sentiment-latest"
BATCH_SIZE = 32


def normalize_tweet(text):
    """Normalize text for TF-IDF without using it for sentiment inference."""
    text = text.lower()
    text = re.sub(r"https?://\S+|www\.\S+", " URL ", text)
    text = re.sub(r"@\w+", " USER ", text)
    text = re.sub(r"\b\d+(?:\.\d+)?\b", " NUMBER ", text)
    return re.sub(r"\s+", " ", text).strip()


def remove_stopwords(tokens, stop_words):
    return [token for token in tokens if token not in stop_words]


def lemmatize_tokens(tokens, lemmatizer):
    return [lemmatizer.lemmatize(token) for token in tokens if token.isalpha()]


def prepare_for_roberta(text):
    """Use light normalization so RoBERTa keeps punctuation and tone signals."""
    text = re.sub(r"@\w+", "@user", text)
    text = re.sub(r"https?://\S+|www\.\S+", "http", text)
    return text.strip()


def scores_to_dict(scores):
    return {item["label"].lower(): item["score"] for item in scores}


def run_sentiment(texts):
    """Apply the social-media RoBERTa model in batches and report progress."""
    sentiment_model = pipeline("sentiment-analysis", model=SENTIMENT_MODEL, top_k=None)
    results = []
    total = len(texts)
    for start in range(0, total, BATCH_SIZE):
        batch = texts[start:start + BATCH_SIZE]
        results.extend(sentiment_model(batch, truncation=True, batch_size=BATCH_SIZE))
        if (start + BATCH_SIZE) % 1024 == 0 or start + BATCH_SIZE >= total:
            print(f"Sentiment: {min(start + BATCH_SIZE, total):,}/{total:,} tweets")
    return results


def main():
    # Tasks 1–6: inspect and clean the available structured attributes.
    df = pd.read_csv(RAW_CSV)
    print("Raw shape:", df.shape)
    print("Missing values:\n", df.isna().sum())
    print("Exact duplicate rows:", df.duplicated().sum())

    df = df.dropna(subset=["content"]).drop_duplicates()
    df = df.drop_duplicates(subset=["id"], keep="first").rename(columns={
        "id": "tweet_id", "content": "tweet_text_raw", "date": "created_at",
    })
    df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce", format="mixed")
    df = df.dropna(subset=["created_at"])
    df["favorites"] = pd.to_numeric(df["favorites"], errors="coerce").clip(lower=0)
    df["retweets"] = pd.to_numeric(df["retweets"], errors="coerce").clip(lower=0)
    df["favorites"] = df["favorites"].fillna(df["favorites"].median())
    df["retweets"] = df["retweets"].fillna(0)
    df["mentions"] = df["mentions"].fillna("").astype("string").str.strip()
    df["hashtags"] = df["hashtags"].fillna("").astype("string").str.strip()
    df["tweet_text_raw"] = df["tweet_text_raw"].astype("string").str.replace(r"\s+", " ", regex=True).str.strip()
    df["date"] = df["created_at"].dt.date
    df["hour"] = df["created_at"].dt.hour
    df["weekday"] = df["created_at"].dt.day_name()
    df["month"] = df["created_at"].dt.to_period("M").astype(str)
    df["mention_count"] = df["mentions"].str.count("@")
    df["hashtag_count"] = df["hashtags"].str.count("#")

    # Tasks 7–10: create cleaned text, a document-term matrix, and TF-IDF.
    stop_words = set(stopwords.words("english"))
    lemmatizer = WordNetLemmatizer()
    df["text_normalized"] = df["tweet_text_raw"].apply(normalize_tweet)
    df["tokens"] = df["text_normalized"].apply(word_tokenize)
    df["tokens_no_stop"] = df["tokens"].apply(remove_stopwords, args=(stop_words,))
    df["tokens_clean"] = df["tokens_no_stop"].apply(lemmatize_tokens, args=(lemmatizer,))
    df["text_clean"] = df["tokens_clean"].apply(" ".join)
    vectorizer = CountVectorizer(min_df=2, max_df=0.90, lowercase=True)
    dtm = vectorizer.fit_transform(df["text_clean"])
    tfidf_vectorizer = TfidfVectorizer(min_df=2, max_df=0.90)
    tfidf = tfidf_vectorizer.fit_transform(df["text_clean"])
    print("DTM shape:", dtm.shape)
    print("TF-IDF shape:", tfidf.shape)

    df["sentiment_text"] = df["tweet_text_raw"].apply(prepare_for_roberta)
    results = run_sentiment(df["sentiment_text"].tolist())
    score_dicts = [scores_to_dict(scores) for scores in results]
    for label in ("negative", "neutral", "positive"):
        df[f"sentiment_{label}"] = [scores.get(label, 0) for scores in score_dicts]
    df["sentiment"] = [max(scores, key=scores.get).capitalize() for scores in score_dicts]
    df["sentiment_score"] = df["sentiment_positive"] - df["sentiment_negative"]
    df["sentiment_bin"] = pd.cut(
        df["sentiment_score"],
        bins=[float("-inf"), -0.2, 0.2, float("inf")],
        labels=["Negative", "Neutral", "Positive"],
        right=False,
    )

    vis_columns = [
        "tweet_id", "created_at", "date", "month", "hour", "weekday", "link",
        "tweet_text_raw", "text_clean", "favorites", "retweets", "mentions", "hashtags",
        "mention_count", "hashtag_count", "sentiment_negative", "sentiment_neutral",
        "sentiment_positive", "sentiment_score", "sentiment", "sentiment_bin",
    ]
    vis_df = df[vis_columns].copy()
    vis_df.to_csv(CLEAN_CSV, index=False)
    sentiment_counts = vis_df["sentiment"].value_counts().rename_axis("sentiment").reset_index(name="count")
    sentiment_weekday = vis_df.groupby("weekday")["sentiment_score"].mean().reset_index()
    sentiment_month = (
        vis_df.groupby("month")
        .agg(tweet_count=("tweet_id", "size"), mean_sentiment_score=("sentiment_score", "mean"),
             mean_favorites=("favorites", "mean"), mean_retweets=("retweets", "mean"))
        .reset_index()
    )
    sentiment_counts.to_csv(SENTIMENT_COUNTS_CSV, index=False)
    sentiment_weekday.to_csv(SENTIMENT_WEEKDAY_CSV, index=False)
    sentiment_month.to_csv(SENTIMENT_MONTH_CSV, index=False)
    print(f"Saved {len(vis_df):,} clean tweets to {CLEAN_CSV}")


if __name__ == "__main__":
    main()
