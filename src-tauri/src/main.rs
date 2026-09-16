// 共享项目库 · 悬浮球面板
#![windows_subsystem = "windows"]   // 无条件：debug 构建也不弹控制台

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, WebviewWindow,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

/// 直接调 Windows API 改扩展样式：Tauri 的 set_skip_taskbar 在本场景会被窗口创建流程覆盖



#[cfg(windows)]
mod winffi {
    use std::os::raw::{c_int, c_void};
    pub type Hwnd = *mut c_void;
    extern "system" {
        pub fn GetWindowLongW(hwnd: Hwnd, index: c_int) -> c_int;
        pub fn SetWindowLongW(hwnd: Hwnd, index: c_int, value: c_int) -> c_int;
        pub fn SetWindowPos(hwnd: Hwnd, after: Hwnd, x: c_int, y: c_int,
                            cx: c_int, cy: c_int, flags: u32) -> c_int;
    }
    pub const GWL_EXSTYLE: c_int = -20;
    pub const WS_EX_APPWINDOW: c_int = 0x0004_0000;
    pub const WS_EX_TOOLWINDOW: c_int = 0x0000_0080;
    pub const SWP_NOMOVE: u32 = 0x0002;
    pub const SWP_NOSIZE: u32 = 0x0001;
    pub const SWP_NOZORDER: u32 = 0x0004;
    pub const SWP_FRAMECHANGED: u32 = 0x0020;
}

/// 把它变成"工具窗口"：任务栏和 Alt+Tab 都不显示
#[cfg(windows)]
fn force_tool_window(hwnd: isize) {
    unsafe {
        let h = hwnd as winffi::Hwnd;
        let ex = winffi::GetWindowLongW(h, winffi::GWL_EXSTYLE);
        let new_ex = (ex | winffi::WS_EX_TOOLWINDOW) & !winffi::WS_EX_APPWINDOW;
        if new_ex != ex {
            winffi::SetWindowLongW(h, winffi::GWL_EXSTYLE, new_ex);
        }
        // 改完 EX 样式必须刷新一下才生效（任务栏图标重算）
        winffi::SetWindowPos(
            h,
            std::ptr::null_mut(),
            0, 0, 0, 0,
            winffi::SWP_NOMOVE | winffi::SWP_NOSIZE | winffi::SWP_NOZORDER | winffi::SWP_FRAMECHANGED,
        );
    }
}
#[cfg(not(windows))]
fn force_tool_window(_hwnd: isize) {}

/// 拖动球时移动整个窗口（球在窗口里是固定的，所以移窗口就是移球）
#[tauri::command]
fn move_window(window: WebviewWindow, x: i32, y: i32) {
    let _ = window.set_position(PhysicalPosition::new(x, y));
}


/// 共享库 token：只向 Python 要一次（它用 DPAPI 解密），之后缓存在内存里
static TOKEN_CACHE: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

fn shared_token() -> Result<String, String> {
    if let Ok(guard) = TOKEN_CACHE.lock() {
        if let Some(t) = guard.as_ref() {
            return Ok(t.clone());
        }
    }
    use std::process::Command;
    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    /* ⚠ 2026-09-17 改：这两个路径原来**写死在代码里**，是取服务 token 用的。
       别人（用户说有数万人会用）装到别处时，这两个路径都不存在 →
       取 token 失败 → **面板能连库，但共享工具全用不了**，而且报错只说"token 失败"，
       看不出是路径问题。改成环境变量可覆盖 + 报错里带上实际找的路径。

       优先级：
         PANEL_PYTHON      python.exe 的完整路径
         PANEL_REPO_SRC    codex-memory 的 src 目录（含 codex_memory 包的那个）
       默认值保持兼容（开发机的标准安装）。 */
    let home = std::env::var("CODEX_MEMORY_HOME").unwrap_or_else(|_| r"D:\codex-memory".to_string());
    let py = std::env::var("PANEL_PYTHON").ok().filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| format!(r"{home}\runtime\venv\Scripts\python.exe"));
    let repo_src = std::env::var("PANEL_REPO_SRC").ok().filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| format!(r"{home}\repo\src"));
    if !std::path::Path::new(&py).exists() {
        return Err(format!(
            "找不到 Python：{py}\n\
             这是面板读服务 token 用的解释器。请设环境变量 PANEL_PYTHON 指向你的 \
             venv\\Scripts\\python.exe（或设 CODEX_MEMORY_HOME 指向库的根目录）。"
        ));
    }
    let code = format!(
        "import sys; sys.path.insert(0, r'{repo_src}'); \
         from codex_memory.config import Settings; from codex_memory.security import protect; \
         print(protect((Settings.load().root / 'data/service-token.dpapi').read_bytes(), decrypt=True).decode())"
    );

    let mut cmd = Command::new(py);
    cmd.arg("-c").arg(code);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    let out = cmd.output().map_err(|e| format!("取 token 失败: {e}"))?;
    let token = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if token.is_empty() {
        return Err(format!(
            "token 为空；stderr: {}",
            String::from_utf8_lossy(&out.stderr).chars().take(200).collect::<String>()
        ));
    }
    if let Ok(mut guard) = TOKEN_CACHE.lock() {
        *guard = Some(token.clone());
    }
    Ok(token)
}

/// 调共享库：Rust 直连 memoryd（token 缓存 + HTTP），不再每次起 Python
#[tauri::command]
fn call_shared_tool(name: String, args: serde_json::Value) -> Result<String, String> {
        let token = shared_token()?;
        let body = serde_json::json!({ "name": name, "arguments": args });
        let resp = ureq::post("http://127.0.0.1:47831/tool")
            .set("Authorization", &format!("Bearer {token}"))
            .timeout(std::time::Duration::from_secs(120))
            .send_json(body)
            .map_err(|e| format!("请求 memoryd 失败: {e}"))?;
        let text = resp.into_string().map_err(|e| format!("读响应失败: {e}"))?;
    // 原样把 JSON 字符串回给前端（返回 Value 会让 IPC 卡住）
    serde_json::from_str::<serde_json::Value>(&text)
        .map_err(|e| format!("解析失败: {e} | 前 160 字: {}", text.chars().take(160).collect::<String>()))?;
    Ok(text)
}



/// 后台常驻：Rust 侧订阅 memoryd 的 SSE，再 emit 给前端
/// （前端直连会被跨域拦，而且 token 不用出 Rust）
#[tauri::command]
async fn start_event_stream(app: tauri::AppHandle) -> Result<(), String> {
    use std::io::BufRead;
    use tauri::Emitter;

    let token = shared_token()?;
    /* 日志跟着 exe 走（见 log_path() 的说明）—— 原来写死 D:\codex\shared-lib-panel\debug.log，
       而用 tauri dev / build.ps1 跑时 exe 在 target\debug\ 下，日志却写到源码目录，
       排查时看的根本不是同一份文件。 */
    let logpath = log_path();
    let say = move |m: String| {
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&logpath) {
            let _ = writeln!(f, "{}", m);
        }
    };

    std::thread::spawn(move || loop {
        let url = format!("http://127.0.0.1:47831/events?token={token}");
        say("SSE(后台): 正在连接 memoryd...".to_string());
        match ureq::get(&url).timeout(std::time::Duration::from_secs(86400)).call() {
            Ok(resp) => {
                say(format!("SSE(后台): 已连上，状态 {}", resp.status()));
                let reader = std::io::BufReader::new(resp.into_reader());
                for line in reader.lines() {
                    match line {
                        Ok(l) => {
                            if let Some(data) = l.strip_prefix("data: ") {
                                say(format!("SSE(后台): 收到 -> {}", data.trim()));
                                let _ = app.emit("cx-change", data.trim().to_string());
                            }
                        }
                        Err(e) => { say(format!("SSE(后台): 读流中断 {e}")); break }
                    }
                }
            }
            Err(e) => say(format!("SSE(后台): 连接失败 {e}")),
        }
        std::thread::sleep(std::time::Duration::from_secs(3));
    });
    Ok(())
}


/* ==================================================================
   直连 PostgreSQL 只读查询：拿到"真实状态"和知识图谱
   （memoryd 的 project_list 只给三个计数，状态是猜的；这里读真值）
   ================================================================== */


/// 带超时的 PG 连接（默认连接串没超时，会永久挂住）
///
/// ⚠ 2026-09-17 改：原来 host/port/user/dbname **全写死**（127.0.0.1:55440）。
/// 那是开发机的默认安装 —— 但别人（尤其是改过端口、或库不在这台机器上的人）
/// 打开面板只会看到一片空，**而且不会知道是连不上**。
/// 现在支持环境变量覆盖，默认值保持兼容：
///   PANEL_PG_HOST / PANEL_PG_PORT / PANEL_PG_USER / PANEL_PG_DB / PANEL_PG_PASSWORD
/// 也可以一步到位给整串：PANEL_PG_DSN="host=… port=… user=… dbname=…"
fn pg_connect() -> Result<postgres::Client, String> {
    use std::time::Duration;
    let mut cfg = postgres::Config::new();
    /* 整串优先：给了 DSN 就用它，其余变量忽略 */
    if let Ok(dsn) = std::env::var("PANEL_PG_DSN") {
        let dsn = dsn.trim().to_string();
        if !dsn.is_empty() {
            cfg = dsn.parse::<postgres::Config>()
                .map_err(|e| format!("PANEL_PG_DSN 解析失败: {e}"))?;
            cfg.connect_timeout(Duration::from_secs(5));
            return cfg.connect(postgres::NoTls)
                .map_err(|e| format!("PG连接失败（用 PANEL_PG_DSN）: {e}"));
        }
    }
    let env_or = |k: &str, d: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty()).unwrap_or_else(|| d.to_string());
    let host = env_or("PANEL_PG_HOST", "127.0.0.1");
    let port: u16 = env_or("PANEL_PG_PORT", "55440").parse()
        .map_err(|_| "PANEL_PG_PORT 不是合法端口号".to_string())?;
    let user = env_or("PANEL_PG_USER", "codex_memory");
    let db = env_or("PANEL_PG_DB", "codex_memory");
    cfg.host(&host).port(port).user(&user).dbname(&db);
    if let Some(pw) = std::env::var("PANEL_PG_PASSWORD").ok().filter(|v| !v.is_empty()) {
        cfg.password(&pw);
    }
    cfg.connect_timeout(Duration::from_secs(5));
    cfg.connect(postgres::NoTls).map_err(|e| {
        /* 报错里带上实际用的地址 —— 否则用户只知道"失败了"，不知道它在连哪儿 */
        format!("PG连接失败（{user}@{host}:{port}/{db}）: {e}")
    })
}

/* ==================================================================
   看门狗：数据库/服务掉了就自动拉回来
   ==================================================================

   为什么要有它（2026-09-15 用户报的现场）：
     startup.log 里 **22:58 到 23:15 完全没有记录** —— 那 17 分钟里
     PostgreSQL 和 memoryd 都掉了，而**没有任何东西去救**。
     登录触发的那条自启任务早在登录时就跑完了，之后不再看第二眼；
     面板自己的 `app.autolaunch()` 只负责"开机时把面板拉起来"，
     也不管别的进程死活。
     结果：面板一直显示"PG连接失败"，直到有人手动跑一遍启动脚本。

   为什么放在面板里（而不是再写一个守护进程）：
     · 面板**本来就是开机自启的**、而且**一直在桌面上跑** —— 天然的常驻观察点
     · 它**已经知道**数据库通不通（每次 loadProjects 都在连）
     · 用户看面板发现"连不上"的那一刻，正好就是最该触发自愈的时刻

   行为（保守，宁可不修也不乱修）：
     · 每 60 秒探一次数据库（真跑一条 SELECT 1，不是只看端口在听）
     · **连续 3 次**失败才动手 —— 单次失败可能是瞬时抖动，
       直接重启会把一个健康但忙的实例打断（这个脚本自己的注释里就警告过这件事）
     · 动手时跑官方的 start-memoryd-silent.ps1（它自己会做端口检测 + HTTP 验证）
     · 修完有 **5 分钟冷却**，避免"起不来就反复起"把机器拖死
     · 全程写 debug.log，用户能在日志里看到它做过什么
*/
fn pg_ping() -> bool {
    match pg_connect() {
        Ok(mut c) => c.simple_query("SELECT 1").is_ok(),
        Err(_) => false,
    }
}

/// 看门狗的参数。默认值保守（宁可晚一点修，也别把健康的实例打断）。
///
/// 支持用环境变量加速，**只为验证用** —— 否则要等 4 分钟才能在端到端里测到它：
///   PANEL_WATCHDOG_CHECK_SECS  · PANEL_WATCHDOG_FAILS · PANEL_WATCHDOG_COOLDOWN_SECS
/// 手工验证办法（我实际用它验过）：
///   设 PANEL_WATCHDOG_CHECK_SECS=5 PANEL_WATCHDOG_FAILS=1 起面板 → 停掉 PostgreSQL
///   → 看 debug.log 里 watchdog 有没有把它拉回来。
fn wd_check_secs() -> u64 {
    std::env::var("PANEL_WATCHDOG_CHECK_SECS").ok().and_then(|v| v.parse().ok()).unwrap_or(60)
}
fn wd_fails_to_act() -> u32 {
    std::env::var("PANEL_WATCHDOG_FAILS").ok().and_then(|v| v.parse().ok()).unwrap_or(3)
}
fn wd_cooldown_secs() -> u64 {
    std::env::var("PANEL_WATCHDOG_COOLDOWN_SECS").ok().and_then(|v| v.parse().ok()).unwrap_or(300)
}

fn spawn_watchdog() {
    use std::process::Command;
    use std::time::Duration;

    let script = r"D:\codex-memory\repo\scripts\start-memoryd-silent.ps1";
    std::thread::spawn(move || {
        // 参数见 wd_* 函数（默认：每 60 秒探一次 · 连续 3 次失败才动手 · 修完冷却 5 分钟）
        let check_every = wd_check_secs();
        let fails_to_act = wd_fails_to_act();
        let cooldown = Duration::from_secs(wd_cooldown_secs());

        let mut fails = 0u32;
        let mut last_repair: Option<std::time::Instant> = None;
        rlog(&format!(
            "watchdog: started (every {check_every}s, act after {fails_to_act} failures)"
        ));

        loop {
            std::thread::sleep(Duration::from_secs(check_every));
            if pg_ping() {
                if fails > 0 {
                    rlog(&format!("watchdog: database is back (was failing {fails}x)"));
                }
                fails = 0;
                continue;
            }

            fails += 1;
            rlog(&format!("watchdog: database unreachable ({fails}/{fails_to_act})"));

            if fails < fails_to_act {
                continue;
            }
            // 冷却期：刚修过就不重复修
            if let Some(t) = last_repair {
                if t.elapsed() < cooldown {
                    rlog("watchdog: skipping repair (cooldown)");
                    continue;
                }
            }
            if !std::path::Path::new(script).exists() {
                rlog(&format!("watchdog: cannot repair, script missing: {script}"));
                continue;
            }

            rlog("watchdog: repairing — running start-memoryd-silent.ps1");
            // 隐藏窗口跑（powershell 是控制台程序，直接起会闪黑框）
            #[cfg(windows)]
            let spawned = {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                Command::new("powershell")
                    /* ⚠ 必须带 -EnsureRunning（只起不停）。
                       第一版没带 —— 看门狗在"端口被占但查询失败"时会走脚本的
                       破坏性分支：**把它停掉再起**。而用户发现这台机器上
                       不止一方在动同一个数据目录（另一个会话也在搞这套库），
                       两边互相打断 → 最后 55440 上一个 postmaster 都没有，
                       服务持续宕机约 20 分钟。
                       -EnsureRunning 的语义：只把"没有的"补上，永不"把有的拆掉"。 */
                    .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-EnsureRunning"])
                    .creation_flags(CREATE_NO_WINDOW)
                    .spawn()
            };
            #[cfg(not(windows))]
            let spawned = Command::new("pwsh")
                .args(["-NoProfile", "-File", script])
                .spawn();

            match spawned {
                Ok(_) => rlog("watchdog: repair launched (it verifies by HTTP itself)"),
                Err(e) => rlog(&format!("watchdog: could not launch repair: {e}")),
            }
            last_repair = Some(std::time::Instant::now());
            // 给它足够时间跑完（脚本自己的等待窗口是 120s/180s）
            std::thread::sleep(Duration::from_secs(90));
            fails = 0;
        }
    });
}

/// debug.log 的路径 —— **跟着 exe 走，不写死**。
///
/// 为什么（2026-09-15 改，这是用户最初报的那个 bug 的根因）：
/// 原来三处日志全写死 `D:\codex\shared-lib-panel\debug.log`。
/// 但用 `npm run tauri dev` 跑的是 `src-tauri\target\debug\shared-lib-panel.exe`，
/// 用 build.ps1 跑的是同一个 target 下的 exe —— 而**日志却写到源码目录**。
/// 结果：用户看到的现象是「UI 改了没生效 / 日志对不上」，
/// 排查方向全被带偏（我今天也在这上面绕过一圈）。
///
/// 现在：日志固定在 **exe 所在目录**旁边。
///  - 部署形态：exe 在 target\debug\，日志就在那儿
///  - 打包分发：跟着安装目录走，不会去写用户的 D 盘源码目录
///  - 开源用户：不需要有 `D:\codex\shared-lib-panel` 这个目录才能记日志
pub fn log_path() -> std::path::PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("debug.log")))
        .unwrap_or_else(|| std::path::PathBuf::from("debug.log"))
}

/// 写一行到 debug.log（Rust 侧排查用）
fn rlog(msg: &str) {
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path())
    {
        let _ = writeln!(f, "[rust] {msg}");
    }
}


#[tauri::command]
async fn qdata() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut conn = pg_connect()?;
                let sql = r#"
            /* 五桶口径必须和前端的状态映射**完全一致**，否则面板的"深度核对"每次都报对不上
               （2026-09-15 用户截图里那 3 处不一致就是这么来的：后端 doing 还说"有主就算在做"，
               而前端徽章已经改用"占用者心跳还新"）。

               结构上有个坑：不能在项目表那个 GROUP BY 里直接加 os.last_heartbeat ——
               一个项目的多个任务 owner 不同、心跳时间就不同，会被拆成多行
               （实测 kstage 出现 3 次、longan-farm 6 次）。所以先用 CTE 按 project_id
               聚合（严格一对一），再 JOIN 项目表。 */
            WITH bucket AS (
                SELECT t.project_id,
                       count(*)::int AS total,
                       count(*) FILTER (WHERE t.status = 'done')::int AS done,
                       /* 在做 = 标了 running 的，或有主且占用者心跳还新（2 小时内）的。
                          有主≠在做：陈旧的认领（占用者早没了）不该算。

                          ★ 2026-09-16 修：**补上 status='blocked' 这一支**。
                          原来只覆盖 running 和 pending，于是
                          「blocked 且占用者心跳还新」的任务**掉进缝里**：
                            · doing 不要它（status 不是 running / pending）
                            · stuck 也不要它（下面那句排除了"有活认领的"）
                          → 六桶相加比 total 少 1。实测 kstage：
                            total=16，而 done+doing+review+ready+held+stuck = 15，
                            用户截图报「六桶相加 15 ≠ 任务总数 16」。
                          这正是下面 ready 那句注释警告过的病（"凭空消失"）——
                          当时修了 pending 那一支，**漏了 blocked 这一支**。
                          语义上也对：会话正自称 working、心跳还新，它就是在做，
                          只是它自己把任务标成了 blocked（卡住了但还在弄）。 */
                       count(*) FILTER (WHERE t.status = 'running'
                                          OR (t.status IN ('pending','blocked') AND os.id IS NOT NULL
                                              AND os.last_heartbeat IS NOT NULL
                                              AND os.last_heartbeat > now() - interval '2 hours'))::int AS doing,
                       /* ---- liveness / progress 双租约（2026-09-15 加）----
                          为什么拆开：原来只有一个 lease + 一个 last_heartbeat，两件事挤在一起，
                          "心跳新但没产出"和"心跳旧但有产出"分不开 ——
                          面板判「在不在干」为此改过 5 轮都不准。
                          出处（hermes-agent 的修复提交标题原文）：
                              fix(kanban): separate worker progress from liveness
                          分工：liveness_until 由心跳续；progress_at 由检查点/产出更新。
                          ⚠ 老行这两个字段为 NULL，所以判据里 COALESCE 兜底到旧语义
                          （旧语义 = lease_until / updated_at）。 */
                       count(*) FILTER (WHERE t.status <> 'done'
                                          AND COALESCE(t.liveness_until, t.lease_until) > now())::int AS live_tasks,
                       /* 占着但没推进 = 磨洋工 / 卡住。这是双租约最有价值的一格：
                          原来它和「在推进」混在同一个字段里，谁都看不出来。 */
                       count(*) FILTER (WHERE t.status <> 'done'
                                          AND COALESCE(t.liveness_until, t.lease_until) > now()
                                          AND COALESCE(t.progress_at, t.updated_at)
                                              <= now() - interval '1 hour')::int AS stalled_tasks,
                       /* 逾期：会话声明过 ETA，现在过了 —— 该问一句了（不是「催」，是「问」）。
                          出处 HYTHE/ACP：「固定轮询要么太吵要么太瞎」，
                          所以让会话自己报 ETA，面板在 ETA 之前不打扰。 */
                       count(*) FILTER (WHERE t.status <> 'done'
                                          AND t.eta_until IS NOT NULL
                                          AND t.eta_until < now())::int AS overdue_eta,
                       count(*) FILTER (WHERE t.status = 'review')::int AS review,
                       /* 没闲着 = blocked/failed/cancelled 且**没有活的认领**的
                          （有活认领的已经被上面算进"在做"了，不能再算一次 —— 会重复计数） */
                       count(*) FILTER (WHERE t.status IN ('blocked','failed','cancelled')
                                          AND (os.id IS NULL
                                               OR os.last_heartbeat IS NULL
                                               OR os.last_heartbeat <= now() - interval '2 hours'))::int AS stuck,
                       /* 待开始 = 其余 pending。不能写成 owner IS NULL ——
                          那会让"有陈旧占位的 pending 任务"既不算在做也不算待开始，
                          凭空消失（实测农业局因此少算一个任务）。 */
                       /* 待开始 = pending、没有未完成前置、也没有活认领。
                          「未完成前置」必须算进来 —— 前端的状态映射里
                          (unmet_deps > 0 → 被卡住)，后端不算就会和前端对不上
                          （2026-09-15 实测 rebuild-ui-assets-294 差 1 个）。 */
                       count(*) FILTER (WHERE t.status = 'pending'
                                          AND unmet.n = 0
                                          AND NOT (os.id IS NOT NULL
                                                   AND os.last_heartbeat IS NOT NULL
                                                   AND os.last_heartbeat > now() - interval '2 hours'))::int AS ready,
                       /* 等前置 = pending 但有未完成的前置（前端显示成「被卡住」） */
                       count(*) FILTER (WHERE t.status = 'pending'
                                          AND unmet.n > 0
                                          AND NOT (os.id IS NOT NULL
                                                   AND os.last_heartbeat IS NOT NULL
                                                   AND os.last_heartbeat > now() - interval '2 hours'))::int AS held
                FROM agent_tasks t
                LEFT JOIN agent_sessions os ON os.id = t.owner_session_id
                /* 每个任务的未完成前置数。用子查询而不是再 JOIN 一次依赖表，
                   避免依赖表把行数放大（一个任务多个前置会产生多行）。 */
                LEFT JOIN LATERAL (
                    SELECT count(*)::int AS n
                    FROM agent_task_dependencies d
                    JOIN agent_tasks dp ON dp.id = d.depends_on_task_id
                    WHERE d.task_id = t.id AND dp.status <> 'done'
                ) unmet ON TRUE
                GROUP BY t.project_id
            )
            SELECT p.project_key, p.name, p.kind, p.control_state, p.tags::text AS tags,
                   COALESCE(p.scope, '') AS scope,
                   COALESCE(p.root_path, '') AS root_path,
                   to_char(p.updated_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD"T"HH24:MI:SS') AS updated_at,
                   COALESCE(b.total, 0) AS total,
                   COALESCE(b.done, 0) AS done,
                   COALESCE(b.ready, 0) AS ready,
                   COALESCE(b.doing, 0) AS doing,
                   COALESCE(b.live_tasks, 0) AS live_tasks,
                   COALESCE(b.stalled_tasks, 0) AS stalled_tasks,
                   COALESCE(b.overdue_eta, 0) AS overdue_eta,
                   COALESCE(b.review, 0) AS review,
                   COALESCE(b.stuck, 0) AS failed,
                   COALESCE(b.held, 0) AS held,
                   (SELECT count(*) FROM agent_code_nodes n WHERE n.project_id = p.id)::int AS map_nodes,
                   (SELECT count(*) FROM agent_code_edges e WHERE e.project_id = p.id)::int AS map_edges,
                   (SELECT count(*) FROM agent_artifacts a WHERE a.project_id = p.id)::int AS artifacts,
                   /* 该项目里「还活着的认领」数量：任务有主、且占用者的心跳还新。
                      平台自己是用租约/心跳判断认领是否有效的，面板得跟着用。 */
                   (SELECT count(*) FROM agent_tasks t2
                      JOIN agent_sessions s2 ON s2.id = t2.owner_session_id
                     WHERE t2.project_id = p.id AND t2.status <> 'done'
                       AND s2.last_heartbeat IS NOT NULL
                       AND s2.last_heartbeat > now() - interval '2 hours')::int AS live_claims,
                   /* 有主但占用者早就不动了的（面板显示"被 X 占着，N 小时没动"，不当作在做） */
                   (SELECT count(*) FROM agent_tasks t3
                      LEFT JOIN agent_sessions s3 ON s3.id = t3.owner_session_id
                     WHERE t3.project_id = p.id AND t3.status <> 'done'
                       AND t3.owner_session_id IS NOT NULL
                       AND (s3.last_heartbeat IS NULL
                            OR s3.last_heartbeat <= now() - interval '2 hours'))::int AS stale_claims,
                   /* 最新一次心跳距今多少分钟 */
                   COALESCE((SELECT floor(extract(epoch FROM (now() - max(s4.last_heartbeat))) / 60)::int
                               FROM agent_sessions s4 WHERE s4.project_id = p.id
                              AND s4.last_heartbeat IS NOT NULL), -1) AS last_beat_min,
                   /* 项目级活动新鲜度：任务更新 / 检查点 / 产出 / 会话心跳里最新的那个。
                      为什么要它：任务状态看不出"有人刚接手但还没领任务"——
                      kstage 就出现过（会话 62 分钟前刚登记、61 分钟前写了检查点，
                      但所有任务都是 done/pending，面板会误判成"待开始"）。
                      注意：不要用 '-infinity'::timestamptz 兜底 —— 它没法和 int 互转
                      （Postgres 报 "cannot convert infinity to integer"）；max() 自己会忽略 NULL。 */
                   COALESCE(
                     floor(extract(epoch FROM (now() - GREATEST(
                       (SELECT max(t9.updated_at)      FROM agent_tasks       t9 WHERE t9.project_id = p.id),
                       (SELECT max(c9.created_at)      FROM agent_checkpoints c9 WHERE c9.project_id = p.id),
                       (SELECT max(a9.created_at)      FROM agent_artifacts   a9 WHERE a9.project_id = p.id)
                     ))) / 60)::int,
                     -1
                   ) AS last_activity_min,
                   /* 只看「有人真的干了活」的证据：检查点或产出。
                      为什么把 agent_events 和 last_heartbeat 排除在外（2026-09-15 踩到）：
                      ① 事件里混着系统噪声（清理陈旧认领、自动同步、基线抓取、地图更新）——
                         我清理一个陈旧占位时写的那条 task_lease_expired，当场让
                         rural-1-39 显示成"进行中"，用户立刻发现了；
                      ② 心跳目前不是可靠信号：库里心跳类事件总数是 0，
                         last_heartbeat 只在登记会话时写一次，之后不再更新。
                      所以"在不在干活"只认这两个：会话主动记的检查点、会话发布的产出。 */
                   COALESCE(
                     floor(extract(epoch FROM (now() - GREATEST(
                       (SELECT max(c8.created_at) FROM agent_checkpoints c8 WHERE c8.project_id = p.id),
                       (SELECT max(a8.created_at) FROM agent_artifacts   a8 WHERE a8.project_id = p.id)
                     ))) / 60)::int,
                     -1
                   ) AS last_work_min,
                   /* 心跳还新的会话数（"有人在干"最直接的证据） */
                   (SELECT count(*) FROM agent_sessions s5
                     WHERE s5.project_id = p.id AND s5.last_heartbeat IS NOT NULL
                       AND s5.last_heartbeat > now() - interval '2 hours')::int AS live_sessions,
                   /* ---- 「现在真有人在这个项目上干活吗」（2026-09-15 加）----
                      为什么需要：用户在 kstage 上发现的 bug ——
                        那个会话 22:23~22:25 确实在干（发了 4 个产出 + 2 个检查点），**然后停了**
                        （status=idle、心跳停在 22:22、当前任务=None）。
                        但面板只看到「45 分钟前有产出」→ 一路显示「进行中」，
                        点进去却没有任何进行中的任务。
                      `live_sessions` 的 2 小时窗口对此太宽（2 小时前心跳过也算"在干"），
                      所以另给两个**看当下**的信号：
                        · working_sessions —— 正自称 working 的会话数（最硬）
                        · last_beat_min    —— 最新一次心跳距今多少分钟
                      前端据此判「进行中」：不能只凭「最近写过东西」，
                      还得看**现在有没有人在**。 */
                   (SELECT count(*) FROM agent_sessions s6
                     WHERE s6.project_id = p.id AND s6.status = 'working')::int AS working_sessions,
                   /* 最新一次心跳距今多少分钟（没有任何心跳时 -1） */
                   COALESCE((SELECT floor(extract(epoch FROM (now() - max(s7.last_heartbeat))) / 60)::int
                             FROM agent_sessions s7
                             WHERE s7.project_id = p.id AND s7.last_heartbeat IS NOT NULL), -1) AS last_beat_min,
                   (SELECT count(*) FROM agent_sessions s WHERE s.project_id = p.id)::int AS sessions,
                   /* 检查点数：唯一记录"过程"的量 —— 一个任务里干了几轮、踩了哪些坑 */
                   (SELECT count(*) FROM agent_checkpoints ck WHERE ck.project_id = p.id)::int AS checkpoints,
                   (SELECT count(*) FROM agent_task_contracts tc WHERE tc.project_id = p.id)::int AS contracts,
                   /* 最新任务时间（无任务时给空串）。前端指纹要比它。 */
                   COALESCE(to_char((SELECT max(t8.updated_at) FROM agent_tasks t8 WHERE t8.project_id = p.id)
                                    AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD"T"HH24:MI:SS'), '') AS task_updated_at
            FROM agent_projects p
            LEFT JOIN bucket b ON b.project_id = p.id
            WHERE p.control_state <> 'archived'
            ORDER BY p.control_state, p.project_key
        "#;
        let rows = conn.query(sql, &[]).map_err(|e| { rlog(&format!("查询失败: {e}")); format!("查询失败: {e}") })?;
        
        let out: Vec<serde_json::Value> = rows.iter().map(|r| {
            serde_json::json!({
                "project_key": r.get::<_, String>("project_key"),
                "name": r.get::<_, String>("name"),
                "kind": r.get::<_, String>("kind"),
                "control_state": r.get::<_, String>("control_state"),
                "tags": r.get::<_, String>("tags"),
                "scope": r.get::<_, String>("scope"),
                "root_path": r.get::<_, String>("root_path"),
                "updated_at": r.get::<_, String>("updated_at"),
                "total": r.get::<_, i32>("total"),
                "done": r.get::<_, i32>("done"),
                "ready": r.get::<_, i32>("ready"),
                "doing": r.get::<_, i32>("doing"),
                "review": r.get::<_, i32>("review"),
                "failed": r.get::<_, i32>("failed"),
                "held": r.get::<_, i32>("held"),
                "map_nodes": r.get::<_, i32>("map_nodes"),
                "map_edges": r.get::<_, i32>("map_edges"),
                "artifacts": r.get::<_, i32>("artifacts"),
                "sessions": r.get::<_, i32>("sessions"),
                "last_activity_min": r.get::<_, i32>("last_activity_min"),
                "last_work_min": r.get::<_, i32>("last_work_min"),
                "live_sessions": r.get::<_, i32>("live_sessions"),
                /* 「现在有没有人在」的两个信号（2026-09-15 加，修 kstage 那个误报"进行中"） */
                "working_sessions": r.get::<_, i32>("working_sessions"),
                "last_beat_min": r.get::<_, i32>("last_beat_min"),
                "live_claims": r.get::<_, i32>("live_claims"),
                "live_tasks": r.get::<_, i32>("live_tasks"),
                "stalled_tasks": r.get::<_, i32>("stalled_tasks"),
                "overdue_eta": r.get::<_, i32>("overdue_eta"),
                "stale_claims": r.get::<_, i32>("stale_claims"),
                "last_beat_min": r.get::<_, i32>("last_beat_min"),
                "checkpoints": r.get::<_, i32>("checkpoints"),
                "contracts": r.get::<_, i32>("contracts"),
                /* 该项目下最新的任务更新时间。给前端的指纹比对用：
                   只含计数的话，改了任务说明/状态（而计数没变）面板会判定"没变化"而不重绘。 */
                "task_updated_at": r.get::<_, String>("task_updated_at"),
            })
        }).collect();

        serde_json::to_string(&out).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 某个项目的任务明细（点开时才查）
#[tauri::command]
async fn qtasks(project_key: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut conn = pg_connect()?;
        let sql = r#"
            SELECT t.task_key, t.title, t.status, t.priority,
                   COALESCE(t.owner_session_id, '') AS owner,
                   COALESCE(t.description, '') AS description,
                   COALESCE(t.next_action, '') AS next_action,
                   /* 占用者的认领还算不算数 —— 面板据此不把"23 小时前的占位"当成"在做"。
                      ⚠ 口径必须和 qdata 的 live_claims 完全一致（心跳在 2 小时内），
                      否则项目徽章说"待开始"、任务卡却说"进行中"，自相矛盾。
                      第一版只判断了"有没有心跳记录"（IS NOT NULL），把 1388 分钟前的
                      占位也判成"活"，等于没修 —— 2026-09-15 自己踩到并改正。 */
                   (os.last_heartbeat IS NOT NULL
                    AND os.last_heartbeat > now() - interval '2 hours') AS owner_alive,
                   COALESCE(floor(extract(epoch FROM (now() - os.last_heartbeat)) / 60)::int, -1) AS owner_beat_min,
                   (SELECT count(*) FROM agent_task_dependencies d WHERE d.task_id = t.id)::int AS deps,
                   /* 未完成的前置数：只有它才代表"真的被卡住"。
                      原来的 deps（总前置数）会让"前置全做完"的任务永远显示成等待中
                      ——2026-09-15 对账时发现的。 */
                   (SELECT count(*) FROM agent_task_dependencies d
                      JOIN agent_tasks dp ON dp.id = d.depends_on_task_id
                     WHERE d.task_id = t.id AND dp.status <> 'done')::int AS unmet_deps,
                   (SELECT string_agg(dp.task_key, ', ') FROM agent_task_dependencies d
                      JOIN agent_tasks dp ON dp.id = d.depends_on_task_id
                     WHERE d.task_id = t.id) AS dep_keys,
                   cc.contract::text AS contract_text,
                   COALESCE(cc.created_by, '') AS contract_by
            FROM agent_tasks t JOIN agent_projects p ON p.id = t.project_id
            LEFT JOIN agent_task_contracts cc ON cc.task_id = t.id
            LEFT JOIN agent_sessions os ON os.id = t.owner_session_id
            WHERE p.project_key = $1
            ORDER BY CASE t.status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                     t.priority, t.task_key
        "#;
        let rows = conn.query(sql, &[&project_key]).map_err(|e| format!("查询失败: {e}"))?;
        let out: Vec<serde_json::Value> = rows.iter().map(|r| {
            serde_json::json!({
                "key": r.get::<_, String>("task_key"),
                "title": r.get::<_, String>("title"),
                "status": r.get::<_, String>("status"),
                "priority": r.get::<_, i32>("priority"),
                "owner": r.get::<_, String>("owner"),
                "description": r.get::<_, String>("description"),
                "next_action": r.get::<_, String>("next_action"),
                "owner_alive": r.get::<_, bool>("owner_alive"),
                "owner_beat_min": r.get::<_, i32>("owner_beat_min"),
                "deps": r.get::<_, i32>("deps"),
                "unmet_deps": r.get::<_, i32>("unmet_deps"),
                "dep_keys": r.get::<_, Option<String>>("dep_keys").unwrap_or_default(),
                /* 合同（活的目标与验收标准）：任务标题和说明是创建时写死的、改不了；
                   范围发生变化时靠合同表达 —— 平台只能改合同（走提案+审批）。
                   面板原来完全没查这张表，所以用户看不到"这件事现在到底要求什么"（2026-09-15 补）。 */
                "contract": r.get::<_, Option<String>>("contract_text").unwrap_or_default(),
                "contract_by": r.get::<_, String>("contract_by"),
            })
        }).collect();
        serde_json::to_string(&out).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 某个项目的检查点明细（每个任务**最新一条**）—— 导出进度报告用
///
/// 为什么需要它（2026-09-15 用户要"导出详细进度报告"）：
/// "做了什么 / 没做什么 / 准备做什么"这三样**不在任务表里**，
/// 而在检查点的 state 里（completed / not_done / next_action）。
/// 面板一直没读过检查点，所以导出要拉一次。
///
/// 只读 SELECT，不加锁、不写任何表 —— 和正在干活的会话不会冲突。
/// 注意：state 里那五个字段**类型不统一**（有时是数组、有时是整段字符串、有时是 null），
/// 所以这里原样把 jsonb 交给前端，由前端归一化（别在这里假装它是数组）。
#[tauri::command]
async fn qcheckpoints(project_key: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut conn = pg_connect()?;
        let sql = r#"
            SELECT t.task_key, c.state_text, c.at,
                   COALESCE(t.description, '') AS description,
                   COALESCE(t.next_action, '') AS next_action
            FROM agent_tasks t
            JOIN agent_projects p ON p.id = t.project_id
            LEFT JOIN LATERAL (
                SELECT state::text AS state_text,
                       /* timestamptz 要在 SQL 里转文本：Rust 侧按 String 取会报笼统的 db error
                          （qdata 里用 to_char 也是同一个原因）。 */
                       COALESCE(to_char(created_at, 'YYYY-MM-DD HH24:MI:SS'), '') AS at
                FROM agent_checkpoints
                WHERE task_id = t.id ORDER BY created_at DESC LIMIT 1
            ) c ON TRUE
            WHERE p.project_key = $1
            ORDER BY t.priority, t.task_key
        "#;
        let rows = conn.query(sql, &[&project_key]).map_err(|e| format!("查询失败: {e}"))?;
        let out: Vec<serde_json::Value> = rows.iter().map(|r| {
            let state: Option<String> = r.get("state_text");
            serde_json::json!({
                "task_key": r.get::<_, String>("task_key"),
                "description": r.get::<_, String>("description"),
                "next_action": r.get::<_, String>("next_action"),
                "state": state,
                /* 没有检查点的任务，at 是 NULL —— 必须按 Option 取，否则取 NULL 会报错 */
                "at": r.get::<_, Option<String>>("at").unwrap_or_default(),
            })
        }).collect();
        serde_json::to_string(&out).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 导出进度报告。
///
/// 分两步：先把 HTML 写到文件（前端生成好内容传进来），再用 **Edge 无头**把它打成 PDF。
/// 为什么用 Edge 而不是 Rust 里的 PDF 库：PDF 要内嵌 Chromium 级别的渲染引擎，
/// 几百 MB 的依赖为一个按钮不值得；而这台机器自带 Edge 153，`--print-to-pdf` 实测 5 秒出件。
/// （Word 那条路实测不行：Word COM 调用会卡死，所以不做 .docx。）
/// 返回 PDF 的绝对路径。
#[tauri::command]
/// 决定导出目录（**不写死在代码里**，2026-09-17 加）。
///
/// 为什么需要这个命令：原来前端直接写 `D:\codex-memory\vault\exports\<项目>` ——
/// 那是开发机的路径。别人装到别处/别的机器上，导出的 PDF 会落在一个
/// 他不认识也找不到的地方（虽然 export_pdf 会自动建目录，不会报错，但更难发现）。
///
/// 优先级：环境变量 PANEL_EXPORT_DIR > 用户文档目录\共享项目库-导出\<项目>
fn resolve_export_dir(proj_key: String) -> Result<String, String> {
    if let Ok(dir) = std::env::var("PANEL_EXPORT_DIR") {
        let dir = dir.trim();
        if !dir.is_empty() {
            return Ok(std::path::Path::new(dir).join(&proj_key).to_string_lossy().to_string());
        }
    }
    let home = std::env::var("USERPROFILE")
        .map_err(|_| "读不到 USERPROFILE，无法决定导出目录；可以设 PANEL_EXPORT_DIR".to_string())?;
    /* 用中文目录名：用户在"文档"里一眼能认出这是这个软件建的 */
    Ok(std::path::Path::new(&home)
        .join("Documents")
        .join("共享项目库-导出")
        .join(&proj_key)
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
async fn export_pdf(html: String, dir: String, filename: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use std::process::Command;
        let base = std::path::PathBuf::from(&dir);
        std::fs::create_dir_all(&base).map_err(|e| format!("建目录失败 {dir}: {e}"))?;
        let html_path = base.join(format!("{filename}.html"));
        std::fs::write(&html_path, html.as_bytes()).map_err(|e| format!("写 HTML 失败: {e}"))?;
        let pdf_path = base.join(format!("{filename}.pdf"));

        // 找 Edge（装的位置有两处常见路径），找不到再试 Chrome
        let candidates = [
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ];
        let exe = candidates.iter().find(|p| std::path::Path::new(p).exists())
            .ok_or_else(|| "没找到 Edge 或 Chrome，无法生成 PDF".to_string())?;

        let url = format!("file:///{}", html_path.to_string_lossy().replace('\\', "/"));
        let out = Command::new(exe)
            .args([
                "--headless=new",
                "--disable-gpu",
                "--no-pdf-header-footer",       // 不要页眉页脚（别把 file:// 路径印上去）
                "--print-to-pdf-no-header",
                &format!("--print-to-pdf={}", pdf_path.to_string_lossy()),
                &url,
            ])
            .output()
            .map_err(|e| format!("调 Edge 失败: {e}"))?;
        if !pdf_path.exists() {
            return Err(format!(
                "Edge 没生成 PDF。stdout={} stderr={}",
                String::from_utf8_lossy(&out.stdout).chars().take(300).collect::<String>(),
                String::from_utf8_lossy(&out.stderr).chars().take(300).collect::<String>(),
            ));
        }
        Ok(pdf_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 用系统默认程序打开一个文件（导出后自动打开 PDF 用）。
///
/// 为什么不走 tauri-plugin-opener 的 open_path：那个要配 opener 的 **scope**，
/// 而导出目录是 `D:\codex-memory\vault\exports\<项目key>\` —— 每个项目一个子目录，
/// 没法在 capabilities 里穷举。实测报 "Not allowed to open path ..."。
/// 自己写个命令最省事：Rust 侧调用进程不受前端权限体系约束。
#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("文件不存在: {path}"));
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        /* CREATE_NO_WINDOW：别弹黑框（这台机器上用户明确要求过不能出现黑框）。 */
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &path])
            .creation_flags(0x0800_0000)
            .spawn()
            .map_err(|e| format!("打开失败: {e}"))?;
        return Ok(());
    }
    #[cfg(not(target_os = "windows"))]
    {
        let opener = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
        std::process::Command::new(opener)
            .arg(&path)
            .spawn()
            .map_err(|e| format!("打开失败: {e}"))?;
        Ok(())
    }
}
/// 给前端用的 SSE 地址（EventSource 不能带 header，所以 token 走 query）
#[tauri::command]
fn events_url() -> Result<String, String> {
    let token = shared_token()?;
    Ok(format!("http://127.0.0.1:47831/events?token={token}"))
}

/// 调试日志（前端 -> 文件），正式版可删
#[tauri::command]
fn debug_log(msg: String) {
    use std::io::Write;
    /* 原来写死 D:\codex\shared-lib-panel\debug.log —— 改成跟着 exe 走，
       免得用 tauri dev 跑时日志落到源码目录、和实际运行的那份对不上。 */
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(log_path()) {
        let _ = writeln!(f, "{}", msg);
    }
}

/// 空白区域的鼠标穿透（球和面板之外，点击直接落到下面的桌面/窗口）
#[tauri::command]
fn set_click_through(window: WebviewWindow, ignore: bool) {
    let _ = window.set_ignore_cursor_events(ignore);
}

fn toggle_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        if w.is_visible().unwrap_or(true) {
            let _ = w.hide();
        } else {
            let _ = w.show();
        }
    }
}

fn main() {
    // panic 也要留痕（GUI 程序没有 stderr，出错会静默消失）
    std::panic::set_hook(Box::new(|info| {
        let msg = format!("PANIC: {info}");
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true)
            .open(log_path()) {
            let _ = writeln!(f, "[rust] {msg}");
        }
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--silent"]),
        ))
        .invoke_handler(tauri::generate_handler![qdata, qtasks, qcheckpoints, export_pdf, resolve_export_dir, open_file, move_window, set_click_through, debug_log, call_shared_tool, events_url, start_event_stream])
        .setup(|app| {
            /* 看门狗：数据库/服务掉了自动拉回来（见 spawn_watchdog 的说明）。
               放在这里是因为 setup 时窗口已经起来了、面板已经常驻 ——
               它就是这个机器上唯一"一直在看着"的东西。 */
            spawn_watchdog();
            // ---- 强制不进任务栏 ----
            // 窗口创建流程会把 skipTaskbar 重置回去，所以启动后再补设几次
            if let Some(w) = app.get_webview_window("main") {
                let w1 = w.clone();
                let w2 = w.clone();
                let _ = w.set_skip_taskbar(true);
                std::thread::spawn(move || {
                    for ms in [300u64, 700, 1200, 2000, 3000, 5000, 8000, 12000, 20000] {
                        std::thread::sleep(std::time::Duration::from_millis(ms));
                        let _ = w1.set_skip_taskbar(true);
                        if let Ok(h) = w1.hwnd() {
                            force_tool_window(h.0 as isize);
                        }
                    }
                });
                let _ = w2.set_always_on_top(true);
            }

            // ---- 系统托盘 ----
            let show = MenuItem::with_id(app, "show", "显示 / 隐藏小球", true, None::<&str>)?;
            let auto = MenuItem::with_id(app, "autostart", "开机自动启动", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &auto, &quit])?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("共享项目库")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => toggle_window(app),
                    "autostart" => {
                        let m = app.autolaunch();
                        let on = m.is_enabled().unwrap_or(false);
                        let _ = if on { m.disable() } else { m.enable() };
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(tray.app_handle());
                    }
                })
                .build(app)?;

            // ---- 首次启动：把自启打开（之后由托盘菜单控制）----
            let m = app.autolaunch();
            if !m.is_enabled().unwrap_or(false) {
                let _ = m.enable();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
