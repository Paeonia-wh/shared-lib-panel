# 开机自启机制（2026-09-15 定案）

本机 `D:\codex-memory` 平台（PostgreSQL 55440 + memoryd 47831）的开机自启修复与实现记录。
面板依赖它，所以归到本项目的交付里。

## 目标（用户明确要求）

**重启后用户什么都不用做，什么都不要看见 —— 只有小球自己跳出来。**
所以这一版有两个硬指标：①服务自动就绪；②**全程不出现任何黑框 / 终端窗口**。

## 现役机制（两条互相独立，都不依赖 VBScript）

| 层 | 位置 | 配置 |
|---|---|---|
| 主路径 | 计划任务 `CodexMemoryAutostart` | 触发=登录时 + 延迟 30s；动作=`<venv>\Scripts\pythonw.exe "D:\codex-memory\repo\scripts\autostart.pyw"`；LogonType=Interactive；`Hidden=True`；失败重启 2 次 / 间隔 2 分钟 |
| 第二保险 | `HKCU\...\CurrentVersion\Run` 的 `共享项目库` | 同一条 pythonw 命令（面板 `shared-lib-panel` 也在该键下，机制一致） |

两条路径调用同一个幂等启动器，重复触发只会看到一遍 `already serving`。

## 四个真实根因（都有现场证据）

### 1. VBS 自启路径在本机必然失效

启动目录里的 `启动共享库.vbs` 内容正确，但登录时从未执行。本机是
**Windows 11 25H2 / build 26200.9168** —— 正是 VBScript 弃用的目标版本。

排查时容易走偏的地方：`wscript.exe` 还在 `System32`、`.vbs` 文件关联正常、
WSH 的 `Enabled` 策略键根本不存在、手工用 `wscript` 跑同一个 VBS 也正常。
也就是说**引擎没坏，是"登录时不执行"**。别被"引擎没坏"误导成"那应该是脚本写错了"。

### 2. `pg_ctl` 参数被 cmd 剥掉引号（静默路径从来没成功过）

`start-pg.bat` 原本写的是：

```bat
pg_ctl.exe start -D "...\pgdata" -o "-p 55440" -w
```

cmd 会在交给 `pg_ctl` 之前把引号剥掉，于是 `pg_ctl` 收到 `-o -p 55440`，
把裸的 `55440` 当成多余参数：

```
pg_ctl: 命令行参数太多 (第一个是 "55440")
```

这条报错就躺在 `D:\codex-memory\logs\pg-silent.err.log` 里 —— 因为整条路径是静默的，
出了错没有任何提示。修法：端口写在 `pg_ctl` 自己的命令行上；现在更进一步，
直接起 `postgres.exe`，连 `pg_ctl` 都不经过。

### 3. memoryd 用裸解释器启动，必然 `ModuleNotFoundError`

`codex_memory` 是 **pip editable 装进 venv** 的：

```
runtime\venv\Lib\site-packages\__editable__.codex_memory-0.2.0.pth  ->  D:\codex-memory\repo\src
```

`torch` / `fastapi` / `sentence_transformers` / `uvicorn` 也都在 venv 里。
所以用裸 cpython 跑 `-m codex_memory.cli serve` 会在 import 阶段就死，
**模型都没开始加载**，而且死得静悄悄：

```
ModuleNotFoundError: No module named 'codex_memory'     # 缺 editable 包
ModuleNotFoundError: No module named 'fastapi'          # 就算补了 PYTHONPATH 也还缺依赖
```

**同一个坑还有反向版本：探测也要用对解释器。**
`pg_ready.py` 用裸 cpython 跑时缺 `psycopg` 而退出 1，脚本把"探测失败"读成
"Postgres 没起来"，于是**去停掉一个健康的实例**。这个假阴性在实测中真的发生过。

### 4. 动作进程是控制台程序 → 会开出一个可见终端窗口

这是用户最在意的"黑框"的真正来源，也是最后才被揪出来的：

- `powershell.exe` 的 PE 头子系统标签 = **3（Console）**
- `pythonw.exe` 的 PE 头子系统标签 = **2（Windows GUI）**

计划任务的动作是控制台程序时，Windows 会给它分配一个控制台；本机默认终端是
Windows Terminal，于是那个控制台就变成一个标题为 `Terminal` 的可见窗口。
`-WindowStyle Hidden` 和任务的 `Hidden=True` 都只是"先建窗口再藏起来"，
窗口终究存在过一瞬 —— 用户看到的就是那一下黑框。

**对照实验（决定性证据）**

| 阶段 | 动作 | 盯窗结果 |
|---|---|---|
| 1 | 只触发计划任务（动作 = `powershell.exe`） | 抓到 1 个 `Terminal` 窗口 |
| 2 | 什么都不做（对照） | 0 个窗口 |
| A/B | 直接起 `powershell ... -WindowStyle Hidden` | 抓到 1 个 `Terminal` 窗口 |
| A/B | 直接起 `pythonw autostart.pyw --check` | 0 个窗口 |

外加把启动链路拆成四段（基线 / 停库 / 起库 / 起 memoryd）单独盯窗，**四段全部 0 窗口**。

结论：动作必须换成 GUI 子系统的启动器。于是有了 `autostart.pyw` + `pythonw.exe`。

## 文件说明

| 文件 | 作用 |
|---|---|
| `autostart.pyw` | **开机链路实际使用的启动器**。用 pythonw 跑，子进程一律 `CREATE_NO_WINDOW`；自带 `--check`（只报状态）与 `--cold`（真实冷启动预演） |
| `verify-autostart.ps1` | 只读预检，含"不会弹出黑框"专项；`-RunDryRun` 顺带跑启动器自检 |
| `start-memoryd-silent.ps1` | **手工排障用**（带 `-DryRun` / `-Cold`）。它是控制台程序，所以不挂在开机链路上 |
| `start-pg.bat` | 历史遗留，已不被开机链路引用 |

排障入口只有一个：`D:\codex-memory\logs\startup.log`，认 `[autostart]` 前缀。
每轮记 `run begin` / 各阶段结果 / 失败时的证据（端口占用者、postmaster 日志尾部、
memoryd 错误尾部）/ `run end: OK|PARTIAL|FAILED`。

## 已实测结论

- **计划任务不会杀掉它拉起的子进程**：任务动作进程退出后，子进程心跳继续。
- **冷启动等价实测连续 2 轮通过**，全程走真实计划任务路径 + 全程盯窗：
  整轮 18s / 17s、退出码 0、**可见窗口 0 个**、停库与起库都干净。
- **预检 28 项全过**（1 项是 VBScript 弃用的提示性警告）。
- **仍有一步需要人来做**：真正的重启验收。预演等价但不等同 ——
  预演时模型在缓存里，真开机第一次加载约 40 秒（脚本上限 180 秒，余量充足）。

## 待办

- Task Scheduler 的 Operational 事件日志默认关闭，开启需要管理员权限：
  ```powershell
  $l = Get-WinEvent -ListLog 'Microsoft-Windows-TaskScheduler/Operational'
  $l.IsEnabled = $true; $l.SaveChanges()
  ```
- 旧的禁用任务 `CodexMemory`（指向过时的 `run.ps1`）可以删掉，避免误导。

## 四条踩过的坑（别退回去）

1. **给 Windows PowerShell 5.1 写的 `.ps1` 必须带 UTF-8 BOM**。没有 BOM 时 5.1 按 GBK
   解码中文注释，会破坏语法并报出 `& 是保留字` / `字符串缺少终止符` 这类假错误，
   只给退出码 1、没有别的线索。
2. **`ProcessStartInfo.ArgumentList` 是 .NET Core 才有的 API**，PowerShell 5.1（.NET Framework）
   上它是 `null`，`.Add()` 直接抛"不能对 Null 值表达式调用方法"；被 try/catch 吞掉后
   看起来就像"启动失败"。要用 `Arguments` 字符串。
3. **`postgres.exe ... stop` 不是有效的停库命令**。只有 `pg_ctl` 会读 `postmaster.pid`
   并发关闭请求。写错的表现是：服务照旧活着、端口没释放，脚本还白等一轮超时。
4. **检查工具本身也要自证**。预检脚本曾经把"注释里提到 `ArgumentList`"当成"代码里用了
   `ArgumentList`"，报了 2 条假 FAIL。按整段文本匹配要先剥掉注释行。

## 面板前端改动：必须重新 `cargo build`（别踩）

**Tauri 把前端在编译时压缩嵌进 exe，不是运行时读 `dist` 目录。**

所以改了 `index.html` / `style.css` / `src/main.ts` 之后，只跑前端构建再重启面板是**无效**的：

```powershell
npm run front          # 打包 + 写构建戳 + 刷 dist（不够）
cargo build            # ← 必须有这一步，新前端才会重新嵌进 exe
```

判断是否生效：`src-tauri\target\debug\build\shared-lib-panel-<hash>\out\tauri-codegen-assets\`
里会出现按内容哈希命名的新资源，它的时间必须早于 exe 链接时间。

**两个会把人带偏的假线索**（都试过，都不成立）：
- 去 exe 二进制里用明文搜中文/HTML —— **搜不到**，嵌入资源是压缩的，别据此判断"没嵌进去"；
- 去 WebView2 缓存里找 —— **找不到**，它不走缓存。

为此前端加了**构建戳**：`npm run front` 会把构建时间写进 `index.html` 的
`<meta name="panel-build">`，面板标题旁显示出来，一眼可辨跑的是哪一版。
