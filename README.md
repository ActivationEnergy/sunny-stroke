# 小晴笔顺 · Sunny Stroke

可直接发布到 GitHub Pages 的汉字逐笔查询站点。输入单字或粘贴一段汉字，点击任一字后查看逐笔字形、拼音与英文释义；默认每 1 秒逐笔循环展示，也可选择单次播放、停止或手动选笔。末笔绘制完成后全字恢复正常深色：循环模式完整停留 1.6 秒再重播，单次模式则停留供观察。手动走到末笔也在绘完后恢复深色；“查看完整字形”直接显示全深色字形。字库目前包含 9876 个有逐笔 SVG 路径的汉字，其中 7168 个属于 GF 0023—2020 的 8105 字。数据按需从本站加载，无后端、构建步骤或运行时数据 CDN。

桌面端将搜索与当前汉字放在同一工具栏，笔画和步骤列表优先留在首屏；手机端可在“大字逐笔”和“全部步骤”之间切换。新笔优先沿数据中线逐渐显现；没有可靠中线或图形与规范笔画数不一致时，改用柔和淡入。右侧步骤卡以轻微底色标识当前笔。

点击搜索框会选中已有文字；输入法完成选字后立即查询，无需点击提交按钮。粘贴多个汉字时会显示可选字列表，当前仍一次展示一个字。

## 本地预览

可以直接双击 `docs/index.html` 在浏览器打开。若要模拟 GitHub Pages 的 HTTP 环境，在仓库根目录运行：

```sh
python3 -m http.server 8000 -d docs
```

访问 `http://localhost:8000/`。页面使用本地脚本分片加载字库，直接打开文件与通过 HTTP 访问均可工作。

## GitHub Pages 部署

将发布版本推送至 GitHub 后，在仓库的 **Settings → Pages** 中选择 **Deploy from a branch**、分支 `main` 和目录 `/docs`。页面位于 `https://<用户名>.github.io/<仓库名>/`。资源使用相对路径；`#/字` 链接可在项目站点和用户主页站点使用。`docs/` 只包含网站内容。大 PDF 位于本地 `reference/`，仅在本地 `dev` 分支保留，不进入远程 `main`。

## 数据与状态

- `docs/data/index.js`：页面直接读取的可查询字及笔画数。
- `docs/data/*.js`：按 Unicode 高字节分组的逐笔 SVG 路径，打开某字时加载相应分片；文件本身是可读取的 JSON 数据包装，无需再存一份同内容的 `.json`。
- `docs/data/dictionary.js`：拼音与英文释义。
- `tools/build_data.py`：从固定上游版本的 `graphics.txt` 重新生成字库。
- [`docs/DATA-SOURCES.md`](docs/DATA-SOURCES.md)：数据来源、许可、修改记录和规范核验状态。
- [`docs/ARPHICPL.TXT`](docs/ARPHICPL.TXT)：图形数据的 Arphic Public License 全文。
- [`docs/LGPL.txt`](docs/LGPL.txt)、[`docs/GPL-3.0.txt`](docs/GPL-3.0.txt)：字典数据的 LGPL v3 或更新版本及其引用条款。
- [`audit/README.md`](audit/README.md)：规范覆盖、逐字核对日志及剩余缺口。
- `audit/count-review.html` 和 `audit/wei-review.html`：本地审阅页，需要本地 PDF 截图；不纳入发布提交。

若需重新生成数据，下载固定版本的 [`graphics.txt`](https://raw.githubusercontent.com/skishore/makemeahanzi/bddc96d41bef78427ed0e034e9f7e31d71fd1b92/graphics.txt)、[`dictionary.txt`](https://raw.githubusercontent.com/skishore/makemeahanzi/bddc96d41bef78427ed0e034e9f7e31d71fd1b92/dictionary.txt) 和 [AnimCJK `graphicsZhHans.txt`](https://raw.githubusercontent.com/parsimonhi/animCJK/ec5e17cca76c87587790bcbce5ea0b4d4fb753d6/graphicsZhHans.txt)，运行 `python3 tools/build_data.py graphics.txt docs/data --dictionary dictionary.txt --supplement graphicsZhHans.txt --standard-csv audit/logs/base/character-audit.csv --overrides-dir overrides`。这些上游文件虽以 `.txt` 命名，内容是逐行 JSON；生成脚本会核对 SHA-256，并输出网站实际读取的 JS 分片。「亹」的修订路径保存在 [`overrides/亹.json`](overrides/亹.json)。

目前规范字仍缺 937 个图形；已有图形的 7168 个规范字中，7152 字笔画数与规范一致，16 字不同。用户确认的「亹」「櫆」修订保留，其余差异字保留原图形与原逐笔顺序，页面同时显示规范笔画数和笔顺编码供参考。**笔画数一致也不代表完整笔顺和字形已核验。**早期六字原型保留在 `LastType-Hanzi-Strokes-GitHub-Pages/`，正式部署入口是 `docs/index.html`。
