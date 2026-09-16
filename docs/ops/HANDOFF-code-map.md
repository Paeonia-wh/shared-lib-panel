# 交接给 Codex：把面板的代码地图（知识图谱）写进共享库

**一句话**：给 `shared-lib-panel` 项目补代码地图。地图已经建好、存在 `CODE-MAP.json` 里，你只需要读它并写入共享库，**不用重读仓库**。

---

## 为什么需要你做

面板项目 `shared-lib-panel` 在共享库里的代码地图是**空的**（`agent_code_nodes` 里 0 个节点，`map_freshness = missing`）。后果：别的会话调 `project_context_pack` 时拿不到知识图谱，只能重读全仓库 —— 这正是图谱要解决的问题。

DeepSeek 那边的会话建不了/写不了，原因有三道门禁（都已实测）：

1. `replace=True` 整图替换 → 拒绝：*"Replacing a project's entire code map requires an explicit human/coordinator review; merge nodes and edges instead"*
2. 合并写入（不带 replace）→ 拒绝：*"Code-map writes require the current session to own a running or review task in this project"*
3. `project_task_create` 工具在 DeepSeek 桥接里**不可用**（`ToolUnavailable`）

所以这事交给了你。

---

## 要做什么

### 1. 读地图文件

```
D:\codex\open-source\shared-lib-panel\docs\ops\CODE-MAP.json     ← 项目 root_path 就是这里
D:\codex\shared-lib-panel\docs\ops\CODE-MAP.json                 ← 正本（面板实际跑的副本，内容相同）
```

文件里有 `nodes`（20 个）、`edges`（30 条）、`groups`（3 组），以及开头 `_readme` 里的说明。
每个节点的字段格式**就是** `project_code_map_write` 要的：`node_key / kind / label / responsibility / status / paths / group_label / group_order`。
每条边：`from_key / to_key / label / variant`。

### 2. 写入共享库

```
project_code_map_write(
  project  = "shared-lib-panel",
  nodes    = <CODE-MAP.json 的 nodes>,
  edges    = <CODE-MAP.json 的 edges>,
  revision = "<40 位 git SHA，见下面「revision 怎么取」>"
)
```

- **不要**传 `replace=True`（会被平台拒绝，而且没必要——图是空的，合并就等于新建）。
- 项目 id：`1ed8f15285d9471284ac3bbd110e7b20`；`root_path`：`D:\codex\open-source\shared-lib-panel`；`plan_locked = True`。

### 3. revision 怎么取

两处 HEAD 都是**较早的**提交，**当前工作区还有未提交改动**，所以：

| 仓库 | HEAD | 工作区改动 |
|---|---|---|
| `D:\codex\shared-lib-panel`（正本） | `72fdc2da56a489df1659dbde6a4b51d373bd0928` | 10 个未提交 |
| `D:\codex\open-source\shared-lib-panel` | `e483662252679de805b01f95a1fcf9b2cef1004e` | 11 个未提交 |

**建议**：先把改动提交，再用提交后的 SHA 写入 —— 这样 freshness 才有意义。若先不提交，用 `e483662252679de805b01f95a1fcf9b2cef1004e` 也可以，只是 freshness 会按那个基线算，可能显示 `stale`。

### 4. 验收

```
project_context_pack(project="shared-lib-panel")
```

应看到：
- `code_map.nodes` 非空（20 个）
- `code_map.edges` 非空（30 条）
- `code_map.map_freshness` **不再是 `missing`**

---

## 这份地图是怎么来的（可信度说明）

不是猜的，是逐文件读过仓库真实代码建的（核对基线 `e483662`）：

- 覆盖率自检通过：`src/` 下**每个文件**都被某个节点的 `paths` 覆盖
- 边引用的节点全部存在
- 每个节点都有必备字段，`responsibility` 都写的是职责边界、不是套话

分组：

| 组 | 节点 |
|---|---|
| 入口与构建 | `index_html`、`style_css`、`build_front`、`tauri_conf` |
| 面板业务 | `main_ts`、`tauri_ts`、`rust_main`、`data_contract` |
| 球体引擎 | `engine`、`repere`、`math`、`profiles`、`shape`、`skins`、`decor`、`eyefit`、`face`、`expressions`、`states`、`cycles` |

**两点需要你知道的**：

1. **球体部分是移植的**：`src/bot/*` 来自 bloub（`jeremy-prt/bloub`，MIT），原始注释是法文。地图里写的是移植后的实际职责，不是照抄上游文档。
2. **核对后又叠加了当日改动**：复制块重写、项目卡按钮、筛选条移除、`unmet_deps` 口径修正、构建戳。这些改动**没有改变模块划分**，所以地图结构仍然准确；但 `data_contract` 节点里描述的 `unmet_deps` 口径正是当日新增的，已经写进去了。

---

## 顺便（可选，别漏了）

同样是这份活的一部分，但**不影响本次写入**：其余 5 个项目**根本没有代码地图**，另外 2 个**过期了**：

| 项目 | 现状 |
|---|---|
| rural-1-39 | 12 节点 / 20 边，fresh ✓ |
| kstage | 15 / 22，**stale**（建过但比基线旧） |
| codex-memory | 11 / 11，**stale** |
| ledger-miniapp / longan-farm / tea-coop / ai-delivery-methodology / ui-ux-evaluation | **0 / 0，从来没建过** |

要不要一并补，由你决定。

---

## 附：两个容易踩的坑（与本次写入无关，但你会用到这个仓库）

1. **改完前端必须重新 `cargo build`**。Tauri 把前端（`index.html` / `style.css` / `bundle.js`）**编译时嵌进 exe**，不是运行时读 `dist`。只跑 `npm run front` 再重启面板是**无效**的。正确顺序：`npm run front` → `cargo build`。
2. **`exe` 被运行中的面板锁住时 `cargo build` 会报 `os error 5 拒绝访问`**，要先停掉面板进程。另外 `npm.ps1` 被执行策略挡住，要用 `npm.cmd`。

（面板标题旁有个构建时间戳，用来一眼确认跑的是哪一版；那正是被坑过之后加的。）
