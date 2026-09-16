# 共享项目库：开机自启预检
#
# 重启前跑一遍，或重启后觉得「服务没起来」时跑一遍。
# 它只读不写（除了可选的 -RunDryRun），逐项告诉你自启链路哪里断了。
#
# 用法：
#   powershell -NoProfile -ExecutionPolicy Bypass -File verify-autostart.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File verify-autostart.ps1 -RunDryRun

[CmdletBinding()]
param(
    [switch]$RunDryRun   # 顺便真的跑一次静默启动脚本的 -DryRun（只体检不启动）
)

$ErrorActionPreference = 'Continue'

$root        = 'D:\codex-memory'
$taskName    = 'CodexMemoryAutostart'
$scriptPath  = Join-Path $root 'repo\scripts\start-memoryd-silent.ps1'   # 手工排障用
$pywLauncher = Join-Path $root 'repo\scripts\autostart.pyw'              # 开机链路实际用的
$startupDir  = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
$pgPort   = 55440
$dshPort  = 47831

$pass = 0; $warn = 0; $fail = 0
function Ok   ([string]$m) { Write-Host "  [OK]   $m"   -ForegroundColor Green;  $script:pass++ }
function Warn ([string]$m) { Write-Host "  [WARN] $m"   -ForegroundColor Yellow; $script:warn++ }
function Bad  ([string]$m) { Write-Host "  [FAIL] $m"   -ForegroundColor Red;    $script:fail++ }
function Head ([string]$m) { Write-Host ''; Write-Host $m -ForegroundColor Cyan }

Write-Host ''
Write-Host '共享项目库 · 开机自启预检' -ForegroundColor White
Write-Host "时间：$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

# ---------------------------------------------------------------- 系统版本 --
Head '1. 系统版本（决定 VBScript 还能不能当自启手段）'
$os = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$build = [int]$os.CurrentBuild
Write-Host "  Windows $($os.DisplayVersion) build $build.$($os.UBR)"
if ($build -ge 26200) {
    Warn "build >= 26200（25H2）：VBScript 已被弃用，启动目录里的 .vbs 不再可靠 —— 这也是本次改造的原因"
} else {
    Ok 'build < 26200：VBScript 尚未进入弃用范围'
}

# ------------------------------------------------------------ 计划任务（主） --
Head '2. 计划任务（主路径）'
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) {
    Bad "计划任务 $taskName 不存在 —— 登录时不会自动拉起服务"
} else {
    if ($task.State -ne 'Disabled') { Ok "任务存在，State=$($task.State)" } else { Bad "任务被禁用了（State=Disabled）" }

    $a = $task.Actions[0]
    Write-Host "      动作：$($a.Execute)"
    Write-Host "      参数：$($a.Arguments)"
    if ($a.Arguments -match 'autostart\.pyw') { Ok '动作指向 autostart.pyw（无控制台启动器）' }
    else { Bad "动作没有指向 autostart.pyw —— 当前是 $($a.Arguments)" }
    if ($a.Execute -match 'pythonw\.exe$') { Ok '动作程序是 pythonw.exe（GUI 子系统，不申请控制台）' }
    else { Bad "动作程序是 $($a.Execute) —— 控制台程序会开出一个可见窗口（默认终端是 Windows Terminal）" }

    $trg = $task.Triggers[0]
    if ($trg.CimClass.CimClassName -match 'LogonTrigger') { Ok '触发器 = 登录时' } else { Bad "触发器不是 LogonTrigger（实际 $($trg.CimClass.CimClassName)）" }
    if ($trg.Delay) { Ok "延迟 = $($trg.Delay)（开机瞬间资源紧张，留点缓冲）" } else { Warn '没有设置延迟' }

    if ($task.Principal.LogonType -eq 'Interactive') { Ok 'LogonType=Interactive（跑在用户会话里，popup 不会冒到别的会话）' }
    else { Warn "LogonType=$($task.Principal.LogonType)" }

    if ($task.Settings.Hidden) { Ok 'Settings.Hidden=True（连宿主窗口都不创建，不会闪黑框）' }
    else { Bad 'Settings.Hidden=False —— 登录时可能闪一下 PowerShell/控制台窗口' }

    $info = Get-ScheduledTaskInfo -TaskName $taskName
    if ($info.LastRunTime -and $info.LastRunTime.Year -gt 2000) {
        Write-Host "      上次运行：$($info.LastRunTime)  结果码：$($info.LastTaskResult)  (0=成功, 267009=正在跑)"
        if ($info.LastTaskResult -eq 0) { Ok '上次运行成功' }
        elseif ($info.LastTaskResult -eq 267009) { Ok '上次运行仍在进行中' }
        else { Bad "上次运行结果码 $($info.LastTaskResult) —— 看 D:\codex-memory\logs\startup.log 的对应时间段" }
    } else { Warn '没有运行记录（还没登录触发过；可手动跑一次：schtasks /run /tn ' + $taskName + '）' }
}

# --------------------------------------------------------- 注册表 Run（备） --
Head '3. 注册表 Run 键（第二保险）'
$run = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue
if (-not $run) { Bad '读不到 HKCU Run 键' }
else {
    $hit = $run.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' -and $_.Value -match 'autostart\.pyw|start-memoryd-silent' }
    if ($hit) {
        Ok "存在：$($hit.Name)"
        Write-Host "      值：$($hit.Value)"
        if ($hit.Value -match 'pythonw\.exe' -and $hit.Value -match 'autostart\.pyw') {
            Ok '用 pythonw + autostart.pyw 调用（不会闪黑框）'
        } else {
            Bad 'Run 项用的是控制台程序（会闪黑框）—— 应改为 pythonw.exe + autostart.pyw'
        }
    } else {
        Warn '没有自启的 Run 项（只剩计划任务单条路径）'
    }
}

# ------------------------------------------------------- 启动目录（历史包袱） --
Head '4. 启动目录（历史遗留的自启项）'
$vbs = Get-ChildItem $startupDir -Filter '*.vbs' -Force -ErrorAction SilentlyContinue
$other = Get-ChildItem $startupDir -Force -ErrorAction SilentlyContinue | Where-Object { $_.Name -notin @('desktop.ini') -and $_.Extension -ne '.vbs' }
foreach ($v in $vbs) {
    Warn "启动目录里还有 .vbs：$($v.Name) —— build>=26200 上不保证被执行，有效内容已迁移到计划任务"
}
if ($other) { foreach ($o in $other) { Write-Host "      $($o.Name)" } }
if (-not $vbs -and -not $other) { Ok '启动目录干净' }
if (-not $vbs) { Ok '启动目录里没有 .vbs（不依赖 VBScript）' }

# ------------------------------------------------------------------ 文件 ---
Head '5. 关键文件是否存在'
foreach ($f in @($scriptPath, $pywLauncher,
                 (Join-Path $root 'runtime\venv\Scripts\pythonw.exe'),
                 (Join-Path $root 'runtime\venv\Scripts\python.exe'),
                 'D:\codex\.runtimes\kstage-postgres\node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe',
                 (Join-Path $root 'repo\scripts\pg_ready.py'),
                 (Join-Path $root 'repo\scripts\daemon_ready.py'),
                 (Join-Path $root 'repo\src\codex_memory'))) {
    if (Test-Path $f) { Ok $f } else { Bad "缺失：$f" }
}

# ------------------------------------------------------------------ 当前状态 --
Head '6. 两个服务的当前状态'
foreach ($pair in @(@{Port=$pgPort; Name='PostgreSQL'}, @{Port=$dshPort; Name='memoryd'})) {
    $c = Get-NetTCPConnection -State Listen -LocalPort $pair.Port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) {
        $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        Ok "$($pair.Name) 正在监听 $($pair.Port)（pid $($c.OwningProcess) $($p.ProcessName)，启动于 $($p.StartTime)）"
    } else {
        Warn "$($pair.Name) 没有监听 $($pair.Port)（现在没跑，或还没起）"
    }
}

# ------------------------------------------------------------ 窗口策略体检 --
Head '7. 不会弹出黑框（这条最影响体感，逐项查）'
# 只看代码行：注释里会提到这些名字（解释为什么不这么写），按整段匹配会自己骗自己。
# 上一版就因为匹配到注释，报了 2 条假 FAIL —— 检查工具本身也得自证，别冤枉实现。
$launcherLines = Get-Content $pywLauncher -Encoding UTF8 -ErrorAction SilentlyContinue |
    Where-Object { $_.Trim() -notmatch '^#' -and $_.Trim() -notmatch '^\s*"""' }
$launcher = $launcherLines -join "`n"
if ($launcher -match 'CREATE_NO_WINDOW') { Ok '启动器给子进程打 CREATE_NO_WINDOW（窗口在创建阶段就不存在）' }
else { Bad '启动器没有用 CREATE_NO_WINDOW —— 控制台子进程可能闪黑框' }
if ($launcher -match "'postgres\.exe'|postgres\.exe") { Ok '直起 postgres.exe，不经过 pg_ctl / cmd 这层控制台程序' }
else { Warn '没有直起 postgres.exe，可能仍在经过 pg_ctl' }
foreach ($needle in @('--check', '--cold')) {
    if ($launcher -match [regex]::Escape($needle)) { Ok "自带排障开关 $needle" } else { Warn "缺少排障开关 $needle" }
}

# 现役进程里不该出现挂在服务下面的 cmd.exe
$pgPid = (Get-NetTCPConnection -State Listen -LocalPort $pgPort -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
if ($pgPid) {
    $pgProc = Get-CimInstance Win32_Process -Filter "ProcessId=$pgPid" -ErrorAction SilentlyContinue
    if ($pgProc -and $pgProc.Name -eq 'postgres.exe') { Ok "55440 由 postgres.exe 直接持有（pid $pgPid）" }
    elseif ($pgProc) { Warn "55440 的持有者是 $($pgProc.Name)，不是 postgres.exe" }
    $strayCmd = Get-CimInstance Win32_Process -Filter "Name='cmd.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ParentProcessId -eq $pgPid -or $_.CommandLine -match 'postgres\.exe' }
    if ($strayCmd) { Warn "有 cmd.exe 夹在 postgres 前面（可能带来控制台窗口）：pid $($strayCmd.ProcessId -join ',')" }
    else { Ok 'postgres 前面没有夹 cmd.exe' }
}

Write-Host ''
Write-Host '  说明：真正的"闪不闪"取决于登录时的窗口创建瞬间，静态查不到。'
Write-Host '  实测记录（2026-09-15）：走真实计划任务路径冷启动 + 400ms 轮询新建可见窗口，'
Write-Host '  全程 0 个可见窗口出现。'

# ------------------------------------------------------------------ dry run --
if ($RunDryRun) {
    Head '8. 启动器自检（只体检不启动）'
    & (Join-Path $root 'runtime\venv\Scripts\python.exe') $pywLauncher --check
    if ($LASTEXITCODE -eq 0) { Ok '启动器自检通过' } else { Bad "启动器自检返回 $LASTEXITCODE" }
} else {
    Head '8. 启动器自检'
    Write-Host '  （跳过。加 -RunDryRun 可以真的跑一次体检）'
}

# ------------------------------------------------------------------ 结论 ---
Head '结论'
Write-Host "  通过 $pass 项，警告 $warn 项，失败 $fail 项" -ForegroundColor White
if ($fail -eq 0) {
    Write-Host '  自启链路完整，可以重启验证。' -ForegroundColor Green
    Write-Host '  重启后如果球出来了但服务要手动拉，看 D:\codex-memory\logs\startup.log 里 [autostart] 的行。'
} else {
    Write-Host '  有失败项，先照着上面的 [FAIL] 修。' -ForegroundColor Red
}
Write-Host ''
if ($fail -gt 0) { exit 1 } else { exit 0 }
