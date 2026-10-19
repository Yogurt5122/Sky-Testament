# 天穹遗嘱 · Sky Testament

> 你出生那晚的天空，被做成了一张可以打印的遗嘱。

Sky Testament 是一个**天文记录生成器**。输入一个真实的时刻与地点，它还原那一刻真实可见的天空，并写下一段克制的文字作为注脚。它不预测命运，只记录天空。

**状态**：MVP 开发中 · M2（数据层）已完成

---

## 它是什么 / 不是什么

| 是 | 不是 |
|---|---|
| 真实天文计算（恒星、行星、月球、地平线） | 占星术、星座运势、命理解读 |
| 一张可打印、可验证的纪念物 | 社交产品、内容社区 |
| 确定性的：同一输入永远得到同一结果 | 随机鸡汤生成器 |
| 私密的：日期与地点不离开浏览器 | 需要上传个人数据的云服务 |

**伦理边界**：不含任何对未来的预测，不做健康、财富、婚姻判断，不使用「命中注定」「运势」这类表述。星图是天文事实，文字是文学修辞，二者都不构成命运判断。

## 三条核心原则

1. **真实** —— 不是插画，是算出来的天空。每一个点都有坐标、时间和误差范围。
2. **确定** —— 同一输入，任何浏览器，逐字节相同的 SVG。
3. **可印刷** —— 从网页变成能挂在墙上的东西：A3、矢量、字体嵌入、文本可选中。

## 功能范围

| 功能 | MVP | V1 |
|---|:--:|:--:|
| 日期时间输入 + 离线城市搜索（含中文名） | ● | ● |
| 可见半球星图：恒星 mag ≤ 6.5、日月行星、星座连线 | ● | ● |
| 白天模式（太阳在地平线上时不产生空图） | ● | ● |
| 确定性文案（1 种风格） | ● | 3 种 |
| 导出 SVG / PNG / A3 打印 PDF | ● | ● |
| 分享链接（参数全部编码进 URL，无后端） | ● | ● |
| 中英双语界面 |  | ● |
| 多版式（纵横 / 方形）、深色主题 |  | ● |
| PWA 离线、无障碍完整达标 |  | ● |

明确不做：账号、关注、评论、运势解读、实时天气、原生 App、公开档案馆（V2 再议）。

## 技术方案

```
Browser (SPA，无后端)
├─ core/          纯 TypeScript，与框架无关
│   ├─ time        UTC 锚定 + 手动偏移覆盖
│   ├─ ephemeris   astronomy-engine（VSOP87 / NOVAS）
│   ├─ catalog     星表二进制 + 自行修正
│   ├─ projection  球极投影（保角）
│   ├─ text        模板 + 语料 + xoshiro128**
│   └─ scene       与渲染无关的场景图
├─ render/
│   ├─ svg.ts      屏幕渲染与 SVG 导出
│   └─ pdf.ts      V1：pdf-lib + fontkit 子集嵌入
└─ data/           stars.bin · cities.json · 字体子集
        ↓
  静态托管（Cloudflare Pages / GitHub Pages）
```

关键决策：

| 决策 | 选择 | 理由 |
|---|---|---|
| 后端 | 不做 | 计算、渲染、导出、分享全部在客户端完成 |
| 天文库 | astronomy-engine (MIT) | 标称 ±1′，与 JPL Horizons 交叉验证，无 DOM 依赖 |
| 时区 | **种子锚定 UTC 时刻**，而非本地时间 | 绕开浏览器 tzdata 差异，跨端可复现；本地→UTC 结果展示在元数据中并允许手动覆盖 |
| 投影 | 球极（stereographic） | 保角，星座可辨识；方位等距在地平线附近形变过大 |
| 星表 | HYG v4.2 过滤 mag ≤ 6.5 | 单文件、含自行与星名；CC BY-SA 4.0，独立目录 + 署名 |
| 文案 | 模板 + 语料 + 确定性 PRNG | 不用 LLM：零成本、零延迟、零隐私风险、可复现 |
| 导出 | MVP 用浏览器打印，V1 上 pdf-lib | Chrome 打印保留矢量并嵌入字体子集，A3 已验证 |
| 确定性 | 固定精度序列化 + 固定字宽度量表 | 不依赖 getBBox、Intl 或 Math.random |

## 精度目标

| 项 | 目标 | 验证方式 |
|---|---|---|
| 行星位置 | < 0.02° | 10 组样本对照 JPL Horizons |
| 恒星位置 | < 0.05°（含自行修正） | 同上 |
| 月相照度 | < 0.5% | 对照 USNO |
| 日出日落 | < 1 分钟 | 对照 Horizons |

实测（2026-10-19 12:00 UTC，上海，对照 JPL Horizons）：火星 0.03′、木星 0.04′、月亮 0.04′、金星 0.33′，均远优于目标。

已知边界（会写进 README 与 PDF 页脚）：

- 1970 年之前的时区规则为回推数据，精度有限，提供手动 UTC 覆盖
- 未建模海拔与地平线下沉，高海拔地点的日出日落可差数十秒
- 恒星位置为 J2000 加自行外推，未做视差修正

## 数据与许可

| 资源 | 来源 | 许可 |
|---|---|---|
| 天文计算 | astronomy-engine | MIT |
| 恒星数据 | HYG v4.2（Hipparcos + Yale BSC + Gliese） | CC BY-SA 4.0 |
| 城市库 | GeoNames cities15000 | CC BY 4.0 |
| 字体 | Noto Serif SC / IBM Plex Mono | SIL OFL 1.1 |
| 星座连线 | 自绘 | 项目许可 |

原则：**许可不明 = 不使用**。所有再分发数据将在实现阶段统一记录于 `ATTRIBUTION.md`。

## 隐私

- 日期、坐标、文案全部在浏览器内计算，**不上传、不记录、不分析**
- 分享链接包含时间与位置，生成时明确提示，并提供「模糊到城市级」选项
- 不引入第三方统计脚本，不做用户画像
- 生成的星图与文字归用户所有

## 路线图

| 阶段 | 内容 | 人力（单人全职） |
|---|---|---|
| MVP | 单版式、单文案风格、A3 打印、分享链接 | 3–4 周 |
| V1.0 | 双语、多版式、pdf-lib 导出、历史时区、无障碍 | +5–6 周 |
| V2 | 公开档案馆、OG 动态图、打印服务 | 待定 |

MVP 验收：陌生人在 30 秒内生成一张自己愿意发出去的图；A3 打印中文不乱码、线条不糊、文本可选中。

## 开发

环境：Node **20.18+** 与 npm。不使用 pnpm——Windows 默认没有创建符号链接的权限。

```bash
npm install
npm run dev      # 开发服务器，http://localhost:5173
npm test         # 单元测试（含 JPL Horizons 对照）
npm run ephem    # 命令行打印天体高度与方位
npm run build    # 类型检查 + 生产构建
npm run shot     # Playwright 截图（channel: chrome，不下载内核）
```

数据管道（原始数据放在 `data-raw/`，不提交）：

```bash
npm run build:stars    # HYG v4.2 → src/data/stars.bin + star-names.json
npm run build:cities   # GeoNames cities15000 → src/data/cities.json
npm run build:font     # Noto Serif SC → public/fonts/*.woff2
```

原始数据下载地址：`hygdata_v42.csv.gz`（astronexus.com）、`cities15000.zip`（download.geonames.org/export/dump）、
`NotoSerifSC[wght].ttf`（google/fonts）。

已完成：

- **M1 天文核心** —— `src/core/time.ts` 本地时间 → UTC，覆盖夏令时前拨与回拨；`src/core/ephemeris.ts` 太阳、月亮、五大行星的赤道与地平坐标；4 个天体对照 Horizons，最大偏差 0.33′
- **M2 数据层** —— 恒星目录 8,920 颗（mag ≤ 6.5，含自行与 B−V）、城市库 6,285 座（3,588 座带中文名）、字体子集 1,686 字；城市搜索可直接回填时区与经纬度

测试共 35 个。

## 参与

项目处于设计阶段，欢迎在 Issues 中讨论定位、精度与数据源。代码落地后会标注 `good first issue`（英文界面、PDF 导出、更多版式、历史时区）。

## 许可

代码 MIT · 文案语料 CC BY-SA 4.0 · 数据遵循各自原始许可。

## 参考

- [astronomy-engine](https://github.com/cosinekitty/astronomy)
- [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/)
- [HYG Database](https://www.astronexus.com/projects/hyg)
- [GeoNames](https://www.geonames.org/)
- [Source Han Serif](https://github.com/adobe-fonts/source-han-serif)
