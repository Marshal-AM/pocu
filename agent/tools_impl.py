from __future__ import annotations

import json
import os
import re
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from kaggle_client import download_dataset, inspect_dataset, search_datasets
from supabase_client import create_job, get_job, get_supabase, upload_job_prepared_files

REPO_ROOT = Path(__file__).resolve().parent.parent
ARCH_PATH = Path(__file__).resolve().parent / "architectures.json"


def load_architectures() -> list[dict[str, Any]]:
    return json.loads(ARCH_PATH.read_text(encoding="utf-8"))


def list_architectures(tier: Optional[str] = None) -> list[dict[str, Any]]:
    archs = load_architectures()
    if tier:
        archs = [a for a in archs if a.get("tier") == tier]
    return archs


def get_architecture(arch_id: str) -> dict[str, Any]:
    for a in load_architectures():
        if a["id"] == arch_id:
            return a
    raise ValueError(f"Unknown architecture: {arch_id}")


_KEYWORD_STOPWORDS = frozenset(
    {
        "the",
        "and",
        "for",
        "with",
        "model",
        "data",
        "dataset",
        "tabular",
        "general",
        "machine",
        "learning",
        "build",
        "train",
        "create",
        "make",
        "using",
        "some",
        "want",
        "your",
        "this",
        "that",
        "from",
    }
)

# Optimized Kaggle search phrases (raw use-case labels are too vague for the API).
USE_CASE_KAGGLE_QUERIES: dict[str, str] = {
    "fraud detection": "credit card fraud detection",
    "heart disease screening": "heart disease classification csv",
    "customer churn": "customer churn telco csv",
    "credit default risk": "credit card default payment",
    "diabetes prediction": "diabetes classification csv",
    "spam detection": "sms spam ham csv",
    "demand forecasting": "demand forecasting csv",
    "predictive maintenance": "predictive maintenance sensor csv",
}

# Off-topic signals when ranking candidates for a given use-case family.
_IRRELEVANT_HINTS: dict[str, tuple[str, ...]] = {
    "fraud": ("ubuntu", "linux", "kernel", "windows", "android", "ios", "dog", "cat", "mnist", "cifar"),
    "churn": ("ubuntu", "linux", "mnist", "dog", "cat", "fraud"),
    "heart": ("ubuntu", "linux", "fraud", "churn", "spam"),
    "spam": ("ubuntu", "linux", "fraud", "heart"),
    "diabetes": ("ubuntu", "linux", "fraud"),
    "demand": ("ubuntu", "linux", "fraud", "heart"),
    "maintenance": ("ubuntu", "linux", "fraud", "spam"),
    "credit": ("ubuntu", "linux", "kernel", "dog", "cat"),
}


def _use_case_family(use_case: str) -> str:
    uc = use_case.lower()
    if "fraud" in uc or "transaction" in uc:
        return "fraud"
    if "churn" in uc:
        return "churn"
    if "heart" in uc:
        return "heart"
    if "spam" in uc:
        return "spam"
    if "diabetes" in uc:
        return "diabetes"
    if "demand" in uc or "forecast" in uc:
        return "demand"
    if "maintenance" in uc:
        return "maintenance"
    if "credit" in uc or "default" in uc:
        return "credit"
    return ""


def _extract_keywords(*texts: str) -> set[str]:
    words: set[str] = set()
    for text in texts:
        for w in re.findall(r"[a-z0-9]+", text.lower()):
            if len(w) > 2 and w not in _KEYWORD_STOPWORDS:
                words.add(w)
    return words


def build_kaggle_search_query(use_case: str, user_message: str = "") -> str:
    """Build a Kaggle search string from use-case label + user message."""
    uc = use_case.strip()
    uc_lower = uc.lower()
    for label, query in USE_CASE_KAGGLE_QUERIES.items():
        if label in uc_lower or uc_lower in label:
            base = query
            break
    else:
        base = uc

    msg_keywords = _extract_keywords(user_message)
    # Prefer domain terms from the user message that are not already in base.
    base_words = set(re.findall(r"[a-z0-9]+", base.lower()))
    extras = [w for w in sorted(msg_keywords) if w not in base_words][:4]
    if extras:
        return f"{base} {' '.join(extras)}".strip()
    return base


def _dataset_text(ds: dict[str, Any]) -> str:
    return f"{ds.get('title') or ''} {ds.get('ref') or ''}".lower()


def _irrelevance_penalty(use_case: str, ds: dict[str, Any]) -> float:
    family = _use_case_family(use_case)
    hints = _IRRELEVANT_HINTS.get(family, ())
    text = _dataset_text(ds)
    if any(hint in text for hint in hints):
        return 1_000_000.0
    return 0.0


def _relevance_overlap(use_case: str, ds: dict[str, Any], context: str = "") -> int:
    keywords = _extract_keywords(use_case, context)
    title_words = set(re.findall(r"[a-z0-9]+", _dataset_text(ds)))
    return len(keywords & title_words)


def search_kaggle_for_use_case(
    use_case: str,
    query: Optional[str] = None,
    *,
    user_message: str = "",
) -> list[dict[str, Any]]:
    primary_q = query or build_kaggle_search_query(use_case, user_message)
    datasets = search_datasets(primary_q, max_results=10)

    if datasets:
        best = pick_best_dataset(use_case, datasets, context=user_message)
        if _relevance_overlap(use_case, best, user_message) > 0:
            return datasets

    # Second pass with message-heavy query when the label-only search was weak.
    if user_message.strip():
        msg_q = build_kaggle_search_query(user_message[:120], user_message)
        if msg_q.lower() != primary_q.lower():
            alt = search_datasets(msg_q, max_results=10)
            if alt:
                return alt

    return datasets


def pick_best_dataset(
    use_case: str,
    datasets: list[dict[str, Any]],
    *,
    context: str = "",
) -> dict[str, Any]:
    if not datasets:
        raise ValueError("No datasets to rank")
    if len(datasets) == 1:
        return datasets[0]

    keywords = _extract_keywords(use_case, context)

    def score(ds: dict[str, Any]) -> float:
        title_words = set(re.findall(r"[a-z0-9]+", _dataset_text(ds)))
        overlap = len(keywords & title_words)
        votes = float(ds.get("vote_count") or 0)
        usability = float(ds.get("usability_rating") or 0)
        downloads = float(ds.get("download_count") or 0)
        popularity = usability * 1_000 + votes + downloads * 0.01
        if overlap == 0:
            # Never let vote count beat semantic match — weak overlap sorts last.
            return popularity - _irrelevance_penalty(use_case, ds) - 500_000
        return overlap * 100_000 + popularity - _irrelevance_penalty(use_case, ds)

    return max(datasets, key=score)


def search_kaggle_result(
    use_case: str,
    query: Optional[str] = None,
    *,
    show_all: bool = False,
    user_message: str = "",
) -> dict[str, Any]:
    datasets = search_kaggle_for_use_case(use_case, query, user_message=user_message)
    if show_all or not datasets:
        return {"mode": "list", "datasets": datasets}
    return {
        "mode": "best",
        "dataset": pick_best_dataset(use_case, datasets, context=user_message),
    }


def inspect_kaggle_dataset(dataset_ref: str) -> dict[str, Any]:
    files = inspect_dataset(dataset_ref)
    total_mb = sum(f["size_mb"] for f in files)
    return {"files": files, "total_mb": total_mb, "ok": total_mb <= 500}


def _hardhat_bin() -> str:
    is_win = os.name == "nt"
    name = "hardhat.cmd" if is_win else "hardhat"
    path = REPO_ROOT / "node_modules" / ".bin" / name
    if path.is_file():
        return str(path)
    return "npx.cmd" if is_win else "npx"


def _parse_preprocess_json(stdout: str, stderr: str) -> dict[str, Any]:
    """Hardhat may log to stdout/stderr; find the JSON result line."""
    for stream in (stdout, stderr):
        if not stream:
            continue
        for line in reversed(stream.strip().splitlines()):
            stripped = line.strip()
            if not stripped.startswith("{"):
                continue
            try:
                data = json.loads(stripped)
            except json.JSONDecodeError:
                continue
            if isinstance(data, dict) and data.get("ok") is False:
                raise RuntimeError(data.get("error") or "Preprocess failed")
            return data
    out_tail = (stdout or "").strip()[-1000:]
    err_tail = (stderr or "").strip()[-1000:]
    raise RuntimeError(
        "Preprocess produced no JSON output "
        f"(stdout empty={not (stdout or '').strip()}, stderr empty={not (stderr or '').strip()}). "
        f"stdout tail: {out_tail!r} stderr tail: {err_tail!r}"
    )


def download_and_prepare(
    dataset_ref: str,
    architecture_id: str,
    use_case: str,
    target_column: Optional[str] = None,
    job_id: Optional[str] = None,
) -> dict[str, Any]:
    arch = get_architecture(architecture_id)
    jid = job_id if job_id and len(job_id) == 36 else str(uuid.uuid4())
    dl_dir = REPO_ROOT / "data" / "kaggle" / jid.replace("-", "")
    csv_path = download_dataset(dataset_ref, str(dl_dir))

    env = os.environ.copy()
    env["DATA_CSV_PATH"] = csv_path
    env["ARCHITECTURE_ID"] = architecture_id
    env["JOB_ID"] = jid
    env["MAX_TRAIN_SAMPLES"] = "2"
    if target_column:
        env["TARGET_COLUMN"] = target_column

    is_win = os.name == "nt"
    hardhat = _hardhat_bin()
    cmd = (
        [hardhat, "run", "scripts/preprocess-tabular.ts"]
        if hardhat.endswith(("hardhat", "hardhat.cmd"))
        else [hardhat, "hardhat", "run", "scripts/preprocess-tabular.ts"]
    )
    proc = subprocess.run(
        cmd,
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
        shell=is_win and hardhat.startswith("npx"),
    )
    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "preprocess failed").strip()
        raise RuntimeError(f"Preprocess failed: {detail[-2000:]}")

    result = _parse_preprocess_json(proc.stdout or "", proc.stderr or "")
    return {
        "job_id": jid,
        "dataset_ref": dataset_ref,
        "use_case": use_case,
        "architecture_id": architecture_id,
        "csv_path": csv_path,
        "metadata_path": result["metadataPath"],
        "input_dim": result["inputDim"],
        "num_classes": result["numClasses"],
        "task_type": result["taskType"],
        "target_column": result["targetColumn"],
        "feature_columns": result["featureColumns"],
        "data_hash": result["dataHash"],
    }


def trigger_training_job(
    use_case: str,
    architecture_id: str,
    dataset_ref: str,
    target_column: str,
    prepared: dict[str, Any],
    user_prompt: str = "",
    ap2_session_id: str = "",
    user_account_id: str = "",
) -> dict[str, Any]:
    arch = get_architecture(architecture_id)
    job_uuid = prepared.get("job_id") or str(uuid.uuid4())
    manifest_path = f"output/{job_uuid}_manifest.json"

    row: dict[str, Any] = {
        "id": job_uuid,
        "status": "pending",
        "user_prompt": user_prompt,
        "use_case": use_case,
        "model_id": architecture_id,
        "architecture_id": architecture_id,
        "architecture_name": arch["name"],
        "architecture_tier": arch["tier"],
        "train_samples": 2,
        "train_epochs": 1,
        "kaggle_dataset_ref": dataset_ref,
        "kaggle_url": f"https://www.kaggle.com/datasets/{dataset_ref}",
        "target_column": target_column,
        "input_dim": prepared["input_dim"],
        "num_classes": prepared["num_classes"],
        "data_csv_path": prepared.get("csv_path"),
        "prepared_meta_path": prepared["metadata_path"],
        "manifest_path": manifest_path,
    }
    if ap2_session_id:
        row["ap2_session_id"] = ap2_session_id
    if user_account_id:
        row["user_account_id"] = user_account_id
        row["allowance_hbar"] = float(os.getenv("ALLOWANCE_HBAR", "200"))
    created = create_job(row)
    try:
        upload_job_prepared_files(job_uuid, prepared["metadata_path"])
    except Exception as exc:
        err = f"Could not upload prepared data to Supabase storage: {exc}"
        print(f"[agent] ERROR: {err}")
        try:
            get_supabase().table("training_jobs").update(
                {
                    "status": "failed",
                    "error_message": err,
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                }
            ).eq("id", job_uuid).execute()
        except Exception:
            pass
        raise RuntimeError(err) from exc
    return {
        "job_id": created["id"],
        "status": "pending",
        "message": "Training job queued (2 samples, 1 epoch). View /jobs/{id}",
        "manifest_path": manifest_path,
    }


def get_training_job_status(job_id: str) -> dict[str, Any]:
    job = get_job(job_id)
    if not job:
        return {"error": "Job not found"}
    logs = str(job.get("logs") or "")
    if logs:
        job = dict(job)
        job["logs"] = logs[-400:] if len(logs) > 400 else logs
    return job
