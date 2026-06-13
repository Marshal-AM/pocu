from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from agent_core import run_agent_chat
from job_worker_loop import start_background_worker
from supabase_client import (
    create_thread,
    ensure_job_data_bucket,
    get_job,
    get_thread,
    list_jobs,
    list_messages,
    list_threads,
    message_row_to_chat_block,
    messages_to_agent_history,
    save_message,
    update_thread,
)
from tools_impl import load_architectures

app = FastAPI(title="POCU Hedera Training Agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    use_case: str = ""
    architecture_id: str = ""
    thread_id: Optional[str] = None
    history: Optional[list[dict[str, str]]] = None
    user_account_id: str = ""
    ap2_session_id: str = ""


class CreateAp2SessionRequest(BaseModel):
    thread_id: str
    user_account_id: str
    intent: str = "POCU chat and on-chain ML training"


class ActivateAp2SessionRequest(BaseModel):
    user_account_id: str
    allowance_tx_id: str = ""


class SettleAp2Request(BaseModel):
    amount_tinybars: int
    reason: str
    batch_index: Optional[int] = None
    job_id: Optional[str] = None


class CreateThreadRequest(BaseModel):
    title: str = "New chat"
    use_case: str = ""
    architecture_id: str = ""
    user_account_id: str = ""


def _apply_sse_to_assistant(assistant: dict[str, Any], event: dict[str, Any]) -> None:
    etype = event.get("type")
    if etype == "status":
        return
    if etype == "text" and event.get("content"):
        assistant["text"] = (assistant.get("text") or "") + event["content"]
    elif etype == "dataset" and event.get("dataset"):
        assistant["dataset"] = event["dataset"]
        assistant.pop("datasets", None)
    elif etype == "datasets" and event.get("datasets"):
        assistant["datasets"] = event["datasets"]
        assistant.pop("dataset", None)
    elif etype == "job" and event.get("job"):
        assistant["job"] = event["job"]
    elif etype == "job_status" and event.get("job"):
        assistant["job"] = event["job"]
    elif etype == "job_progress":
        assistant["job_progress"] = {
            k: event.get(k)
            for k in ("job_id", "status", "progress_pct", "message")
            if event.get(k) is not None
        }


def _assistant_metadata(assistant: dict[str, Any]) -> dict[str, Any]:
    meta: dict[str, Any] = {}
    if assistant.get("text"):
        meta["text"] = assistant["text"]
    if assistant.get("dataset"):
        meta["dataset"] = assistant["dataset"]
    if assistant.get("datasets"):
        meta["datasets"] = assistant["datasets"]
    if assistant.get("job"):
        meta["job"] = assistant["job"]
    if assistant.get("job_progress"):
        meta["job_progress"] = assistant["job_progress"]
    return meta


@app.on_event("startup")
def startup() -> None:
    try:
        ensure_job_data_bucket()
    except Exception as exc:
        print(f"[agent] Warning: job-data storage bucket not ready: {exc}")
    if os.getenv("AGENT_EMBEDDED_WORKER", "").strip() in ("1", "true", "yes"):
        start_background_worker(interval_sec=15)
        print("[agent] Embedded job worker: ON (set AGENT_EMBEDDED_WORKER=0 if using npm run jobs:worker)")
    else:
        print("[agent] Ready — job processing is handled by npm run jobs:worker")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ap2/config")
def ap2_config() -> dict[str, Any]:
    import os

    agent_account_id = (os.getenv("ACCOUNT_ID") or "").strip()
    model_nft_token_id = (os.getenv("MODEL_NFT_TOKEN_ID") or "").strip()
    allowance_hbar = float(os.getenv("ALLOWANCE_HBAR", "200"))
    if not agent_account_id:
        raise HTTPException(500, "ACCOUNT_ID not configured on agent")
    return {
        "agent_account_id": agent_account_id,
        "model_nft_token_id": model_nft_token_id,
        "allowance_hbar": allowance_hbar,
    }


@app.get("/architectures")
def architectures(tier: Optional[str] = None) -> list[dict[str, Any]]:
    archs = load_architectures()
    if tier:
        archs = [a for a in archs if a.get("tier") == tier]
    return archs


@app.get("/jobs")
def jobs(user_account_id: str = "", limit: int = 50) -> list[dict[str, Any]]:
    if not user_account_id.strip():
        raise HTTPException(400, "user_account_id is required")
    try:
        return list_jobs(limit, user_account_id.strip())
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.get("/jobs/estimate-cost")
def estimate_cost(architecture_id: str, samples: int = 2, epochs: int = 1) -> dict[str, Any]:
    from cost_estimate import ALLOWANCE_CAP_HBAR, estimate_job_cost_hbar, exceeds_allowance_cap

    est = estimate_job_cost_hbar(architecture_id, samples, epochs)
    return {
        "architecture_id": architecture_id,
        "samples": samples,
        "epochs": epochs,
        "estimated_cost_hbar": est,
        "allowance_cap_hbar": ALLOWANCE_CAP_HBAR,
        "exceeds_cap": exceeds_allowance_cap(architecture_id, samples, epochs),
    }


@app.get("/jobs/{job_id}")
def job_detail(job_id: str, user_account_id: str = "") -> dict[str, Any]:
    if not user_account_id.strip():
        raise HTTPException(400, "user_account_id is required")
    job = get_job(job_id, user_account_id.strip())
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@app.post("/ap2/sessions")
async def create_ap2_session(req: CreateAp2SessionRequest) -> dict[str, Any]:
    from pocu_ap2.session import create_session

    if not req.user_account_id.strip():
        raise HTTPException(400, "user_account_id is required")
    if not req.thread_id.strip():
        raise HTTPException(400, "thread_id is required")
    try:
        return await asyncio.to_thread(
            create_session,
            thread_id=req.thread_id.strip(),
            user_account_id=req.user_account_id.strip(),
            intent=req.intent.strip() or "POCU chat and on-chain ML training",
        )
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.post("/ap2/sessions/{session_id}/activate")
async def activate_ap2_session(session_id: str, req: ActivateAp2SessionRequest) -> dict[str, Any]:
    from pocu_ap2.session import activate_session

    if not req.user_account_id.strip():
        raise HTTPException(400, "user_account_id is required")
    try:
        return await asyncio.to_thread(
            activate_session,
            session_id,
            req.user_account_id.strip(),
            req.allowance_tx_id,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.get("/ap2/sessions/{session_id}")
def get_ap2_session(session_id: str, user_account_id: str = "") -> dict[str, Any]:
    from pocu_ap2.session import get_session

    row = get_session(session_id, user_account_id.strip())
    if not row:
        raise HTTPException(404, "AP2 session not found")
    safe = {k: v for k, v in row.items() if not k.endswith("_sdjwt")}
    return safe


@app.post("/ap2/sessions/{session_id}/settle")
async def settle_ap2_session(session_id: str, req: SettleAp2Request) -> dict[str, Any]:
    from pocu_ap2.session import settle_payment

    if req.amount_tinybars <= 0:
        raise HTTPException(400, "amount_tinybars must be positive")
    try:
        return await asyncio.to_thread(
            settle_payment,
            session_id,
            req.amount_tinybars,
            req.reason,
            "",
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.post("/jobs/{job_id}/mint-model-nft")
async def mint_model_nft_endpoint(job_id: str) -> dict[str, Any]:
    from hts_mint import mint_model_nft

    job = get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job.get("status") not in ("awaiting_nft", "running", "completed", "failed"):
        raise HTTPException(400, f"Job status {job.get('status')} cannot mint NFT")
    if job.get("status") == "failed" and not job.get("supabase_model_url"):
        raise HTTPException(400, "Job failed before model manifest was uploaded")

    try:
        result = await asyncio.to_thread(mint_model_nft, job)
        return {"ok": True, "job_id": job_id, **result}
    except Exception as e:
        from supabase_client import get_supabase

        sb = get_supabase()
        sb.table("training_jobs").update(
            {
                "status": "awaiting_nft",
                "error_message": f"NFT mint failed: {e}",
            }
        ).eq("id", job_id).execute()
        print(f"[hts] mint failed job={job_id}: {e}")
        raise HTTPException(500, str(e)) from e


@app.get("/threads")
def threads(user_account_id: str = "", limit: int = 30) -> list[dict[str, Any]]:
    if not user_account_id.strip():
        raise HTTPException(400, "user_account_id is required")
    try:
        return list_threads(limit, user_account_id.strip())
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.post("/threads")
def create_thread_endpoint(req: CreateThreadRequest) -> dict[str, Any]:
    if not req.user_account_id.strip():
        raise HTTPException(400, "user_account_id is required")
    try:
        return create_thread(
            req.title,
            req.use_case,
            req.architecture_id,
            req.user_account_id.strip(),
        )
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.get("/threads/{thread_id}")
def thread_detail(thread_id: str, user_account_id: str = "") -> dict[str, Any]:
    if not user_account_id.strip():
        raise HTTPException(400, "user_account_id is required")
    try:
        thread = get_thread(thread_id, user_account_id.strip())
        if not thread:
            raise HTTPException(404, "Thread not found")
        messages = list_messages(thread_id)
        return {
            **thread,
            "messages": [message_row_to_chat_block(m) for m in messages],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e)) from e


@app.post("/chat")
async def chat(req: ChatRequest) -> StreamingResponse:
    async def stream():
        thread_id = req.thread_id
        use_case = req.use_case.strip()
        architecture_id = req.architecture_id.strip()
        history: list[dict[str, str]] = list(req.history or [])
        user_account_id = (req.user_account_id or "").strip()
        ap2_session_id = (req.ap2_session_id or "").strip()
        if not user_account_id:
            yield {"type": "text", "content": "Error: Connect your wallet before chatting."}
            return
        if not ap2_session_id:
            yield {
                "type": "text",
                "content": "Error: Complete AP2 session authorization before chatting.",
            }
            return

        try:
            from pocu_ap2.session import validate_active_session

            await asyncio.to_thread(validate_active_session, ap2_session_id, user_account_id)
            yield {"type": "status", "message": "Agent received your message…"}

            if not thread_id:
                title = use_case or req.message[:80] or "New chat"
                thread = await asyncio.to_thread(
                    create_thread,
                    title,
                    use_case,
                    architecture_id,
                    user_account_id,
                )
                thread_id = thread["id"]
                yield {
                    "type": "thread",
                    "thread_id": thread_id,
                    "title": thread.get("title"),
                }
            else:
                existing = await asyncio.to_thread(
                    get_thread, thread_id, user_account_id
                )
                if not existing:
                    yield {"type": "text", "content": "Error: Thread not found"}
                    return
                if use_case or architecture_id:
                    await asyncio.to_thread(
                        update_thread,
                        thread_id,
                        use_case=use_case or None,
                        architecture_id=architecture_id or None,
                    )

            await asyncio.to_thread(save_message, thread_id, "user", req.message)

            prior = await asyncio.to_thread(list_messages, thread_id)
            db_history = messages_to_agent_history(prior[:-1])
            if db_history:
                history = db_history

            assistant: dict[str, Any] = {"text": ""}
            had_error = False

            async for event in run_agent_chat(
                req.message,
                use_case,
                architecture_id,
                history,
                ap2_session_id,
                user_account_id,
            ):
                if event.get("type") == "selection":
                    sel_uc = event.get("use_case")
                    sel_arch = event.get("architecture_id")
                    if sel_uc or sel_arch:
                        await asyncio.to_thread(
                            update_thread,
                            thread_id,
                            title=(sel_uc or use_case or req.message[:80])[:200],
                            use_case=sel_uc,
                            architecture_id=sel_arch,
                        )
                _apply_sse_to_assistant(assistant, event)
                if event.get("type") == "text" and str(event.get("content", "")).startswith("Error:"):
                    had_error = True
                yield event

            meta = _assistant_metadata(assistant)
            await asyncio.to_thread(
                save_message,
                thread_id,
                "assistant",
                assistant.get("text") or "",
                meta if meta else None,
            )

            if not had_error and (assistant.get("text") or assistant.get("job") or assistant.get("dataset")):
                from pocu_ap2.session import settle_chat_turn

                settlement = await asyncio.to_thread(
                    settle_chat_turn, ap2_session_id, user_account_id
                )
                yield {
                    "type": "ap2_settlement",
                    "amount_hbar": settlement.get("amount_hbar"),
                    "hedera_tx_id": settlement.get("hedera_tx_id"),
                }
        except Exception as e:
            err = str(e)
            if any(
                token in err.lower()
                for token in ("rate_limit", "too large", "tokens per minute", "413")
            ):
                yield {
                    "type": "text",
                    "content": (
                        "This chat thread is too long for the AI model limit. "
                        "Start a **new chat** and try again with a shorter message."
                    ),
                }
            else:
                yield {"type": "text", "content": f"Error: {e}"}

    async def sse():
        async for event in stream():
            yield f"data: {json.dumps(event)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("AGENT_PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
