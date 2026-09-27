# GF 0023—2020 核对记录

2026-09-27 使用用户提供的 `reference/通用规范汉字笔顺规范.pdf`，以 `tools/audit_standard.py` 从 PDF 页坐标提取 UCS、字表序号、五类笔顺数字和印刷笔画数，再逐字与网站图形路径数量比较。提取校验：8105 个互不重复的 UCS，序号完整覆盖 1–8105，每条笔顺数字长度与 PDF 印刷笔画数相同。

## 当前结果

| 项目 | 数量 |
| --- | ---: |
| 规范字 | 8105 |
| 有逐笔图形 | 7168 |
| 尚无图形 | 937（BMP 742，扩展区 195） |
| 图形笔画数与规范一致 | 7152 |
| 图形笔画数与规范不同 | 16 |

一级字表 3500 字都有图形且笔画数一致；二级字表缺 28 字、5 字笔画数不同；三级字表缺 909 字、11 字笔画数不同。**笔画数一致不能证明笔顺或字形一致。** 用户确认「亹」「櫆」的修订，其余 9 个试作图形均被用户否定，网站已恢复 Make Me a Hanzi 的原始路径与原始逐笔顺序。网页对笔画数不符的字同时显示规范笔画数与五类笔顺编码，原图形仅供参考。

第一批补字使用 [AnimCJK](https://github.com/parsimonhi/animCJK) 的 `graphicsZhHans.txt` 固定版本 `ec5e17cca76c87587790bcbce5ea0b4d4fb753d6`，只补入原字库缺失且笔画数与规范一致的 302 字，不替换已有图形。这些候选仅通过笔画数检查；另有「滫」候选笔画数不符，未纳入。AnimCJK 简体图形按 [Arphic Public License](../docs/ARPHICPL.TXT) 提供，修改说明写入各数据分片。

## 日志

- [`logs/character-audit.csv`](logs/character-audit.csv)：8105 字逐字记录，含 PDF 页码、字表序号、规范笔画数和五类笔顺数字、现有图形笔画数、当前状态。
- [`logs/summary.json`](logs/summary.json)：覆盖统计及 PDF、索引 SHA-256。
- 本地 `dev` 的 `logs/geometry-screen.csv`：用原始 `medians` 对 19571 条近似直线笔画做几何筛查，其中 316 条的简单方向分类与规范数字不同。这些是**人工复核候选**，不是已证实的笔顺错误；未筛到的笔画也不能判为一致。
- `logs/base/character-audit.csv`：补字前的逐字基线，供生成脚本筛选补字；当时规范覆盖 6866 字、缺 1239 字、笔画数冲突 18 字。其余基线日志仅在本地 `dev` 保留。

用户审阅的 11 个字为：亹、彟、櫆、爇、脩、苧、莿、蒐、蒻、薳、藨。用户确认修订字「亹」「櫆」；其余 9 字恢复原图形。此前另外 7 个未经用户核对的替代图形也恢复原图形。被否定的试作路径及审阅决定保存在本地 `dev`，不参与网站构建。

## 人工审阅页面

本地 `dev` 分支提供审阅脚本与页面：`audit/count-review.html` 可查看当前 16 个笔画数不同字的规范条目、网站原始图形和逐笔小图；`audit/wei-review.html` 单独展示已确认的「亹」修订。PDF 截图与用户参考图分别位于 `audit/count-review-assets/`、`audit/reference-images/`，均不在发布 `main` 中。若需在 `dev` 重建：

```sh
python3 tools/build_count_review.py 'reference/通用规范汉字笔顺规范.pdf' docs/data/index.js docs/data audit/count-review.html --title '16 字形笔画差异 · 原图形参考'
python3 tools/build_count_review.py 'reference/通用规范汉字笔顺规范.pdf' docs/data/index.js docs/data audit/wei-review.html --characters 亹
```

## 复现

将用户提供的 PDF 放在 `reference/通用规范汉字笔顺规范.pdf`，下载固定版本的 [Make Me a Hanzi `graphics.txt`](https://raw.githubusercontent.com/skishore/makemeahanzi/bddc96d41bef78427ed0e034e9f7e31d71fd1b92/graphics.txt)、[`dictionary.txt`](https://raw.githubusercontent.com/skishore/makemeahanzi/bddc96d41bef78427ed0e034e9f7e31d71fd1b92/dictionary.txt)，以及 [AnimCJK `graphicsZhHans.txt`](https://raw.githubusercontent.com/parsimonhi/animCJK/ec5e17cca76c87587790bcbce5ea0b4d4fb753d6/graphicsZhHans.txt)。生成脚本会校验输入 SHA-256。

```sh
python3 tools/build_data.py graphics.txt docs/data --dictionary dictionary.txt --supplement graphicsZhHans.txt --standard-csv audit/logs/base/character-audit.csv --overrides-dir overrides
python3 tools/audit_standard.py 'reference/通用规范汉字笔顺规范.pdf' docs/data/index.js --log-dir audit/logs
# 几何筛查脚本仅在本地 dev 分支保留
python3 tools/publish_audit_status.py audit/logs/character-audit.csv audit/logs/summary.json docs/data/audit-status.js
```

补入或替换路径后，要重新运行三项审计；只有 PDF 图形和笔顺得到逐字核对后，才能把对应记录改为“已核验”。
