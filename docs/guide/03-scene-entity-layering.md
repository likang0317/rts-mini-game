# 03 场景、实体与逻辑分层

## Phaser 的心智模型，一句话版本

`Game` 持有若干 `Scene`；`Scene` 有一个显示列表（display list），你 `this.add.xxx(...)` 加进去的东西都在这条列表上，每帧由渲染器按 `depth` 画一遍；`Scene.update()` 每帧被调用一次。

就这些。Phaser 没有"实体"概念，没有内置 ECS，也不规定你怎么组织数据。**你现在组织数据的方式，会成为后面所有 bug 的来源。**

## 现在这 280 行里混了五件事

打开 `src/scenes/MainScene.ts`，同一个类里同时住着：

1. **仿真状态**：`units`、`selected`、每个单位的 `target`（L21-22、L12-17）
2. **仿真规则**：怎么算移动（L246-264）、怎么判定框选命中（L189-213）、怎么分配目标点（L230-244）
3. **渲染**：`body` / `ring` / `hpBar` 三个 `Rectangle`（L97-104）
4. **输入**：指针事件、键盘（L106-149）
5. **UI**：一段文本（L151-163）

这五件事的变更频率完全不同：UI 天天改，规则一周改一次，状态结构一个月改一次。混在一起的结果是，你想调一个 HUD 位置，得先读懂寻路代码。

## 一个单位的"本体"和"外观"是两回事

看 `MainScene.ts:12-17`：

```ts
interface Unit {
  body: Phaser.GameObjects.Rectangle;
  ring: Phaser.GameObjects.Rectangle;
  hpBar: Phaser.GameObjects.Rectangle;
  target: Phaser.Math.Vector2 | null;
}
```

这个结构把 **一个单位的三块画** 和 **一个单位的意图** 塞进同一个对象。它带来三个具体麻烦：

- 逻辑层一旦要跑"没有画面的仿真"（单元测试、AI 快速推演、回放），就得构造假的 Rectangle。
- 想加第四块画（比如士气条、负重图标），逻辑代码要跟着改。
- 想换渲染方式（从 Rectangle 换成 Sprite），`target` 这种纯逻辑字段会被迫搬家。

正确的切法：

```ts
// src/game/sim/GameState.ts —— 不含任何 Phaser 类型
export interface UnitState {
  id: number;            // 稳定 id，遍历/排序都靠它
  kind: 'peasant' | 'warrior' | 'archer';
  x: number; y: number;  // 世界坐标（像素）
  hp: number; maxHp: number;
  order: Order | null;   // 移动/采集/攻击
  facing: number;        // 弧度，给渲染用
}

export interface GameState {
  tick: number;          // 逻辑帧号，从 0 递增
  units: UnitState[];    // 按 id 升序，永不重排
  resources: { gu: number; wood: number; stone: number; jade: number };
  legitimacy: number;    // 德望
}
```

渲染层单独维护映射：

```ts
// src/scenes/WorldScene.ts
type UnitView = {
  body: Phaser.GameObjects.Rectangle;
  ring: Phaser.GameObjects.Rectangle;
  hpBar: Phaser.GameObjects.Rectangle;
  lastHp: number;
};

private views = new Map<number, UnitView>();

private syncViews(s: GameState): void {
  // 1. 新增
  for (const u of s.units) {
    if (!this.views.has(u.id)) this.views.set(u.id, this.createView(u));
  }
  // 2. 删除（反向遍历，边删边遍历会漏）
  for (const id of [...this.views.keys()]) {
    if (!s.units.some(u => u.id === id)) {
      this.destroyView(this.views.get(id)!);
      this.views.delete(id);
    }
  }
  // 3. 摆位
  for (const u of s.units) {
    const v = this.views.get(u.id)!;
    v.body.setPosition(u.x, u.y);
    v.ring.setPosition(u.x, u.y).setVisible(this.selected.has(u.id));
    v.hpBar.setPosition(u.x, u.y - 21);
    if (u.hp !== v.lastHp) {          // 只在变化时重建血条宽度
      v.hpBar.width = 30 * (u.hp / u.maxHp);
      v.lastHp = u.hp;
    }
  }
}
```

这一段就是"逻辑/渲染分离"的全部：**逻辑只产出状态，渲染只读状态**。没有回调、没有事件、没有观察者模式。RTS 的单位数上千时，这种"每帧全量比对"反而最稳最快——因为它没有隐藏的失效路径。

## 边界的判断标准

一句话：**这段代码能不能在 Node 里跑，且不需要 `document` / `window` / `Phaser`？**

能 → 放 `src/game`。不能 → 放 `src/scenes` 或 `src/ui`。

再给几条更具体的红线：

| 想在逻辑层做的事 | 怎么办 |
| --- | --- |
| 播一个受击特效 | 逻辑层只记 `hitFlashTick = tick`，渲染层看到就播 |
| 播放音效 | 同上，逻辑层产出"本帧事件列表"，渲染层消费 |
| 读屏幕尺寸决定行为 | 不允许。行为参数只能来自配置 |
| 用 `Math.random()` | 换成 `state.rng()` |

## 一个真实的坑：`setScrollFactor(0)` 挡不住缩放

`MainScene.ts:161` 用了 `.setScrollFactor(0)` 让 HUD 跟着相机不动。这解决的是**滚动**，但**没解决缩放**——`MainScene.ts:145-148` 里缩放改的是 `cam.zoom`（桌面滚轮、手机捏合都走这里），而相机缩放会作用于该相机渲染的**所有**对象，包括 `scrollFactor = 0` 的。

也就是说：你现在把画面放大到 1.5 倍，左上角那行 HUD 文字会跟着变模糊、变大、并可能超出屏幕。这是当前代码里肉眼可见的问题，捏合两下就能看到。

正规解法是**拆场景**：

```ts
// main.ts
scene: [WorldScene, UIScene]

// WorldScene.create()
this.scene.launch('UIScene');   // 并行运行，不是替换

// UIScene
constructor() { super({ key: 'UIScene', active: false }); }
```

两个场景各自有独立相机，`UIScene` 的相机不缩放、不滚动，世界怎么动都影响不到它。这也是 `DESIGN-v2.md:9.2` 写的方向（"单场景 → 拆分 WorldScene + UIScene"），代码还没做。

注意 `scene.launch` 与 `scene.start` 的区别：`start` 会停掉当前场景再启动目标场景，`launch` 是并行。HUD 要的是 `launch`。

## 什么时候该用 Container

Phaser 的 `Container` 能把多个 GameObject 组成一个整体移动。听起来很适合"单位 = 本体 + 血条 + 选中圈"。

不建议。原因：

- 每个 Container 都是一次额外的矩阵变换，几百个单位时开销明显。
- Container 内的坐标是相对坐标，做世界空间判定时要来回换算，容易错。
- 销毁 Container 时要手动清子对象，容易泄漏。

RTS 的标准做法是**不用容器，按 id 手动摆位**（上面 `syncViews` 那样），血条和选中圈的偏移写死在渲染层。简单、快、好调试。

## 数据驱动：数值不要写在场景里

现在 `UNIT_SPEED = 140`、`TILE_SIZE = 48`、`HOME_TILE = {8,21}` 全是文件顶部的常量（`MainScene.ts:3-10`）。这一步先这样没问题。

但从"加第二种单位"开始，就必须把它们挪进数据表：

```ts
// src/game/data/units.ts
export const UNIT_DEFS = {
  peasant:  { name: '农人', hp: 40,  speed: 110, cost: { gu: 50 },  buildTime: 12 },
  warrior:  { name: '族兵', hp: 90,  speed: 130, cost: { gu: 60 },  buildTime: 18 },
  archer:   { name: '弓手', hp: 55,  speed: 120, cost: { gu: 70, jade: 10 }, buildTime: 20 },
} as const;
```

注意 `DESIGN-v2.md:3.3` 只给了造价，**没有给血量、攻击、攻速、建造时间**。这些数你现在必须自己定，第 10 章会给一套推法。

好处不只是"好改"：平衡表集中在两个文件里，你可以写脚本读出来做模拟（第 15 章），也可以将来换成 JSON 让策划改。

## 自检清单

- `src/game/` 下 `grep -r "phaser"` 应该无结果（类型导入除外）。
- 注释掉整段 `syncViews`，游戏逻辑照常跑（画面不动）。
- 把 `Rectangle` 换成 `Sprite` 时，只改渲染层文件。
- 主场景文件行数不再随功能增长而线性膨胀（目标是每个系统 100-200 行）。

## 一句话总结

**状态是数据，画是投影。** 你现在写的 `Unit` 让两者纠缠，越早拆开越省事。
