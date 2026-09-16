r"""共享项目库：开机静默启动 PostgreSQL + memoryd —— 无控制台版本。

为什么是 Python 而不是 PowerShell（这是整个文件存在的理由，别改回去）
------------------------------------------------------------------
计划任务的动作进程一律是控制台程序时，Windows 会给它分配一个控制台。
一旦分配了控制台，在这台机器上（默认终端 = Windows Terminal）就会出现一个
标题为 "Terminal" 的 Windows Terminal 窗口。

`-WindowStyle Hidden` 和计划任务的 `Hidden=True` 都只能"先建窗口再藏起来"，
窗口终究存在过一瞬 —— 用户看到的就是那一下黑框。

实测对照（2026-09-15）：
  阶段 1 只触发计划任务（动作 = powershell.exe）→ 盯窗抓到 1 个 Terminal 窗口
  阶段 2 什么都不做                              → 0 个窗口
证据：PE 头子系统标签 —— powershell.exe = 3（Console），pythonw.exe = 2（Windows GUI）。
GUI 子系统的进程**不会**申请控制台，所以不可能有窗口。这就是选 pythonw 的原因。

所以：
  计划任务动作 = <venv>\Scripts\pythonw.exe  D:\codex-memory\repo\scripts\autostart.pyw
  三个子进程一律 CREATE_NO_WINDOW。

start-memoryd-silent.ps1 保留为**手工排障**入口（带 -DryRun / -Cold），
不再挂到开机链路上 —— 它是控制台程序，挂在开机链路上就会闪黑框。

本文件与那个 PowerShell 脚本共用同一套判断：
  - 端口监听 != 服务可用：postmaster 可能占着端口而所有 backend 以 0xC0000142
    死掉。所以一律走真探测：psycopg 发一条 SELECT 1、httpx 打一次 /status。
  - 失败必须留痕：每轮都往 logs\\startup.log 追加，并带上端口占用者与日志尾部。
"""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(r"D:\codex-memory")
REPO = ROOT / "repo"
LOGS = ROOT / "logs"
PG_BIN = Path(
    r"D:\codex\.runtimes\kstage-postgres\node_modules"
    r"\@embedded-postgres\windows-x64\native\bin"
)
PG_DATA = ROOT / "pgdata"
PG_EXE = PG_BIN / "postgres.exe"
PG_CTL = PG_BIN / "pg_ctl.exe"   # 只有它会读 postmaster.pid 并发关闭请求
PG_LOG = LOGS / "postgres.log"
PYW = ROOT / "runtime" / "venv" / "Scripts" / "pythonw.exe"
STARTUP_LOG = LOGS / "startup.log"
DAEMON_ERR = LOGS / "memoryd-silent.err.log"

PG_PORT = 55440
DSH_PORT = 47831

PG_WAIT_SECONDS = 120      # 开机时磁盘 / DLL 初始化慢，45 秒不够
DAEMON_WAIT_SECONDS = 180  # 首次要加载 Qwen3-Embedding（约 1.2GB）

# 子进程一律不建窗口。CREATE_NO_WINDOW 是这里最关键的一个标志。
CREATE_NO_WINDOW = 0x08000000
DETACHED_PROCESS = 0x00000008


def log(message: str) -> None:
    line = f"{datetime.now():%Y-%m-%d %H:%M:%S}  [autostart] {message}"
    try:
        LOGS.mkdir(parents=True, exist_ok=True)
        with open(STARTUP_LOG, "a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except Exception:
        pass


def tail(path: Path, lines: int = 12) -> str | None:
    try:
        if not path.exists():
            return None
        text = path.read_text(encoding="utf-8", errors="replace").splitlines()[-lines:]
        joined = " | ".join(part.strip() for part in text if part.strip())
        return joined or None
    except Exception:
        return None


def port_listening(port: int, timeout: float = 0.4) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=timeout):
            return True
    except OSError:
        return False


def port_owner(port: int) -> str | None:
    """端口占用者自述，用来区分"我们的服务"和"占了端口的别人"。"""
    try:
        out = subprocess.run(
            ["netstat", "-ano", "-p", "TCP"],
            capture_output=True, text=True, timeout=10,
            creationflags=CREATE_NO_WINDOW,
        ).stdout
    except Exception:
        return None
    for row in out.splitlines():
        parts = row.split()
        if len(parts) >= 5 and parts[0].upper() == "TCP" and parts[3].upper() == "LISTENING":
            if parts[1].endswith(f":{port}"):
                return f"pid={parts[4]}"
    return None


def pg_ready() -> bool:
    """真查询：端口活着但 backend 全死的情况只有它能识破。"""
    try:
        import psycopg

        with psycopg.connect(
            f"postgresql://postgres@127.0.0.1:{PG_PORT}/postgres",
            connect_timeout=5,
        ) as conn, conn.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
        return True
    except Exception:
        return False


def daemon_ready() -> bool:
    """真 HTTP：401 也算活着（证明它在监听并校验 token），但裸端口不算。"""
    try:
        import httpx

        response = httpx.get(f"http://127.0.0.1:{DSH_PORT}/status", timeout=5, trust_env=False)
        return response.status_code in (200, 401)
    except Exception:
        return False


def kill_port_owner(port: int) -> None:
    owner = port_owner(port)
    if not owner:
        return
    pid = owner.split("=")[-1]
    try:
        subprocess.run(
            ["taskkill", "/F", "/PID", pid],
            capture_output=True, text=True, timeout=15,
            creationflags=CREATE_NO_WINDOW,
        )
    except Exception:
        pass


def start_postgres() -> int | None:
    """直起 postgres.exe。

    不经过 pg_ctl：pg_ctl 是控制台程序，拉起它就多一次创建控制台（即窗口）的机会。
    就绪判定本来也不靠 pg_ctl -w —— 我们有自己的 pg_ready() 真查询轮询。
    """
    LOGS.mkdir(parents=True, exist_ok=True)
    # postgres 的输出直接 append 进 postgres.log，几代启动前后能连起来看
    handle = open(PG_LOG, "a", encoding="utf-8", errors="replace")
    try:
        proc = subprocess.Popen(
            [str(PG_EXE), "-D", str(PG_DATA), "-p", str(PG_PORT)],
            cwd=str(PG_BIN),
            stdin=subprocess.DEVNULL,
            stdout=handle,
            stderr=subprocess.STDOUT,
            creationflags=CREATE_NO_WINDOW,
            close_fds=True,
        )
    except Exception as exc:
        log(f"direct postgres launch threw: {type(exc).__name__}: {exc}")
        handle.close()
        return None
    # 父进程退出后文件句柄交给 postgres 自己持有；这里不能关，否则 postgres 写不了日志
    return proc.pid


def daemon_env() -> dict[str, str]:
    env = dict(os.environ)
    env["CODEX_MEMORY_HOME"] = str(ROOT)
    env["TEMP"] = str(ROOT / "temp")
    env["TMP"] = env["TEMP"]
    env["HF_HOME"] = str(ROOT / "models" / "huggingface")
    env["TORCH_HOME"] = str(ROOT / "models" / "torch")
    env["PYTHONNOUSERSITE"] = "1"
    env.pop("PYTHONPATH", None)  # 别让外部 PYTHONPATH 干扰
    return env


def start_daemon() -> int | None:
    """用 venv 的 pythonw 起 memoryd。

    codex_memory 是 editable 装进 venv 的（__editable__.codex_memory-0.2.0.pth
    -> repo\\src），torch / fastapi / uvicorn 也都在 venv 里。用裸 cpython 或
    裸 runtime\\python 会立刻 ModuleNotFoundError，而且死得静悄悄 —— 别改。
    """
    try:
        proc = subprocess.Popen(
            [str(PYW), "-m", "codex_memory.cli", "serve"],
            cwd=str(REPO),
            env=daemon_env(),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=open(DAEMON_ERR, "a", encoding="utf-8", errors="replace"),
            creationflags=CREATE_NO_WINDOW,
            close_fds=False,
        )
        return proc.pid
    except Exception as exc:
        log(f"memoryd launch threw: {type(exc).__name__}: {exc}")
        return None


def stop_postgres() -> bool:
    """停库，返回端口是否真的释放了。

    注意：`postgres.exe ... stop` **不是**有效的停库命令 —— 只有 pg_ctl 会去读
    postmaster.pid 并发出关闭请求。2026-09-15 的 --cold 预演里就写成了前者，
    结果 postgres 照旧活着、端口没释放，脚本还白等 15 秒轮询。
    所以这里必须用 pg_ctl，并且用 CreateNoWindow 起它（它本身是控制台程序）。
    """
    if not port_listening(PG_PORT):
        return True
    try:
        subprocess.run(
            [str(PG_CTL), "-D", str(PG_DATA), "stop", "-m", "fast"],
            capture_output=True, text=True, timeout=25,
            creationflags=CREATE_NO_WINDOW,
        )
    except Exception as exc:
        log(f"pg_ctl stop threw: {type(exc).__name__}: {exc}")
    for _ in range(15):
        if not port_listening(PG_PORT):
            return True
        time.sleep(1)
    # 兜底：pg_ctl 没搞定就强杀。postgres 下次启动会自己做崩溃恢复。
    log("pg_ctl stop did not release the port; falling back to taskkill")
    kill_port_owner(PG_PORT)
    for _ in range(10):
        if not port_listening(PG_PORT):
            return True
        time.sleep(1)
    return not port_listening(PG_PORT)


def cold_rehearsal() -> None:
    """真实冷启动预演：先把两个服务停掉，再从零拉起。

    等价于"重启后第一次开机"的可验证版本 —— 服务全下、端口全释放，
    然后走完全相同的代码路径重新拉起。区别只有一个：模型在缓存里，
    所以 memoryd 会比真开机快。验收前跑这个足够，但真正的重启仍要人来验。
    """
    log("---- cold-start rehearsal requested (--cold): stopping both services first ----")
    try:
        if port_listening(PG_PORT):
            log(f"stopping postgres ({port_owner(PG_PORT)})")
            stop_postgres()

        if port_listening(DSH_PORT):
            log(f"stopping memoryd ({port_owner(DSH_PORT)})")
            kill_port_owner(DSH_PORT)
            for _ in range(15):
                if not port_listening(DSH_PORT):
                    break
                time.sleep(1)

        log(f"both stopped (pgPortFree={not port_listening(PG_PORT)} "
            f"dshPortFree={not port_listening(DSH_PORT)})")
    except Exception as exc:
        log(f"cold rehearsal stop stage threw: {type(exc).__name__}: {exc}")


def main() -> int:
    LOGS.mkdir(parents=True, exist_ok=True)
    (ROOT / "temp").mkdir(parents=True, exist_ok=True)
    if "--cold" in sys.argv:
        cold_rehearsal()

    log(f"---- run begin (pid {os.getpid()}, pythonw, no-console) ----")

    pg_ok = False
    pg_note = ""
    daemon_ok = False
    daemon_note = ""

    # ------------------------------------------------------------ PostgreSQL --
    try:
        if pg_ready():
            pg_ok, pg_note = True, "already-ready"
            log(f"postgresql already serving on {PG_PORT} (verified by query)")
        else:
            if port_listening(PG_PORT):
                log(
                    f"port {PG_PORT} is held ({port_owner(PG_PORT)}) but postgres does NOT "
                    "answer a query; stopping it before restart"
                )
                stop_postgres()

            pid = start_postgres()
            if not pid:
                pg_note = "launch-failed"
                log(f"ERROR: could not launch postgres.exe at all ({PG_EXE})")
            else:
                log(f"starting postgresql on {PG_PORT} via postgres-direct "
                    f"(pid {pid}, wait up to {PG_WAIT_SECONDS}s)")
                started = time.time()
                while time.time() - started < PG_WAIT_SECONDS:
                    time.sleep(2)
                    if pg_ready():
                        pg_ok = True
                        break
                if pg_ok:
                    pg_note = "started-via-postgres-direct"
                    log(f"postgresql is serving on {PG_PORT} "
                        f"(verified by query, took {int(time.time() - started)}s)")
                else:
                    pg_note = "timeout"
                    log(f"ERROR: postgresql not ready after {int(time.time() - started)}s")
                    if port_listening(PG_PORT):
                        log(f"       port {PG_PORT} IS listening ({port_owner(PG_PORT)}) "
                            "-> looks like the 0xC0000142 class failure")
                    else:
                        log(f"       port {PG_PORT} is NOT listening at all")
                    for path in (PG_LOG, LOGS / "pg-start.log"):
                        text = tail(path)
                        if text:
                            log(f"       {path.name} tail: {text}")
    except Exception as exc:
        pg_note = "exception"
        log(f"ERROR: postgres stage threw: {type(exc).__name__}: {exc}")

    # --------------------------------------------------------------- memoryd --
    try:
        if daemon_ready():
            daemon_ok, daemon_note = True, "already-ready"
            log(f"memoryd already serving on {DSH_PORT} (verified by HTTP)")
        else:
            if port_listening(DSH_PORT):
                log(f"port {DSH_PORT} is held ({port_owner(DSH_PORT)}) but /status is not "
                    "healthy; starting another instance anyway")
            pid = start_daemon()
            if not pid:
                daemon_note = "launch-failed"
                log(f"ERROR: could not launch memoryd at all ({PYW})")
            else:
                log(f"starting memoryd via pythonw (pid {pid}, wait up to {DAEMON_WAIT_SECONDS}s)")
                started = time.time()
                while time.time() - started < DAEMON_WAIT_SECONDS:
                    time.sleep(2)
                    if daemon_ready():
                        daemon_ok = True
                        break
                if daemon_ok:
                    daemon_note = "started-via-pythonw"
                    log(f"memoryd is serving on {DSH_PORT} "
                        f"(verified by HTTP, took {int(time.time() - started)}s)")
                else:
                    daemon_note = "timeout"
                    log(f"ERROR: memoryd not ready after {int(time.time() - started)}s")
                    if port_listening(DSH_PORT):
                        log(f"       port {DSH_PORT} IS listening ({port_owner(DSH_PORT)}) "
                            "but /status is unhealthy")
                    else:
                        log(f"       port {DSH_PORT} is NOT listening")
                    for path in (DAEMON_ERR, LOGS / "memoryd.log"):
                        text = tail(path, 15)
                        if text:
                            log(f"       {path.name} tail: {text}")
    except Exception as exc:
        daemon_note = "exception"
        log(f"ERROR: memoryd stage threw: {type(exc).__name__}: {exc}")

    # ---------------------------------------------------------------- verdict --
    if pg_ok and daemon_ok:
        verdict = "OK"
    elif pg_ok or daemon_ok:
        verdict = "PARTIAL"
    else:
        verdict = "FAILED"
    log(f"---- run end: {verdict} (pg={pg_ok}/{pg_note} dsh={daemon_ok}/{daemon_note}) ----")
    return 0 if (pg_ok and daemon_ok) else 1


if __name__ == "__main__":
    # 这个文件用 pythonw.exe 跑（GUI 子系统，不分配控制台）；手工排障用 python.exe：
    #   python.exe autostart.pyw            体检 + 按需启动
    #   python.exe autostart.pyw --check    只报状态，不启动任何东西
    #   python.exe autostart.pyw --cold     真实冷启动预演（先停服务再拉起）
    if "--check" in sys.argv:
        pg, dsh = pg_ready(), daemon_ready()
        print(f"postgres ready={pg} ({port_owner(PG_PORT) if port_listening(PG_PORT) else 'port free'})")
        print(f"memoryd  ready={dsh} ({port_owner(DSH_PORT) if port_listening(DSH_PORT) else 'port free'})")
        print(f"pythonw={PYW} exists={PYW.exists()}  postgres={PG_EXE} exists={PG_EXE.exists()}")
        sys.exit(0 if (pg and dsh) else 1)
    sys.exit(main())
