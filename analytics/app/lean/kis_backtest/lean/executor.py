"""Lean 실행기

공식 QuantConnect `lean` CLI 로 백테스트를 실행한다.
(CLI 가 내부적으로 quantconnect/lean Docker 이미지를 구동하므로 Docker 는 여전히 필요.)
"""

import json
import logging
import os
import shutil
import subprocess
import sys
import threading
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from .project_manager import LeanProject

logger = logging.getLogger(__name__)

# Lean Docker 이미지 (lean CLI 가 구동; pull/존재확인 보조용으로만 사용)
LEAN_IMAGE = "quantconnect/lean:latest"


def _resolve_lean_bin() -> str:
    """`lean` CLI 실행 파일 경로 해석.

    우선순위: LEAN_BIN 환경변수 → PATH(shutil.which) → 현재 파이썬 venv 의 Scripts/bin.
    """
    env = os.environ.get("LEAN_BIN")
    if env and Path(env).exists():
        return env

    found = shutil.which("lean")
    if found:
        return found

    exe_dir = Path(sys.executable).parent  # venv/Scripts (Windows) | venv/bin (POSIX)
    for name in ("lean.exe", "lean"):
        cand = exe_dir / name
        if cand.exists():
            return str(cand)

    return "lean"  # 최후: PATH 에 없으면 FileNotFoundError 로 이어짐


@dataclass
class LeanRun:
    """Lean 백테스트 실행 결과"""
    project: LeanProject
    success: bool
    output_dir: Path
    raw_result: Optional[Dict] = None
    error: Optional[str] = None
    duration_seconds: float = 0
    started_at: datetime = field(default_factory=datetime.now)
    finished_at: Optional[datetime] = None
    
    @property
    def result_json(self) -> Optional[Path]:
        """결과 JSON 파일 경로"""
        if not self.output_dir.exists():
            return None
        
        # Algorithm.json이 메인 결과 파일
        main_result = self.output_dir / "Algorithm.json"
        if main_result.exists():
            return main_result
        
        # 폴백: order, log, summary, monitor 제외한 첫 번째 json
        for f in self.output_dir.glob("*.json"):
            name_lower = f.name.lower()
            if not any(x in name_lower for x in ["order", "log", "summary", "monitor"]):
                return f
        
        return None
    
    @property
    def orders_json(self) -> Optional[Path]:
        """주문 내역 JSON 파일 경로"""
        if not self.output_dir.exists():
            return None
        
        for f in self.output_dir.glob("*order*.json"):
            return f
        
        return None
    
    @property
    def log_txt(self) -> Optional[Path]:
        """로그 파일 경로"""
        if not self.output_dir.exists():
            return None
        
        for f in self.output_dir.glob("*.log"):
            return f
        for f in self.output_dir.glob("*log*.txt"):
            return f
        
        return None
    
    def load_result(self) -> Dict:
        """결과 JSON 로드"""
        if self.raw_result:
            return self.raw_result
        
        result_file = self.result_json
        if result_file and result_file.exists():
            self.raw_result = json.loads(result_file.read_text(encoding="utf-8"))
            return self.raw_result
        
        return {}
    
    def get_statistics(self) -> Dict[str, Any]:
        """통계 추출"""
        result = self.load_result()
        return result.get("statistics", {})
    
    def get_trades(self) -> List[Dict]:
        """거래 내역 추출"""
        result = self.load_result()
        orders = result.get("orders", {})
        return list(orders.values()) if isinstance(orders, dict) else []
    
    def get_equity_curve(self) -> Dict[str, float]:
        """자산 곡선 추출"""
        result = self.load_result()
        charts = result.get("charts", {})
        
        strategy_equity = charts.get("Strategy Equity", {})
        series = strategy_equity.get("series", {})
        equity_series = series.get("Equity", {})
        values = equity_series.get("values", [])
        
        # Lean format: [timestamp, open, high, low, close]
        return {
            str(point[0]): point[4] if len(point) > 4 else point[1]
            for point in values if isinstance(point, list) and len(point) >= 2
        }


class LeanExecutor:
    """공식 `lean` CLI 로 백테스트 실행"""

    @classmethod
    def run(
        cls,
        project: LeanProject,
        stream_logs: bool = False,
        timeout: int = 600,
        on_line: Optional[Callable[[str], None]] = None,
    ) -> LeanRun:
        """`lean backtest` CLI 로 백테스트 실행

        흐름:
            cwd = 워크스페이스(lean.json 위치) 에서
            `lean backtest projects/<run_id> --output <project>/result` 실행.
            결과 JSON(<backtestId>.json)은 --output 폴더에 직접 기록된다.

        Args:
            project: Lean 프로젝트
            stream_logs: (미사용 — 호환 유지)
            timeout: 타임아웃 (초)
            on_line: lean stdout 라인별 콜백 (실시간 진행 스트리밍용). None 이면 캡처만.

        Returns:
            LeanRun 결과 객체

        Raises:
            RuntimeError: 실행 실패 시
        """
        started_at = datetime.now()

        # 경로: project_dir = <ws>/projects/<run_id>  → workspace = <ws>
        project_path = project.project_dir.resolve()
        workspace = project_path.parent.parent.resolve()
        data_path = (workspace / "data").resolve()
        results_path = (project_path / "result").resolve()
        results_path.mkdir(parents=True, exist_ok=True)

        logger.info(f"[Lean] workspace: {workspace}")
        logger.info(f"[Lean] project: {project_path}")
        logger.info(f"[Lean] results: {results_path}")

        # 데이터 db precondition (init_workspace 가 보장하지만 방어적으로 확인)
        symbol_props = data_path / "symbol-properties" / "symbol-properties-database.csv"
        if not symbol_props.exists():
            raise RuntimeError(
                f"symbol-properties-database.csv가 없습니다. "
                f"LeanProjectManager.init_workspace() 로 데이터 스캐폴드 필요: {symbol_props}"
            )

        lean_bin = _resolve_lean_bin()
        # 프로젝트 경로는 워크스페이스 기준 상대 (lean 이 cwd 상위에서 lean.json 탐색)
        try:
            project_arg = str(project_path.relative_to(workspace))
        except ValueError:
            project_arg = str(project_path)

        cmd = [lean_bin, "backtest", project_arg, "--output", str(results_path)]
        logger.info(f"[Lean] CLI 실행: {' '.join(cmd)} (cwd={workspace})")

        # Popen + 리더 스레드: lean stdout 을 라인 단위로 캡처하며 on_line 콜백으로 실시간 스트리밍.
        # (기존 subprocess.run 블로킹을 대체 — returncode/타임아웃/에러 메시지 동작은 그대로 보존.)
        try:
            proc = subprocess.Popen(
                cmd,
                cwd=str(workspace),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",   # Windows 기본 cp949 회피 — lean stdout 의 비-cp949 바이트로
                errors="replace",   # 리더 스레드가 죽으면 파이프 미배수 → lean write 블록 → 행
                bufsize=1,
            )
        except FileNotFoundError:
            error_msg = (
                f"lean CLI 실행 파일을 찾을 수 없습니다 (LEAN_BIN 환경변수로 지정 가능): {lean_bin}"
            )
            logger.error(f"[Lean] {error_msg}")
            raise RuntimeError(error_msg)

        captured: List[str] = []

        def _pump() -> None:
            try:
                for raw in proc.stdout:  # type: ignore[union-attr]
                    line = raw.rstrip("\n")
                    captured.append(line)
                    if on_line:
                        try:
                            on_line(line)
                        except Exception:  # 콜백 오류가 백테스트를 죽이지 않도록 격리
                            pass
            except Exception:
                pass

        reader = threading.Thread(target=_pump, daemon=True)
        reader.start()
        try:
            proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            proc.kill()
            reader.join(timeout=5)
            error_msg = f"Lean 백테스트 타임아웃 ({timeout}초)"
            logger.error(f"[Lean] {error_msg}")
            raise RuntimeError(error_msg)
        reader.join(timeout=10)

        finished_at = datetime.now()
        duration = (finished_at - started_at).total_seconds()
        stdout = "\n".join(captured)

        if proc.returncode != 0:
            error_msg = f"Lean 백테스트 실패 (exit code: {proc.returncode})\n{stdout[-2000:]}"
            logger.error(f"[Lean] {error_msg}")
            raise RuntimeError(error_msg)

        # --output 은 타임스탬프 하위폴더 없이 직접 기록하지만, 방어적으로 결과 폴더 탐지
        output_dir = cls._locate_results(results_path)

        run = LeanRun(
            project=project,
            success=True,
            output_dir=output_dir,
            duration_seconds=duration,
            started_at=started_at,
            finished_at=finished_at,
        )
        run.load_result()

        logger.info(f"[Lean] 완료: {duration:.1f}초 (output={output_dir})")
        return run

    @staticmethod
    def _locate_results(results_path: Path) -> Path:
        """결과 JSON 이 있는 실제 폴더 반환.

        `--output` 은 보통 폴더에 직접 기록하지만, 버전에 따라 timestamp 하위폴더가
        생길 수 있으므로 둘 다 처리한다.
        """
        if any(results_path.glob("*.json")):
            return results_path
        subdirs = [d for d in results_path.iterdir() if d.is_dir()] if results_path.exists() else []
        for d in sorted(subdirs, key=lambda p: p.stat().st_mtime, reverse=True):
            if any(d.glob("*.json")):
                return d
        return results_path

    @classmethod
    def check_lean_cli(cls) -> bool:
        """lean CLI 설치 확인"""
        try:
            result = subprocess.run(
                [_resolve_lean_bin(), "--version"],
                capture_output=True,
                text=True,
                timeout=15,
            )
            return result.returncode == 0
        except Exception:
            return False

    @classmethod
    def pull_image(cls) -> bool:
        """Lean Docker 이미지 다운로드"""
        try:
            logger.info(f"[Lean] Docker 이미지 다운로드 중: {LEAN_IMAGE}")
            result = subprocess.run(
                ["docker", "pull", LEAN_IMAGE],
                capture_output=True,
                text=True,
                timeout=600,
            )
            return result.returncode == 0
        except Exception as e:
            logger.error(f"[Lean] 이미지 다운로드 실패: {e}")
            return False
    
    @classmethod
    def check_docker(cls) -> bool:
        """Docker 실행 확인"""
        try:
            result = subprocess.run(
                ["docker", "info"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            return result.returncode == 0
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        
        return False
    
    @classmethod
    def check_image(cls) -> bool:
        """Lean 이미지 존재 확인"""
        try:
            result = subprocess.run(
                ["docker", "images", "-q", LEAN_IMAGE],
                capture_output=True,
                text=True,
                timeout=10,
            )
            return bool(result.stdout.strip())
        except Exception:
            return False
