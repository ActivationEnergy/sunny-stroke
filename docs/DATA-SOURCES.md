# 图形数据来源与修改记录

本站的 `data/` 目录由 [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) 的 `graphics.txt` 和 `dictionary.txt` 生成，固定来源提交为 [`bddc96d41bef78427ed0e034e9f7e31d71fd1b92`](https://github.com/skishore/makemeahanzi/commit/bddc96d41bef78427ed0e034e9f7e31d71fd1b92)。原始图形数据的字形来自文鼎开放授权字体；字典数据来自 Unihan 与 CJKlib，原始许可说明见 [`COPYING-UPSTREAM.txt`](COPYING-UPSTREAM.txt)。

[APL 全文](ARPHICPL.TXT)载有文鼎原始字体的版权声明：Copyright © 1999 Arphic Technology Co., Ltd.。这里说明的是字体及其衍生图形的数据来源；本站页面和程序代码是独立部分，不属于这句图形数据版权声明的范围。

2026-09-27 的修改：从图形数据提取 `character`、有序 SVG `strokes` 路径和用于播放方向的 `medians`；从字典数据提取拼音与英文释义，省略其他字段。另从 [AnimCJK](https://github.com/parsimonhi/animCJK) 固定提交 `ec5e17cca76c87587790bcbce5ea0b4d4fb753d6` 的 `graphicsZhHans.txt` 增加 302 个原缺字，**不替换** Make Me a Hanzi 已有图形。用户确认的「亹」「櫆」单字修订保存在 [`overrides/`](../overrides)；另外 9 个未通过用户视觉核对的试作版本不参与网站构建。当前有 9876 个图形字，按 Unicode 分为 100 个分片。每份修改后的数据都含修改说明；索引另记录 AnimCJK 增补和已确认的单字覆盖来源。

为支持直接打开本地网页，本站提供可读取、可复制的 `.js` 数据文件，不再重复保存同内容 `.json`。生成脚本为 [`tools/build_data.py`](../tools/build_data.py)，从固定版本的逐行 JSON 上游文件生成分片。图形数据按 [Arphic Public License](ARPHICPL.TXT) 再分发；字典数据按 [LGPL v3 或更新版本](LGPL.txt)及其引用的 [GPLv3](GPL-3.0.txt) 条款再分发。

《[通用规范汉字笔顺规范](https://www.moe.gov.cn/jyb_sjzl/ziliao/A19/202103/t20210318_520473.html)》（GF 0023—2020）规定了 8105 个汉字的笔顺。逐字审计见 [`audit/README.md`](../audit/README.md)：当前有图形的规范字为 7168 字，缺 937 字；其中 16 字的原图形笔画数与规范不同。网站对这 16 字保留原图形逐笔顺序，同时展示规范的五类笔顺数字和差异说明，供用户参考。**原图形不是规范逐笔图，其余笔顺和字形也未逐字核验。**用户提供的规范 PDF 仅用于核验，不随站点再分发。
