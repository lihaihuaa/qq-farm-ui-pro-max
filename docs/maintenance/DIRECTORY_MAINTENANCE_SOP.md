# 项目目录维护 SOP（标准操作流程）

> **适用范围**：qq-farm-bot-ui-main 项目  
> **版本**：v2.0 | 2026-03-03  
> **目的**：项目目录凌乱时，按本 SOP 快速整理

---

## 一、文件分类决策树

```
新文件出现？
├── .md 报告类（BUILD_COMPLETE 等）→ docs/archive/reports/
├── .md 用户指南 → docs/guides/
├── .html Plan 文件 → docs/plans/YYYY-MM-DD/  ← ★按天归档
├── .sh 部署脚本 → scripts/deploy/
├── .sh Docker 相关 → scripts/docker/
├── .sh GitHub 相关 → scripts/github/
├── .js 测试文件 → core/__tests__/
├── .js 服务管理 → scripts/service/
├── .png/.svg 截图 → assets/screenshots/ (英文 kebab-case 命名)
├── .tar/.gz 构建产物 → 🗑️ 删除（不进仓库）
├── .env* 配置 → 保留根目录，确保 .gitignore
├── Go 服务项目 → services/<服务名>/
├── Python 服务项目 → services/<服务名>/
└── 其他 → 评估后决定
```

---

## 二、日常维护流程（每周一次）

### 步骤 1：扫描松散文件

```bash
# 列出根目录下不应该存在的文件（排除合法文件）
ls -la *.md *.txt *.log *.tar *.html 2>/dev/null \
  | grep -v -E '(README|CHANGELOG|LICENSE|package)'
```

### 步骤 2：分类归位

按「分类决策树」移动。**必须用 `git mv`** 保留历史：

```bash
git mv <文件名> <目标目录>/
```

### 步骤 3：核对清单

- [ ] 根目录只保留：`README.md`、`CHANGELOG*.md`、`LICENSE`、`package.json`、`pnpm-*.yaml`、`.gitignore`、`.dockerignore`、`.env`
- [ ] `core/` 根目录无测试文件
- [ ] `scripts/` 无松散脚本（全在子目录 `deploy/`、`docker/`、`github/`、`service/`、`utils/` 中）
- [ ] `docs/` 无松散中文命名文件夹
- [ ] `assets/screenshots/` 图片全部英文 kebab-case 命名
- [ ] `docker/` 包含所有 Docker Compose 和启动脚本
- [ ] `services/` 包含所有外部服务（ipad860、openviking）
- [ ] 无超过 10MB 的二进制文件在仓库

---

## 三、Plan 文件归档规则（按天）

新 Plan 生成后，按日期放入对应子目录：

```bash
# Plan 命名格式：Plan_YYYYMMDD_功能名.html
# 归档方式：
mkdir -p docs/plans/2026-03-03
mv Plan_20260303_XXX.html docs/plans/2026-03-03/
```

| Plan 日期前缀 | 归档目录 |
|---------------|---------|
| `Plan_20260228_*` | `docs/plans/2026-02-28/` |
| `Plan_20260301_*` | `docs/plans/2026-03-01/` |
| `Plan_20260302_*` | `docs/plans/2026-03-02/` |
| `Preview_YYYYMMDD_*` | 同日期目录 |

---

## 四、根目录主仓推送流程

### 步骤 1：敏感信息扫描

```bash
bash scripts/github/check-sensitive-info.sh .
```

### 步骤 2：提交当前分支

```bash
git add -A
git status     # 人工检查
git commit -m "chore: YYYY-MM-DD 目录整理"
git push origin <branch>
```

### 步骤 3：验证

- [ ] GitHub README 截图正常显示
- [ ] 无 `services/ipad860/` 泄露（不应同步）
- [ ] 无 `docs/plans/`、`docs/dev-notes/` 泄露
- [ ] `github-sync` 未重新回到根目录主流程

---

## 五、大型目录重构流程

### 1. 备份与分支

```bash
git stash && git checkout -b refactor/dir-cleanup-YYYYMMDD
```

### 2. 影响分析

```bash
grep -rn '<文件名>' . --include='*.md' --include='*.json' \
  --include='*.sh' --include='*.js' --include='*.ts' \
  --include='*.vue' | grep -v node_modules
```

### 3. 分批移动 + 逐批 commit

```bash
git mv FILE docs/archive/reports/
git commit -m "refactor: 移动报告类文件"
```

### 4. 修复引用

- `package.json` 脚本路径
- `README.md` 图片/文件链接
- `docs/guides/REPO_ROOT_WORKFLOW_GUIDE.md`
- Shell 脚本中的 Docker Compose 路径

### 5. 构建验证

```bash
pnpm install -r 2>&1 | tail -5
pnpm build:web 2>&1 | tail -10
```

### 6. 合并

```bash
git checkout main && git merge refactor/dir-cleanup-YYYYMMDD
```

---

## 六、禁止事项 🚫

| 禁止 | 原因 |
|------|------|
| 根目录放 `.tar` / `.zip` 等大文件 | 仓库膨胀 |
| 用 `mv` 而非 `git mv` | 丢失历史 |
| `core/` 根放测试文件 | 混淆源码 |
| 中文目录名放 `docs/` 顶层 | URL 编码问题 |
| `.env` 提交 GitHub | 敏感泄露 |
| 旧 `github-sync/` 回流根目录 | 历史隔离仓已退役 |
| 历史草稿直接并入主文档 | 造成口径混乱 |
| 二进制文件（`.dll`、`.dat`、可执行文件）进 Git | 仓库膨胀 |
| 散落独立服务在根目录 | 用 `services/<名>` 收纳 |

---

## 七、命名速查表

| 类型 | 格式 | 正确 ✅ | 错误 ❌ |
|------|------|---------|---------|
| 目录 | kebab-case | `dev-notes/` | `DevNotes/`、`开发笔记/` |
| 文档 | UPPER_SNAKE | `DEPLOYMENT.md` | `deployment guide.md` |
| 脚本 | kebab-case | `deploy-arm.sh` | `DeployARM.sh` |
| 图片 | kebab-case + 序号 | `theme-01.png` | `主题1.png` |
| Plan | `Plan_YYYYMMDD_名称` | `Plan_20260303_xxx.html` | `plan_new.html` |
| 服务目录 | kebab-case | `services/ipad860/` | `services/Ipad860-main/` |

---

## 八、彻底重构操作 SOP（2026-03-03 本次执行）

> 当目录严重凌乱、需一次性彻底整理时，按本 SOP 执行。  
> **相关文档**：
> - 详细计划：`docs/plans/DIRECTORY_REFACTOR_PLAN_20260303.md`
> - 目录结构说明模板：`docs/maintenance/DIRECTORY_README_TEMPLATE.md`

### 8.1 执行前检查清单

- [ ] 已阅读 `DIRECTORY_REFACTOR_PLAN_20260303.md`
- [ ] 当前工作区无未提交更改（或已 stash）
- [ ] 已创建分支 `refactor/directory-cleanup-20260303`

### 8.2 七阶段执行顺序

| 阶段 | 内容 | 验证命令 |
|------|------|----------|
| 1 | 准备：分支、备份、扫描引用 | `grep -rn "log开发日志" . \| grep -v node_modules` |
| 2 | 根目录：Update.log、README_DRAFT、SOP 归位 | `ls *.md *.log 2>/dev/null` |
| 3 | log开发日志 → logs/development | `ls logs/development/` |
| 4 | docs 重命名（snake_case → kebab-case） | `ls docs/ \| grep "_"` 应无结果 |
| 5 | deploy-to-server：.gitignore *.tar.gz | `git status deploy-to-server/` |
| 6 | 引用修复、根目录主仓口径更新 | `pnpm build:web` |
| 7 | 提交、合并 | `git log -1 --oneline` |

### 8.3 引用修复命令（批量替换）

```bash
# 在项目根目录执行
find . -type f \( -name "*.md" -o -name "*.json" -o -name "*.sh" -o -name "*.js" -o -name "*.ts" -o -name "*.vue" \) \
  ! -path "./node_modules/*" ! -path "./.git/*" ! -path "./archive/retired-repos/*" \
  -exec grep -l "log开发日志\|stakeout_steal\|database_optimization\|steal_settings_ui\|admin_ui_optimization\|auto_features\|double_check" {} \;
# 对输出文件逐一 sed 替换
```

### 8.4 回滚

```bash
git checkout main
git branch -D refactor/directory-cleanup-20260303
```
