# goal-tracker（cc的小助理）

一个纯 HTML/CSS/JS 实现的目标管理单页应用，支持进度型/打卡型目标、子任务、标签、笔记，登录后多设备云端同步。

在线地址：https://xiongermiao.github.io/goal/

## 功能特性

- 进度型目标：截止日期、进度百分比、最多三级子任务
- 打卡型目标：按日/周/月/季/年频率打卡，带日历视图
- 标签系统：单选标签、颜色可改，颜色云端同步
- 优先级 P0-P3，影响排序与徽章显示
- 笔记：每个目标可添加多条笔记
- 双 Tab：to do（今日待办 + 待打卡）、目标管理（全部目标）
- 浏览器通知：目标到期提醒、20:00-22:00 打卡提醒
- 云端同步：Supabase，登录后多设备数据互通，登录态长期有效

## 技术架构

- 纯 HTML/CSS/JS，无框架、无构建步骤，源码即部署产物
- 不使用 Supabase 官方 SDK（国内 CDN 不稳定），使用自写的 fetch REST 客户端

### 文件结构

| 文件 | 职责 |
|------|------|
| `index.html` | 页面骨架与资源引入 |
| `style.css` | 全部样式 |
| `supabase-client.js` | Supabase REST 客户端（含 token 自动刷新、请求超时） |
| `data.js` | 数据层：认证、云端/本地同步 |
| `ui.js` | 渲染层：列表、详情、表单、标签 |
| `todo.js` | 交互：子任务、筛选、通知、初始化 |

### 数据库

Supabase 表：`goals`、`todos`、`checkins`、`notes`、`user_prefs`（标签颜色）。

新环境需先执行建表 SQL（含 RLS 策略）。

## 本地运行

方式一：直接双击 `index.html` 用浏览器打开。

方式二：VSCode 安装 Live Server 后，右键 `index.html` → Open with Live Server。

未登录时页面为空数据；登录后显示当前账号的云端数据。

## 部署

GitHub Pages：仓库 `main` 分支根目录，push 后 1-2 分钟自动生效。

## 开发约定

- 当前仓库为唯一维护源，改动直接提交即可
- 涉及数据库结构变更时，同步更新建表 SQL
