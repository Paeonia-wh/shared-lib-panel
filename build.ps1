# 面板构建脚本 —— 把两个反复踩到的坑固定在这里，免得每次手动处理。
#
# 坑 1：系统代理端口会变/会挂（本机是 FlClash，端口在 10909/10910 之间跳过），
#       而 cargo 会读系统代理设置 → 一挂就拉不到 rsproxy 依赖，报
#       "download of config.json failed / Could not connect to server"。
#       解法：rsproxy 是国内镜像，本来就不该走代理 → 设 NO_PROXY 例外。
#       注意 cargo 1.97 不认 config.toml 里的 [http] no-proxy，只认环境变量。
#
# 坑 2：exe 被运行中的面板锁住时 cargo 报 os error 5（拒绝访问）→ 必须先停进程。
#
# 用法：  pwsh -File build.ps1
param([switch]$NoRestart)

$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot

# —— 坑 1：让 cargo 直连国内镜像，不经过可能坏掉的系统代理 ——
$env:NO_PROXY = 'rsproxy.cn,.rsproxy.cn,127.0.0.1,localhost'
$env:no_proxy = $env:NO_PROXY

# —— 坑 2：先停掉运行中的面板，否则 exe 被锁 ——
$running = Get-Process shared-lib-panel -ErrorAction SilentlyContinue
if ($running) {
  Write-Host "[build] 停掉运行中的面板 (pid=$($running.Id))" -ForegroundColor Yellow
  $running | Stop-Process -Force
  Start-Sleep -Seconds 3
}

Write-Host '[build] 1/2 前端打包 + 写构建戳' -ForegroundColor Cyan
Push-Location $root
cmd /c "npm run front 2>&1" | Select-String -Pattern '构建完成|ERROR' | ForEach-Object { Write-Host "  $($_.Line.Trim())" }

Write-Host '[build] 2/2 cargo 编译（把前端嵌进 exe）' -ForegroundColor Cyan
Push-Location "$root\src-tauri"
cmd /c 'cargo build --message-format short > "%TEMP%\slp-cargo.txt" 2>&1'
$code = $LASTEXITCODE
Get-Content "$env:TEMP\slp-cargo.txt" -ErrorAction SilentlyContinue | Select-Object -Last 3 | ForEach-Object { Write-Host "  $_" }
Pop-Location
Pop-Location

if ($code -ne 0) { Write-Host "[build] cargo 失败，退出码 $code" -ForegroundColor Red; exit $code }

# —— 校验：exe 必须比 dist 新，否则说明前端没被重新嵌入（改了等于没改）——
# 注意：不能拿"嵌入资源文件的时间戳"当判据 —— 内容没变时 cargo 不重写那些文件，
#       时间戳会一直很旧，看着像没嵌入（第一版就误报过）。exe 本身的时间最可靠。
$distT = (Get-ChildItem "$root\dist" -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1).LastWriteTime
$exeT  = (Get-Item "$root\src-tauri\target\debug\shared-lib-panel.exe").LastWriteTime
Write-Host "[build] dist=$distT  exe=$exeT"
if ($exeT -gt $distT) {
  Write-Host '[build] ✓ exe 比 dist 新（前端已重新嵌入）' -ForegroundColor Green
} else {
  Write-Host '[build] ⚠ exe 比 dist 旧 —— 前端可能没嵌进去，界面不会变' -ForegroundColor Yellow
}

if (-not $NoRestart) {
  Write-Host '[build] 启动面板' -ForegroundColor Cyan
  Start-Process -FilePath "$root\src-tauri\target\debug\shared-lib-panel.exe" -ArgumentList '--silent' -WorkingDirectory "$root\src-tauri\target\debug"
  Start-Sleep -Seconds 8
  $p = Get-Process shared-lib-panel -ErrorAction SilentlyContinue
  if ($p) { Write-Host "[build] ✓ 面板已启动 pid=$($p.Id)" -ForegroundColor Green } else { Write-Host '[build] ✗ 面板没起来' -ForegroundColor Red }
}
