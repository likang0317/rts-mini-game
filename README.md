# RTS小游戏

浏览器端 2D 即时战略小游戏，基于 Vite + TypeScript + Phaser 3，纯前端、单页运行。

当前仓库处于 **M1 之前的骨架阶段**：可运行的地图、镜头、选择与移动，暂未实现资源采集、生产与战斗。完整玩法方案见 [docs/DESIGN.md](docs/DESIGN.md)。

## 运行

```bash
npm install
npm run dev      # 本地开发，默认 http://localhost:5173
npm run build    # 类型检查 + 生产构建
npm run preview  # 预览构建产物
```

## 当前可玩内容

- 40 × 30 网格地图，中央浅水带
- 左键点击 / 拖拽框选己方单位，Shift 加选
- 右键下达移动指令（3 个占位单位方块）
- WASD / 方向键平移镜头，滚轮缩放，中键拖动，H / 空格回基地
- 左上角 HUD 操作提示与选中数量

## 目录

```
src/
├── main.ts              # Phaser 启动配置
└── scenes/
    └── MainScene.ts     # 地图、镜头、选择与移动
docs/DESIGN.md           # 玩法与技术设计文档（待确认）
```

## 后续里程碑

- M1 可玩骨架：采矿、基地造工人、HUD 资源显示
- M2 战斗：士兵、兵营、炮塔、AI、胜负判定
- M3 内容扩充：远程单位、小地图、平衡、音效，可选部署 GitHub Pages
