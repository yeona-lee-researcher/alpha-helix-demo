"""Lean 백테스트 비동기 잡 스토어 (in-memory, thread-safe).

/lean/backtest/start 가 백그라운드 스레드로 백테스트를 돌리며 진행 로그를 누적하고,
/lean/backtest/status/{job_id} 가 since 커서로 증분 폴링한다. (SSE 없이 견고한 진행 스트리밍)
"""

import threading
import uuid
from typing import Any, Dict, List, Optional

_MAX_LOGS = 2000      # 잡당 로그 상한 (lean stdout 폭주 방어)
_MAX_JOBS = 64        # 메모리 상한 — 초과 시 완료된 잡부터 정리


class LeanJob:
    def __init__(self, job_id: str):
        self.job_id = job_id
        self.status = "running"          # running | done | error
        self.phase = "queued"            # 사람이 읽는 현재 단계
        self.logs: List[Dict[str, str]] = []   # [{type, msg}]
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None
        self._lock = threading.Lock()

    def log(self, level: str, msg: str) -> None:
        with self._lock:
            if len(self.logs) < _MAX_LOGS:
                self.logs.append({"type": level, "msg": str(msg)})

    def set_phase(self, msg: str) -> None:
        with self._lock:
            self.phase = str(msg)
        self.log("phase", msg)

    def finish_ok(self, result: Dict[str, Any]) -> None:
        with self._lock:
            self.result = result
            self.status = "done"

    def finish_err(self, error: str) -> None:
        with self._lock:
            self.error = str(error)
            self.status = "error"

    def snapshot(self, since: int = 0) -> Dict[str, Any]:
        with self._lock:
            since = max(0, min(since, len(self.logs)))
            return {
                "job_id": self.job_id,
                "status": self.status,
                "phase": self.phase,
                "logs": self.logs[since:],
                "next": len(self.logs),
                "result": self.result,
                "error": self.error,
            }


_JOBS: Dict[str, LeanJob] = {}
_JOBS_LOCK = threading.Lock()


def create_job() -> LeanJob:
    job = LeanJob(uuid.uuid4().hex[:12])
    with _JOBS_LOCK:
        if len(_JOBS) >= _MAX_JOBS:
            # 완료/에러 잡부터 오래된 순으로 정리
            stale = [k for k, v in _JOBS.items() if v.status != "running"]
            for k in stale[: max(1, len(_JOBS) - _MAX_JOBS + 1)]:
                _JOBS.pop(k, None)
        _JOBS[job.job_id] = job
    return job


def get_job(job_id: str) -> Optional[LeanJob]:
    with _JOBS_LOCK:
        return _JOBS.get(job_id)
