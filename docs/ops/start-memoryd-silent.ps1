# 共享项目库：开机静默启动 PostgreSQL + memoryd
#
# 目标：全程无窗口、无控制台、任务栏不出现任何东西；失败时留得下证据。
#
# 为什么每一行都这么写（都是踩过的坑，别退回去）：
#
#  1) 端口监听 != 服务可用。postmaster 可以占着 55440 而所有 backend 都以
#     0xC0000142 (STATUS_DLL_INIT_FAILED) 死掉 —— 端口看起来是好的，客户端一个
#     都连不上。所以判定必须走真探测：pg_ready.py / daemon_ready.py。
#
#  2) 探测要用 venv 的 python，不是 runtime 里那个裸 cpython！
#     裸解释器没有 psycopg / httpx，探测脚本会以 ModuleNotFoundError 退出，
#     于是「Postgres 明明好好的」被判成「没起来」，然后去把一个健康的实例停掉重启。
#     这个假阴性 2026-09-15 真的发生过一次（见 startup.log 09:57:39 那条）。
#     拉起 memoryd 用裸 pythonw 没问题（模块在 src/ 里），探测必须用 $pyProbe。
#
#  3) 不要用 Get-NetTCPConnection 当探测。开机早期 NetTCPIP 未必就绪，而且每次
#     调用要几百毫秒。这里用纯 .NET TcpClient 做「端口有没有人听」的快速预判，
#     真正的判定仍然交给 python 探测脚本。
#
#  4) 本脚本由 Task Scheduler 在登录时拉起，动作进程处在一个 job object 里。
#     已实测（jobtest 实验，2026-09-15）：WMI 和 Start-Process 两种方式拉起的
#     子进程都能在任务动作退出后继续活着，所以不会被连带杀掉。仍优先用 WMI，
#     因为它连「万一以后 job 带上 KILL_ON_JOB_CLOSE」都不怕。
#
#  5) 失败必须留痕。以前这个脚本是纯静默的：开机没起来时没有任何日志、没有退出码、
#     没有提示，完全无法定位。现在每一轮都追加写 startup.log，并把关键证据
#     （端口占用者、postgres.log 尾部、memoryd 错误尾部）一并记下。
#
#  6) pg_ctl 的参数不要经过 cmd 这一层（引号会被剥掉，见 start-pg.bat 的注释）。
#
# 用法：
#   正常由计划任务 CodexMemoryAutostart / 注册表 Run 键调用，无参数即可。
#   手工排障： powershell -NoProfile -ExecutionPolicy Bypass -File <本文件>
#   只体检：   ... -File <本文件> -DryRun
#   真实冷启动预演（会真的停服务再拉起来，别在开会前跑）：
#     powershell -NoProfile -ExecutionPolicy Bypass -File <本文件> -Cold

[CmdletBinding()]
param(
    [int]$PgWaitSeconds = 120,     # 开机时磁盘/DLL 初始化慢，45 秒不够
    [int]$DaemonWaitSeconds = 180, # 首次要加载 Qwen3-Embedding (~1.2GB)
    [switch]$Cold,                 # 预演：先把两个服务停掉，再从零拉起
    [switch]$DryRun                # 只体检不启动：报告现状后退出
)

$ErrorActionPreference = 'Continue'

$root    = 'D:\codex-memory'
$pgBin   = 'D:\codex\.runtimes\kstage-postgres\node_modules\@embedded-postgres\windows-x64\native\bin'
$pgCtl   = Join-Path $pgBin 'pg_ctl.exe'
$pgData  = Join-Path $root 'pgdata'
$logs    = Join-Path $root 'logs'
$repo    = Join-Path $root 'repo'
$pyLaunch = Join-Path $root 'runtime\venv\Scripts\pythonw.exe'  # 启动 memoryd：必须用 venv（codex_memory 是 editable 装在 venv 里的）
$pyProbe  = Join-Path $root 'runtime\venv\Scripts\python.exe'   # 探测用（有 psycopg/httpx）
$pgLog   = Join-Path $logs 'postgres.log'
$pgPort  = 55440
$dshPort = 47831

$script:StartupLog = Join-Path $logs 'startup.log'
$script:PgErrLog   = Join-Path $logs 'pg-silent.err.log'
$script:PgOutLog   = Join-Path $logs 'pg-silent.out.log'
$script:DaemonOut  = Join-Path $logs 'memoryd-silent.out.log'
$script:DaemonErr  = Join-Path $logs 'memoryd-silent.err.log'

New-Item -ItemType Directory -Force -Path $logs | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $root 'temp') | Out-Null

# ------------------------------------------------------------------ logging --
function Write-Log([string]$message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  [autostart] $message"
    try { $line | Out-File -FilePath $script:StartupLog -Append -Encoding utf8 } catch { }
}

function Get-Tail([string]$path, [int]$lines = 12) {
    try {
        if (Test-Path $path) {
            $text = (Get-Content -Path $path -Tail $lines -ErrorAction Stop) -join ' | '
            if ($text.Trim()) { return $text }
        }
    } catch { }
    return $null
}

# ------------------------------------------------------------ health probes --
function Test-PortListening([int]$port, [int]$timeoutMs = 400) {
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $iar = $client.BeginConnect('127.0.0.1', $port, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne($timeoutMs, $false) -and $client.Connected) {
            $client.EndConnect($iar)
            return $true
        }
        return $false
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Test-PgReady {
    # 真查询：端口活着但 backend 全死的情况只有它能识破
    & $pyProbe (Join-Path $repo 'scripts\pg_ready.py') $pgPort 'postgres' *> $null
    return ($LASTEXITCODE -eq 0)
}

function Test-DaemonReady {
    & $pyProbe (Join-Path $repo 'scripts\daemon_ready.py') *> $null
    return ($LASTEXITCODE -eq 0)
}

function Get-PortOwnerInfo([int]$port) {
    # 返回 "pid=1234 name=postgres"：用来区分「我们的服务」和「占了端口的别人」
    try {
        $c = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop | Select-Object -First 1
        if (-not $c) { return $null }
        $procName = $null
        try { $procName = (Get-Process -Id $c.OwningProcess -ErrorAction Stop).ProcessName } catch { }
        if ($procName) { return "pid=$($c.OwningProcess) name=$procName" }
        return "pid=$($c.OwningProcess) name=?"
    } catch { return $null }
}

# ---------------------------------------------------------------- launching --
function ConvertTo-ArgString([string[]]$values) {
    # 手工拼参数串。
    #
    # 为什么不用 ProcessStartInfo.ArgumentList：那是 .NET Core 才有的 API。
    # 本脚本由 Windows PowerShell 5.1 跑（.NET Framework 4.x），ArgumentList 是 null，
    # $psi.ArgumentList.Add(...) 会直接抛 "不能对 Null 值表达式调用方法"，而且被
    # try/catch 吞掉后看起来像"启动失败"。2026-09-15 在停库路径上真的踩到过一次。
    $quoted = foreach ($v in $values) {
        if ($v -match '[\s"]') {
            '"' + ($v -replace '(\\*)"', '$1$1\"') + '"'
        } else {
            $v
        }
    }
    return ($quoted -join ' ')
}

function Start-NoWindow([string]$filePath, [string[]]$argumentList, [string]$workingDirectory, [string]$logPath) {
    # 唯一目的：绝不让任何黑框出现在屏幕上。
    #
    # 不用 Start-Process -WindowStyle Hidden 跑控制台程序：那只是"先建窗口再藏起来"，
    # 在把 Windows Terminal 设为默认终端的机器上，窗口会先冒出来一下。这里用 .NET 的
    # ProcessStartInfo 直接给子进程打 CreateNoWindow，窗口在创建阶段就不存在。
    #
    # 输出用 append：postgres 每一代启动都往同一个 postgres.log 接着写，
    # 排障时前后两代能连起来看，不会被覆盖。
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName               = $filePath
    $psi.Arguments              = (ConvertTo-ArgString $argumentList)
    $psi.WorkingDirectory       = $workingDirectory
    $psi.UseShellExecute        = $false
    $psi.CreateNoWindow         = $true
    $psi.WindowStyle            = [System.Diagnostics.ProcessWindowStyle]::Hidden
    $psi.RedirectStandardInput  = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true
    $proc = [System.Diagnostics.Process]::Start($psi)
    # 立刻关掉 stdin：postgres 不接受继承来的 stdin，会拒绝启动
    try { $proc.StandardInput.Close() } catch { }
    # 后台把输出泵进日志，不阻塞本脚本继续做就绪探测
    $pump = {
        param($sender, $e)
        if ($e.Data) { $e.Data | Out-File -FilePath $Event.MessageData -Append -Encoding utf8 }
    }
    $null = Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -Action $pump -MessageData $logPath
    $null = Register-ObjectEvent -InputObject $proc -EventName ErrorDataReceived  -Action $pump -MessageData $logPath
    $proc.BeginOutputReadLine()
    $proc.BeginErrorReadLine()
    return @{ Pid = $proc.Id; Process = $proc }
}

function Start-PgProcess {
    # 直接起 postgres.exe，不再经过 pg_ctl / cmd。
    #
    # 为什么不走 pg_ctl：pg_ctl 是控制台程序，拉起它就等于给 Windows 一次创建控制台
    # 窗口的机会（本机默认终端是 Windows Terminal，实测确实见过一个标题为 pg_ctl.exe
    # 的终端窗口）。postgres.exe 本身就是服务器，直接起它更干净；就绪判定本来也不靠
    # pg_ctl -w —— 我们有自己的 pg_ready.py 真查询轮询。
    #
    # 也不用 WMI：Win32_Process.Create 关不掉窗口创建，控制台程序仍可能拿到可见控制台。
    $pgArgs = @('-D', $pgData, '-p', "$pgPort")
    try {
        $info = Start-NoWindow -filePath (Join-Path $pgBin 'postgres.exe') -argumentList $pgArgs `
            -workingDirectory $pgBin -logPath $pgLog
        return @{ Via = 'postgres-direct'; Pid = $info.Pid }
    } catch {
        Write-Log "direct postgres launch threw: $($_.Exception.Message)"
    }
    return $null
}

function Invoke-PgStop([string]$mode) {
    # 停库也要静默：pg_ctl 是控制台程序，直接调用可能闪黑框。
    # 先用隐藏窗口的 pg_ctl；万一它不在了，用 postgres.exe 自己的 stop 子命令兜底。
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName  = $pgCtl
        $psi.Arguments = (ConvertTo-ArgString @('-D', $pgData, 'stop', '-m', $mode))
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow  = $true
        $psi.WindowStyle     = [System.Diagnostics.ProcessWindowStyle]::Hidden
        $p = [System.Diagnostics.Process]::Start($psi)
        $p.WaitForExit(20000) | Out-Null
        return $true
    } catch {
        Write-Log "pg_ctl stop ($mode) threw: $($_.Exception.Message)"
        try {
            $psi2 = New-Object System.Diagnostics.ProcessStartInfo
            $psi2.FileName  = Join-Path $pgBin 'postgres.exe'
            $psi2.Arguments = (ConvertTo-ArgString @('-D', $pgData, '-p', "$pgPort", 'stop', '-m', $mode))
            $psi2.UseShellExecute = $false
            $psi2.CreateNoWindow  = $true
            $p2 = [System.Diagnostics.Process]::Start($psi2)
            $p2.WaitForExit(20000) | Out-Null
            return $true
        } catch {
            Write-Log "postgres stop ($mode) threw: $($_.Exception.Message)"
            return $false
        }
    }
}

function Set-DaemonEnvironment {
    $env:CODEX_MEMORY_HOME = $root
    $env:TEMP  = Join-Path $root 'temp'
    $env:TMP   = $env:TEMP
    $env:HF_HOME   = Join-Path $root 'models\huggingface'
    $env:TORCH_HOME = Join-Path $root 'models\torch'
    $env:PYTHONNOUSERSITE = '1'
}

function Start-DaemonProcess {
    # memoryd：优先 Start-Process —— 能在交互会话里直接带上这里建好的环境块，
    # 并且能把 stdout/stderr 落到日志，排障时不至于抓瞎（实测子进程能活过任务动作）。
    Set-DaemonEnvironment
    Remove-Item Env:\PYTHONPATH -ErrorAction SilentlyContinue   # 别让外部 PYTHONPATH 干扰
    try {
        $p = Start-Process -FilePath $pyLaunch -ArgumentList '-m', 'codex_memory.cli', 'serve' `
            -WorkingDirectory $repo -WindowStyle Hidden `
            -RedirectStandardOutput $script:DaemonOut -RedirectStandardError $script:DaemonErr `
            -PassThru -ErrorAction Stop
        return @{ Via = 'start-process'; Pid = $p.Id }
    } catch {
        Write-Log "Start-Process of memoryd threw: $($_.Exception.Message)"
    }
    # 兜底：WMI（拿不到重定向，daemon 自己会写 memoryd.log）
    try {
        $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{
            CommandLine      = ('"{0}" -m codex_memory.cli serve' -f $pyLaunch)
            CurrentDirectory = $repo
        } -ErrorAction Stop
        if ($r.ReturnValue -eq 0) { return @{ Via = 'wmi'; Pid = [int]$r.ProcessId } }
        Write-Log "WMI launch of memoryd failed: ReturnValue=$($r.ReturnValue)"
    } catch {
        Write-Log "WMI launch of memoryd threw: $($_.Exception.Message)"
    }
    return $null
}

function Wait-Ready([scriptblock]$probe, [int]$seconds, [ref]$ok, [int]$watchPid = 0) {
    # watchPid != 0 时同时盯进程存活：进程已经死了就别再等满超时，
    # 早失败、早把真正的错误写进日志（2026-09-15 的 memoryd 就是死在这里）。
    $deadline = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 2
        if (& $probe) { $ok.Value = $true; return 'ready' }
        if ($watchPid -gt 0 -and -not (Get-Process -Id $watchPid -ErrorAction SilentlyContinue)) {
            return 'process-exited'
        }
    }
    return 'timeout'
}

# ------------------------------------------------------------------ dry run --
if ($DryRun) {
    Write-Log '---- dry-run begin ----'
    $pg = Test-PgReady
    $dsh = Test-DaemonReady
    if (Test-PortListening $pgPort) { $pgPortInfo = "port held: $(Get-PortOwnerInfo $pgPort)" } else { $pgPortInfo = 'port free' }
    if (Test-PortListening $dshPort) { $dshPortInfo = "port held: $(Get-PortOwnerInfo $dshPort)" } else { $dshPortInfo = 'port free' }
    Write-Log "dry-run: postgres ready=$pg ($pgPortInfo)"
    Write-Log "dry-run: memoryd  ready=$dsh ($dshPortInfo)"
    Write-Log "dry-run: launcher=$(Test-Path $pyLaunch) probe=$(Test-Path $pyProbe) pgCtl=$(Test-Path $pgCtl) src=$(Test-Path (Join-Path $repo 'src\codex_memory'))"
    Write-Log '---- dry-run end ----'
    if ($pg -and $dsh) { exit 0 } else { exit 1 }
}

# --------------------------------------------------------------- cold start --
if ($Cold) {
    Write-Log '---- cold-start rehearsal requested (-Cold): stopping both services first ----'
    try {
        if (Test-PortListening $pgPort) {
            Write-Log "stopping postgres ($(Get-PortOwnerInfo $pgPort))"
            Invoke-PgStop 'fast' | Out-Null
            for ($i = 0; $i -lt 15 -and (Test-PortListening $pgPort); $i++) { Start-Sleep -Seconds 1 }
        }
        if (Test-PortListening $dshPort) {
            Write-Log "stopping memoryd ($(Get-PortOwnerInfo $dshPort))"
            try {
                $c = Get-NetTCPConnection -State Listen -LocalPort $dshPort -ErrorAction Stop | Select-Object -First 1
                if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop }
            } catch { Write-Log "could not stop memoryd: $($_.Exception.Message)" }
            for ($i = 0; $i -lt 15 -and (Test-PortListening $dshPort); $i++) { Start-Sleep -Seconds 1 }
        }
        Write-Log "both stopped (pgPortFree=$(-not (Test-PortListening $pgPort)) dshPortFree=$(-not (Test-PortListening $dshPort)))"
    } catch {
        Write-Log "cold rehearsal stop stage threw: $($_.Exception.Message)"
    }
}

# ----------------------------------------------------------------------- run --
Write-Log ('---- run begin (pid {0}, pgWait {1}s, daemonWait {2}s, cold {3}) ----' -f $PID, $PgWaitSeconds, $DaemonWaitSeconds, [bool]$Cold)

# ---------------------------------------------------------------- PostgreSQL --
$pgOk   = $false
$pgNote = ''

try {
    if (Test-PgReady) {
        $pgOk = $true; $pgNote = 'already-ready'
        Write-Log "postgresql already serving on $pgPort (verified by query)"
    } else {
        if (Test-PortListening $pgPort) {
            $owner = Get-PortOwnerInfo $pgPort
            Write-Log "port $pgPort is held ($owner) but postgres does NOT answer a query; stopping it before restart"
            Invoke-PgStop 'fast' | Out-Null
            Start-Sleep -Seconds 2
            if (Test-PortListening $pgPort) {
                Write-Log "WARNING: port $pgPort still held after pg_ctl stop; something else owns it"
            }
        }

        $pgProc = Start-PgProcess
        if (-not $pgProc) {
            $pgNote = 'launch-failed'
            Write-Log "ERROR: could not launch postgres.exe at all ($pgBin)"
        } else {
            Write-Log "starting postgresql on $pgPort via $($pgProc.Via) (pid $($pgProc.Pid), wait up to ${PgWaitSeconds}s)"
            $t0 = Get-Date
            $r = Wait-Ready { Test-PgReady } $PgWaitSeconds ([ref]$pgOk) $pgProc.Pid
            if ($r -eq 'ready') {
                $pgNote = "started-via-$($pgProc.Via)"
                Write-Log "postgresql is serving on $pgPort (verified by query, took $([int]((Get-Date) - $t0).TotalSeconds)s)"
            } else {
                $pgNote = $r
                Write-Log "ERROR: postgresql not ready ($r) after $([int]((Get-Date) - $t0).TotalSeconds)s"
                if ($r -eq 'process-exited') {
                    Write-Log "       the launched postgres (pid $($pgProc.Pid)) exited before becoming ready"
                }
                if (Test-PortListening $pgPort) {
                    Write-Log "       port $pgPort IS listening ($(Get-PortOwnerInfo $pgPort)) -> looks like the 0xC0000142 class failure"
                } else {
                    Write-Log "       port $pgPort is NOT listening at all"
                }
                $t = Get-Tail $pgLog 12; if ($t) { Write-Log "       postgres.log tail: $t" }
                $t = Get-Tail $script:PgErrLog 12; if ($t) { Write-Log "       pg-silent.err.log tail: $t" }
                $t = Get-Tail (Join-Path $logs 'pg-start.log') 12; if ($t) { Write-Log "       pg-start.log tail: $t" }
            }
        }
    }
} catch {
    $pgNote = 'exception'
    Write-Log "ERROR: postgres stage threw: $($_.Exception.GetType().Name): $($_.Exception.Message)"
    Write-Log "       at $($_.InvocationInfo.PositionMessage -replace "`r?`n", ' ')"
}

# ------------------------------------------------------------------- memoryd --
$dshOk   = $false
$dshNote = ''

try {
    if (Test-DaemonReady) {
        $dshOk = $true; $dshNote = 'already-ready'
        Write-Log "memoryd already serving on $dshPort ($(Get-PortOwnerInfo $dshPort), verified by HTTP)"
    } else {
        if (Test-PortListening $dshPort) {
            Write-Log "port $dshPort is held ($(Get-PortOwnerInfo $dshPort)) but /status is not healthy; starting another instance anyway"
        }
        $dshProc = Start-DaemonProcess
        if (-not $dshProc) {
            $dshNote = 'launch-failed'
            Write-Log "ERROR: could not launch memoryd at all ($pyLaunch)"
        } else {
            Write-Log "starting memoryd via $($dshProc.Via) (pid $($dshProc.Pid), wait up to ${DaemonWaitSeconds}s)"
            $t0 = Get-Date
            $r = Wait-Ready { Test-DaemonReady } $DaemonWaitSeconds ([ref]$dshOk) $dshProc.Pid
            if ($r -eq 'ready') {
                $dshNote = "started-via-$($dshProc.Via)"
                Write-Log "memoryd is serving on $dshPort (verified by HTTP, took $([int]((Get-Date) - $t0).TotalSeconds)s)"
            } else {
                $dshNote = $r
                Write-Log "ERROR: memoryd not ready ($r) after $([int]((Get-Date) - $t0).TotalSeconds)s"
                if ($r -eq 'process-exited') {
                    Write-Log "       the launched process (pid $($dshProc.Pid)) exited before becoming ready"
                }
                if (Test-PortListening $dshPort) {
                    Write-Log "       port $dshPort IS listening ($(Get-PortOwnerInfo $dshPort)) but /status is unhealthy"
                } else {
                    Write-Log "       port $dshPort is NOT listening"
                }
                $t = Get-Tail $script:DaemonErr 15; if ($t) { Write-Log "       memoryd-silent.err.log tail: $t" }
                $t = Get-Tail (Join-Path $logs 'memoryd.log') 8; if ($t) { Write-Log "       memoryd.log tail: $t" }
            }
        }
    }
} catch {
    $dshNote = 'exception'
    Write-Log "ERROR: memoryd stage threw: $($_.Exception.GetType().Name): $($_.Exception.Message)"
    Write-Log "       at $($_.InvocationInfo.PositionMessage -replace "`r?`n", ' ')"
}

# -------------------------------------------------------------------- verdict --
$verdict = if ($pgOk -and $dshOk) { 'OK' } elseif ($pgOk -or $dshOk) { 'PARTIAL' } else { 'FAILED' }
Write-Log "---- run end: $verdict (pg=$pgOk/$pgNote dsh=$dshOk/$dshNote) ----"

if ($pgOk -and $dshOk) { exit 0 } else { exit 1 }
