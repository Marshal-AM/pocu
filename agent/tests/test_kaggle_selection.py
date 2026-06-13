"""Kaggle search query + dataset ranking tests (no live API)."""

from __future__ import annotations

from tools_impl import (
    build_kaggle_search_query,
    pick_best_dataset,
    search_kaggle_result,
)


def test_build_kaggle_search_query_fraud_credit_card():
    q = build_kaggle_search_query(
        "Fraud detection",
        "Build a fraud detection model on credit card data",
    )
    assert "credit" in q.lower()
    assert "fraud" in q.lower()
    assert "card" in q.lower()


def test_pick_best_dataset_prefers_fraud_over_ubuntu():
    candidates = [
        {
            "ref": "someone/ubuntu-server-stats",
            "title": "Ubuntu Linux Server Metrics",
            "vote_count": 50_000,
            "usability_rating": 9.0,
            "download_count": 1_000_000,
        },
        {
            "ref": "nelgiriyewithana/credit-card-fraud-detection-dataset-2023",
            "title": "Credit Card Fraud Detection Dataset 2023",
            "vote_count": 500,
            "usability_rating": 8.0,
            "download_count": 10_000,
        },
    ]
    use_case = "Fraud detection"
    message = "Build a fraud detection model on credit card data"
    best = pick_best_dataset(use_case, candidates, context=message)
    assert "fraud" in best["ref"].lower()
    assert "ubuntu" not in best["ref"].lower()


def test_search_kaggle_result_best_mode_uses_ranking(monkeypatch):
    def fake_search(query: str, max_results: int = 10):
        assert "fraud" in query.lower()
        assert "credit" in query.lower()
        return [
            {
                "ref": "someone/ubuntu-dataset",
                "title": "Ubuntu",
                "vote_count": 99_999,
                "usability_rating": 10,
                "download_count": 9_999_999,
            },
            {
                "ref": "owner/credit-card-fraud",
                "title": "Credit Card Fraud CSV",
                "vote_count": 100,
                "usability_rating": 7,
                "download_count": 500,
            },
        ]

    monkeypatch.setattr("tools_impl.search_datasets", fake_search)
    result = search_kaggle_result(
        "Fraud detection",
        user_message="Build a fraud detection model on credit card data",
    )
    assert result["mode"] == "best"
    assert "fraud" in result["dataset"]["ref"].lower()
