// 共享项目库 · 悬浮球面板
#![windows_subsystem = "windows"]   // 无条件：debug 构建也不弹控制台

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, PhysicalPosition, WebviewWindow,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

/// 直接调 Windows API 改扩展样式：Tauri 的 set_skip_taskbar 在本场景会被窗口创建流程覆盖

/* ---------- 可配置项：别人 clone 下来改这里或设环境变量即可 ---------- */

/// 共享项目库根目录
fn memory_home() -> String {
    std::env::var("CODEX_MEMORY_HOME").unwrap_or_else(|_| r"D:\codex-memory".to_string())
}

/// 平台 PostgreSQL 连接串
fn pg_dsn() -> String {
    std::env::var("CODEX_MEMORY_PANEL_DSN").unwrap_or_else(|_| {
        "host=127.0.0.1 port=55440 user=codex_memory dbname=codex_memory".to_string()
    })
}

/// memoryd 地址
fn memoryd_url() -> String {
    std::env::var("CODEX_MEMORY_PANEL_DAEMON")
        .unwrap_or_else(|_| "http://127.0.0.1:47831".to_string())
}

/// 取 token 用的 Python（共享库的 venv）
fn python_path() -> String {
    std::env::var("CODEX_MEMORY_PANEL_PYTHON")
        .unwrap_or_else(|_| format!(r"{}\runtime\venv\Scripts\python.exe", memory_home()))
}

/// 日志文件（默认系统临时目录）
fn log_path() -> std::path::PathBuf {
    std::path::PathBuf::from(
        std::env::var("CODEX_MEMORY_PANEL_LOG")
            .unwrap_or_else(|_| format!(r"{}\shared-lib-panel.log", std::env::temp_dir().display())),
    )
}

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

    let py = python_path();
    let py = py.as_str();
    let code = "import sys; sys.path.insert(0, r'D:\\codex-memory\\repo\\src'); \
from codex_memory.config import Settings; from codex_memory.security import protect; \
print(protect((Settings.load().root / 'data/service-token.dpapi').read_bytes(), decrypt=True).decode())";

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
        let resp = ureq::post(&format!("{}/tool", memoryd_url()))
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
    let logpath = log_path();
    let say = move |m: String| {
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&logpath) {
            let _ = writeln!(f, "{}", m);
        }
    };

    std::thread::spawn(move || loop {
        let url = format!("{}/events?token={token}", memoryd_url());
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
fn pg_connect() -> Result<postgres::Client, String> {
    use std::time::Duration;
    let mut cfg: postgres::Config = pg_dsn().parse().map_err(|e| format!("DSN 解析失败: {e}"))?;
    cfg.connect_timeout(Duration::from_secs(5));
    cfg.connect(postgres::NoTls).map_err(|e| format!("PG连接失败: {e}"))
}

/// 写一行到 debug.log（Rust 侧排查用）
fn rlog(msg: &str) {
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true)
        .open(log_path()) {
        let _ = writeln!(f, "[rust] {msg}");
    }
}


#[tauri::command]
async fn qdata() -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut conn = pg_connect()?;
                let sql = r#"
            SELECT p.project_key, p.name, p.kind, p.control_state, p.tags::text AS tags,
                   COALESCE(p.root_path, '') AS root_path,
                   to_char(p.updated_at AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD"T"HH24:MI:SS') AS updated_at,
                   count(t.id)::int AS total,
                   count(*) FILTER (WHERE t.status = 'done')::int AS done,
                   count(*) FILTER (WHERE t.status = 'pending' AND t.owner_session_id IS NULL)::int AS ready,
                   count(*) FILTER (WHERE t.owner_session_id IS NOT NULL AND t.status <> 'done')::int AS doing,
                   count(*) FILTER (WHERE t.status IN ('failed','cancelled'))::int AS failed,
                   (SELECT count(*) FROM agent_code_nodes n WHERE n.project_id = p.id)::int AS map_nodes,
                   (SELECT count(*) FROM agent_code_edges e WHERE e.project_id = p.id)::int AS map_edges,
                   (SELECT count(*) FROM agent_artifacts a WHERE a.project_id = p.id)::int AS artifacts,
                   (SELECT count(*) FROM agent_sessions s WHERE s.project_id = p.id)::int AS sessions
            FROM agent_projects p
            LEFT JOIN agent_tasks t ON t.project_id = p.id
            GROUP BY p.id, p.project_key, p.name, p.kind, p.control_state, p.tags, p.root_path, p.updated_at
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
                "root_path": r.get::<_, String>("root_path"),
                "updated_at": r.get::<_, String>("updated_at"),
                "total": r.get::<_, i32>("total"),
                "done": r.get::<_, i32>("done"),
                "ready": r.get::<_, i32>("ready"),
                "doing": r.get::<_, i32>("doing"),
                "failed": r.get::<_, i32>("failed"),
                "map_nodes": r.get::<_, i32>("map_nodes"),
                "map_edges": r.get::<_, i32>("map_edges"),
                "artifacts": r.get::<_, i32>("artifacts"),
                "sessions": r.get::<_, i32>("sessions"),
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
                   COALESCE(t.next_action, '') AS next_action,
                   (SELECT count(*) FROM agent_task_dependencies d WHERE d.task_id = t.id)::int AS deps,
                   (SELECT string_agg(dp.task_key, ', ') FROM agent_task_dependencies d
                      JOIN agent_tasks dp ON dp.id = d.depends_on_task_id
                     WHERE d.task_id = t.id) AS dep_keys
            FROM agent_tasks t JOIN agent_projects p ON p.id = t.project_id
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
                "next_action": r.get::<_, String>("next_action"),
                "deps": r.get::<_, i32>("deps"),
                "dep_keys": r.get::<_, Option<String>>("dep_keys").unwrap_or_default(),
            })
        }).collect();
        serde_json::to_string(&out).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 给前端用的 SSE 地址（EventSource 不能带 header，所以 token 走 query）
#[tauri::command]
fn events_url() -> Result<String, String> {
    let token = shared_token()?;
    Ok(format!("{}/events?token={token}", memoryd_url()))
}

/// 调试日志（前端 -> 文件），正式版可删
#[tauri::command]
fn debug_log(msg: String) {
    use std::io::Write;
    let path = std::path::Path::new("D:\\codex\\shared-lib-panel\\debug.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
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
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--silent"]),
        ))
        .invoke_handler(tauri::generate_handler![qdata, qtasks, move_window, set_click_through, debug_log, call_shared_tool, events_url, start_event_stream])
        .setup(|app| {
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
