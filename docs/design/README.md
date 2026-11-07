# 游戏 UI 设计学习资料

> 面向《三皇五帝》题材 2D RTS（Phaser 3 + Capacitor → Android APK）的 UI 设计教程。
> 目标不是“会画好看的界面”，而是**能在手机上交付一套可读、可点、可维护、跑得动的游戏 UI**。

## 这套资料是什么

- 一套从入门到精通的**分层学习路径**，每一档都有练习和可观测的验收标准。
- 一份**工具选型结论**：主设计、矢量、像素、动效、3D、引擎 UI 各自该用什么，为什么。
- 一套**游戏 UI 的专业方法**：信息架构、HUD 密度、战场可读性、反馈节奏、字体、图标、暗色对比、触屏、适配、无障碍、本地化。
- 一套**工程规范**：切图、图集、九宫格、矢量/位图、字体子集、动效实现、手机性能。
- 一次对 `docs/ui` 现有高保真稿的**批判性复盘**：好在哪、差在哪、怎么改。
- 一份**行业参照**：SC2、WC3、AoE、Total War、CoH、Polytopia、Iron Marines 等解决了什么问题。

## 这套资料不是什么

- 不是 Figma/PS 的菜单教程。操作可以查官方文档，这里只讲判断和取舍。
- 不是“100 个 UI 灵感网站”合集。
- 不是万能模板。所有结论都要回到你的玩法、输入设备、目标机型上验证。
- 不是对现有 `docs/ui` 的否定。那套稿子的视觉方向值得保留，问题在移动端骨架。

---

## 目录

| 文件 | 内容 | 先读理由 |
| --- | --- | --- |
| [01-toolchain.md](01-toolchain.md) | Figma / PS / AI / Affinity / Aseprite / AE / Lottie / Rive / Blender / Unity / Godot / Cocos / Phaser 对比与推荐组合 | 先定交付方式，避免学错工具 |
| [02-information-and-readability.md](02-information-and-readability.md) | 信息架构、HUD 密度、战场可读性、状态反馈、字体与数字、图标、暗色对比 | 游戏 UI 的内核，决定“能不能看懂” |
| [03-touch-and-adaptation.md](03-touch-and-adaptation.md) | 触屏尺寸、手势状态机、拇指区、横竖屏、安全区、多分辨率、无障碍、本地化 | 决定“手机上能不能玩” |
| [04-skill-levels.md](04-skill-levels.md) | 入门/进阶/精通三档能力、项目练习、验收标准、能力矩阵 | 知道自己在哪、下一步练什么 |
| [05-engineering.md](05-engineering.md) | 切图、图集、九宫格、矢量/位图、适配方案、字体、动效、性能、Phaser 落地 | 决定“设计稿能不能进引擎” |
| [06-case-review.md](06-case-review.md) | 对 `docs/ui/UI-SPEC.md`、`ui-a.html` 和六张截图的逐条复盘与改版方案 | 最有针对性的一章，建议早读 |
| [07-industry-reference.md](07-industry-reference.md) | SC2/WC3/AoE/Total War/CoH/Polytopia/Iron Marines 等案例与来源 | 看成熟作品解决什么问题 |

---

## 三条阅读路径

### 路径 A：只有 30 分钟（先拿结论）

1. 本页的“核心结论”
2. [06-case-review.md](06-case-review.md) 的评分卡、P0 问题和“如果只能改三件事”
3. [01-toolchain.md](01-toolchain.md) 的“先给结论”

适合：马上要动手改 UI，先知道最致命的问题在哪。

### 路径 B：一个周末（能改一版）

1. [01-toolchain.md](01-toolchain.md)：定工具和交付流程
2. [02-information-and-readability.md](02-information-and-readability.md)：重排信息层级
3. [03-touch-and-adaptation.md](03-touch-and-adaptation.md)：按 dp 重做手机布局
4. [05-engineering.md](05-engineering.md)：切图、九宫格、字体、动效落地
5. [06-case-review.md](06-case-review.md)：对照现有稿逐条改

适合：独立开发者，想在一个周末把现有稿推进到“手机可玩”。

### 路径 C：系统学（1–3 个月）

1. [04-skill-levels.md](04-skill-levels.md)：先定位自己在哪一档
2. 按“入门 → 进阶 → 精通”的练习顺序做项目题
3. 每章配合 [02](02-information-and-readability.md)/[03](03-touch-and-adaptation.md)/[05](05-engineering.md) 的方法
4. 用 [06](06-case-review.md) 做一次真实复盘
5. 用 [07](07-industry-reference.md) 建立参照系

适合：想从“会画图”走到“能负责一套 UI 系统”的人。

---

## 核心结论

### 工具：一套够用的组合

```
主设计：Figma
矢量：Affinity Designer（2025-10 起免费）
位图：Affinity Photo / 已有 Photoshop
像素/序列帧：Aseprite
动效：引擎 tween 为主 + Rive（状态）+ Lottie（线性装饰）
3D：Blender（只在需要预渲染素材时）
引擎 UI：Phaser DOM/CSS 覆盖层 + Canvas 战场 UI
图集：free-tex-packer / TexturePacker
```

一句话：**Figma 做决定，Affinity 做精修，Aseprite 做帧，Rive 做状态，引擎做最终 90% 的动效。**

不推荐：用 PS 排全部 HUD；用 AE 做按钮状态；用 Blender 做 UI 布局；在 Figma 里画像素画；同时学五个工具。

详见 [01-toolchain.md](01-toolchain.md)。

### 三档能力：一句话验收

| 档位 | 一句话 | 可观测标准（例） |
| --- | --- | --- |
| 入门 | 能准确复刻、按约束改造、在真机跑起来 | 资源栏复刻偏差 ≤2px；24px 图标 5 人盲测 ≥4 人认出；三种分辨率不溢出 |
| 进阶 | 能独立负责一套完整界面系统 | 新手 60 秒完成“造农人→采谷→造田”；20 次点击误触 ≤1；50 单位可读 |
| 精通 | 能建立系统、做减法、用数据证明 | 新人 1 天用你的系统做出合格界面；HUD 减 30% 任务时间不退化；换肤不改代码 |

详见 [04-skill-levels.md](04-skill-levels.md)。

### 十条最容易被忽略的判断

1. **游戏 UI 的第一指标是可读性，不是美观。** 玩家在 0.3 秒内要能做决定。
2. **读写分离。** 只读信息放边缘/远端，写操作放拇指/鼠标自然停留位。
3. **固定槽位。** 同类命令永远在同一位置；不可用也保留位置。
4. **信息分层。** 决策 / 确认 / 叙事，三层强度递减。
5. **敌我不能只靠颜色。** 颜色 + 形状双通道，照顾 8% 的色盲男性。
6. **手机按 dp 设计，不按 1920 画布等比缩。** 2400×1080、DPR 3 的手机，CSS 视口只有 800×360。
7. **触屏没有 hover。** 每个状态都要有按下/禁用/冷却/原因。
8. **动效是信息，不是装饰。** 同屏主动画 ≤3 个；80% 反馈用 100–250ms 的 tween。
9. **效果要算性能账。** 全屏模糊、混合模式、噪点、阴影，在 Android WebView 上都很贵。
10. **设计稿不是交付。** 交付 = 源文件 + 切图 + 状态矩阵 + token + 真机截图 + 性能数据。

### 对现有 `docs/ui` 的结论

**好在**：视觉方向有约束、有辨识度；“德望”被当作叙事而不是第六种资源；阅读顺序“选→令→报”成立；六状态覆盖超过一般概念稿；图标是内联 SVG，规则统一；胜利界面有仪式感。

**不够顶尖**：

- 1920×1080 固定舞台，0 个 `@media`、0 个安全区；手机上 96px 按钮缩到 32–40px、10px 文字缩到 3–4px。
- 14 处 `:hover`，没有触屏按下/冷却/误触/手势状态机；热键角标在手机上无效。
- 正文大量 9–10px、`muted-500` 对比度仅 2.75:1；朱砂文字 2.25:1。
- 小地图比例与世界不一致，代码用 `preserveAspectRatio="none"` 拉伸；视野框文档说梯形、代码是矩形。
- 多选 12 个才折叠，12 张卡每张约 19px，点不中。
- 底部 300px 占屏 27.8%，但文档写“低于 1/4”。
- 行业对照表把 SC2/WC3 的资源位置写错（实际在右上），论证前提不成立。
- 朱砂/玉青/土黄各自承担 3–4 种语义，颜色过载。
- 缺警报、生产队列、空闲农人、人口卡满、建造时间/占地/前置、暂停/失败等 RTS 必需态。
- 噪点 + 混合模式 + 全屏 blur + `backdrop-filter`，在手机上有明显性能风险。

**如果只能改三件事**：

1. 把 1920 画布换成 dp 布局（640×360dp 起，HUD 锚点 + 安全区）。
2. 把 hover 换成触屏状态机（56dp、按下/禁用/冷却/撤销、命令盘右下）。
3. 把 9–10px 灰字提到 12sp、4.5:1 以上。

详见 [06-case-review.md](06-case-review.md)。

---

## 与本仓库其他文档的关系

- [docs/ui/UI-SPEC.md](file:///D:/work/RTS小游戏/docs/ui/UI-SPEC.md)：现有视觉契约与高保真稿说明。本资料把它当案例，不修改它。
- [docs/ui/ui-a.html](file:///D:/work/RTS小游戏/docs/ui/ui-a.html)：可交互的六状态稿。第 06 章逐条对照。
- [docs/DESIGN-v2.md](file:///D:/work/RTS小游戏/docs/DESIGN-v2.md)：玩法与系统设计。UI 的信息清单应从这里来。
- [docs/guide/04-touch-interaction.md](file:///D:/work/RTS小游戏/docs/guide/04-touch-interaction.md)：触屏交互的程序侧方案。第 03 章是设计侧对应。
- [docs/guide/11-readability.md](file:///D:/work/RTS小游戏/docs/guide/11-readability.md)：战场可读性的程序/美术侧方案。第 02 章是设计侧对应。

原则：**UI-SPEC 是视觉契约，DESIGN-v2 是玩法契约，guide 是工程契约。三者冲突时，先对齐，再改稿。**

---

## 怎么用这套资料练

不要“看完再动手”，按项目题做：

1. **入门**：复刻资源栏 → 手机横屏版 → 德望三状态 → 12 图标 → 在 Phaser/HTML 跑起来。
2. **进阶**：触屏指令盘 → 建造菜单渐进披露 → 战斗反馈链 → 50 单位可读性 → 六状态原型落地两个。
3. **精通**：设计系统 → 30% 减法 → 三阵营换肤 → 数据驱动改版 → 技术选型与性能预算。

每题都有验收标准，见 [04-skill-levels.md](04-skill-levels.md)。验收要三样证据：作品、测量、复盘。

---

## 说明与边界

- 文中价格/授权只用于量级判断，采购前以官网为准。
- 行业作品的布局与设计意图，部分来自实际游玩和公开资料，属于分析；涉及具体版本时以游戏当前版本为准。
- 性能数字（draw call、帧耗时、纹理内存）是经验目标，不是绝对标准；关键是建立基线并做回归。
- 本资料只新增 `docs/design/`，不修改现有文件，不做 git commit / push。

---

## 文件清单

```
docs/design/
├── README.md
├── 01-toolchain.md
├── 02-information-and-readability.md
├── 03-touch-and-adaptation.md
├── 04-skill-levels.md
├── 05-engineering.md
├── 06-case-review.md
└── 07-industry-reference.md
```
