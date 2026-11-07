# 07 地图、资源点与空间查询

## 现在的地图只是一张画

`drawMap()`（`MainScene.ts:67-86`）画了底色、一条浅水带、网格线。**没有任何数据结构**。所有"地图"信息都在渲染调用里，这意味着：

- 你无法回答"这个格子能不能走"。
- 你无法放资源点，因为资源点需要坐标、储量、类型。
- 你无法做范围查询，比如"以这个单位为中心 4 格内有哪些敌人"。

第 06 章的 A\* 需要 `walkable(x, y)`，所以这一章必须先把地图变成数据。

## 坐标约定：先定死，再写代码

现在代码里有两套约定，而且**不一致**：

- 单位：`createUnit()` 用 `tileX * TILE_SIZE + TILE_SIZE / 2`（L98-99）——**格中心**。
- 基地：`createBase()` 用 `tileX * TILE_SIZE`（L89-90）——**格左上角**。

结果就是：基地和单位差半个格子。看起来只是"基地偏了一点"，但到了建造放置、占位判定、寻路时，这半个格子会变成"明明点在空地上却提示被占用"。

**统一约定（建议）：**

- 世界坐标原点在左上角，单位用浮点像素。
- 格子 `(tx, ty)` 的左上角是 `(tx * 48, ty * 48)`，中心是 `+24`。
- **所有实体逻辑位置一律存中心**。渲染时如果某个图形以左上角为锚点，自己减半，不要在逻辑层补偿。

## 地形数据

```ts
// src/game/map/terrain.ts
export enum Tile {
  Grass = 0,
  ShallowWater = 1,   // 苗蛮不减速，其他 -30%（DESIGN-v2.md:5.4）
  Blocked = 2,        // 建筑、山体
}

export class Terrain {
  readonly cols = 40;
  readonly rows = 30;
  readonly tiles = new Uint8Array(this.cols * this.rows);

  idx(x: number, y: number) { return y * this.cols + x; }

  at(x: number, y: number): Tile {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return Tile.Blocked;
    return this.tiles[this.idx(x, y)];
  }

  walkable(x: number, y: number) {
    const t = this.at(x, y);
    return t !== Tile.Blocked;
  }

  /** 世界坐标 → 格坐标 */
  toTile(wx: number, wy: number) {
    return { tx: Math.floor(wx / 48), ty: Math.floor(wy / 48) };
  }
}
```

`Uint8Array` 而不是对象数组：1200 格用对象数组会产生 1200 个小对象，GC 压力没必要。地图大了更明显。

现在那条浅水带（L72-74）应该变成 `Tile.ShallowWater`，而不是只画一条半透明矩形。

## 资源点

`DESIGN-v2.md:3.4` 给了四种采集规则，但代码里一个都没有。资源点是一个带储量的实体：

```ts
// src/game/map/nodes.ts
export type ResourceKind = 'farm' | 'wood' | 'stone' | 'jade';

export interface ResourceNode {
  id: number;
  kind: ResourceKind;
  tx: number;
  ty: number;
  /** 剩余储量；农田为 Infinity */
  amount: number;
  /** 交互半径（格），玩家点这个范围内就算点到 */
  radius: number;
}
```

按设计文档的数字硬编码一张初始表（数值来自 `DESIGN-v2.md:3.4`）：

| 类型 | 单趟产出 | 单程耗时 | 储量 | 备注 |
| --- | --- | --- | --- | --- |
| 农田 | 持续产出 | —— | 无限 | **文档没给产率，必须自己定** |
| 林地 | 10 木 | 约 3 秒 | 可再生（60 秒 +20） | 首版 |
| 石场 | 8 石 | 约 4 秒 | 800 | 采完枯竭 |
| 玉山 | 10 玉 | 约 4 秒 | 800 | 采完枯竭 |

**注意"单程耗时"不是"采集周期"**。一个完整回环 = 去程 + 采集动作 + 回程 + 卸货。文档只给了去/回，采集动作耗时没写（第 09 章会给一个经验值）。

## 占位：建筑和单位是两种碰撞

不要用一套碰撞搞定所有东西。

### 建筑：硬占位

建筑覆盖的格子直接标 `Blocked`。这样 A\* 天然绕开，不需要额外碰撞检测。

问题在于**建筑尺寸不一定是整数格**。现在基地是 2.5 格（120px），放下去必然压住半格。两个选择：

1. 把建筑尺寸改成整数格（推荐）。基地 3×3，祭坛 2×2，民居 1×1。
2. 保留非整数尺寸，但占位按 `Math.ceil` 向上取整，代价是视觉上建筑边缘会"多吃"一格。

**建议选 1。** 网格游戏里，所有占地都应该是整数格，否则放置预览、寻路、范围查询三处都要处理小数。

### 单位：软避让，不是硬碰撞

单位之间不要做"撞上就停"的硬碰撞。RTS 的单位需要能互相穿过一点、再被推开，否则一队兵会在门口卡死。

```ts
// 每帧一次，O(n²)；n < 200 时可以接受
for (let i = 0; i < units.length; i++) {
  for (let j = i + 1; j < units.length; j++) {
    const dx = units[j].x - units[i].x;
    const dy = units[j].y - units[i].y;
    const d2 = dx * dx + dy * dy;
    const min = 20;                    // 两个单位的最小间距（像素）
    if (d2 > 0 && d2 < min * min) {
      const d = Math.sqrt(d2);
      const push = (min - d) * 0.5;
      const nx = dx / d, ny = dy / d;
      units[i].x -= nx * push;
      units[i].y -= ny * push;
      units[j].x += nx * push;
      units[j].y += ny * push;
    }
  }
}
```

200 单位 = 19,900 次距离比较/帧，JS 里大约 0.2-0.5ms（经验值），可以接受。超过 300 再上空间分区。

## 空间查询：先别急着上四叉树

RTS 最常见的查询是：

- 框选：矩形内有哪些单位。
- 攻击范围：以某点为中心，半径 R 内有哪些敌人。
- 采集：最近的同类型资源点。

**1200 格、100 单位以内，暴力遍历完全够。** 100 个单位做一次范围查询 = 100 次距离比较，一帧做 50 次也就 5000 次，微不足道。

什么时候需要空间分区：

- 单位 > 300，且每帧有大量范围查询（比如每个单位都在索敌）。
- 这时用**均匀网格**（uniform grid），格子大小取 3-4 个 tile，把单位 id 挂到格子里。查询时只遍历覆盖的格子。

不要上四叉树。均匀网格在 RTS 这种分布相对均匀、单位会移动的场景里更快也更好写。

```ts
// 均匀网格的骨架
class SpatialGrid {
  private cells = new Map<number, number[]>();  // cellKey -> unitId[]
  constructor(private cellSize: number, private cols: number) {}

  key(x: number, y: number) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return cy * this.cols + cx;
  }

  insert(id: number, x: number, y: number) {
    const k = this.key(x, y);
    let list = this.cells.get(k);
    if (!list) this.cells.set(k, (list = []));
    list.push(id);
  }

  clear() { this.cells.clear(); }   // 每帧重建，比增量维护简单且不易错
}
```

每帧重建（清空 → 全部插入）比"移动时从旧格子删、往新格子加"简单得多，而且不容易泄漏。1000 个单位重建一次也就 1000 次插入。

## 手机屏幕到底能看多少格

这是很容易被忽略的一件事。

把手机构成横屏后，CSS 视口大约是 **800×360**（1080×2400 的机器，DPR 3，横屏后 800×360 CSS px）。Phaser 的相机 `zoom = 1` 时，可视世界范围就是 800×360 像素，也就是：

- 横向 `800 / 48 ≈ 16.7` 格
- 纵向 `360 / 48 ≈ 7.5` 格

**只能看到 16×7 格，对 RTS 来说太窄了。** 你会看不到敌人从哪来，也框不住一队兵。

三个解法：

1. **默认 `zoom = 0.7`**，可视范围变成 23.8×10.7 格，接近桌面 RTS 的视野。现在 `cam.zoom` 的钳制是 0.6-1.5（`MainScene.ts:147`），但初始值是 1，所以开局是"贴脸视角"。
2. **把 tile 从 48 改成 32**，世界变成 1280×960，同样视野下看到 25×11 格。代价是所有美术尺寸要重算。
3. **加大地图**。`DESIGN-v2.md:9.5` 建议 M2 改 48×36（2304×1728），在 zoom 0.7 下看到 23.8×10.7 格，正好。

**建议：先改默认 zoom，再考虑 tile 尺寸。** 改 zoom 是一行代码，改 tile 是全局重算。

## 地图与设计文档对不上的地方

- `DESIGN-v2.md:3.4` 说"所有资源点在小地图上有图标"，但代码没有小地图（`createHud()` 只有一段文本，L151-163）。
- 文档说"敌方资源点可见（无战争迷雾）"，这是好事——省掉一套视野系统，但要在 UI 上让玩家能分辨中立/敌方资源点。
- 文档说"浅水带苗蛮不减速，其他阵营 -30%"，代码只有视觉效果，没有地形数据，也没有阵营概念。

这些都不是 bug，是"还没做"。但你要知道：**地图数据是后面所有系统（采集、建造、寻路、战斗）的前置**，它必须比美术先做。

## 自检

- [ ] 有一个 `Terrain` 实例，能回答任意格子的可走性。
- [ ] 放一个建筑后，对应格子变 `Blocked`，A\* 会绕开。
- [ ] 资源点有类型、储量、坐标，点它能把指令翻译成"采集"。
- [ ] 单位之间不会完全重叠，也不会互相卡死。
- [ ] 开局视野能看到至少 20×10 格。
- [ ] 基地和单位用的是同一套坐标约定（中心点），没有半格偏移。

## 一句话总结

**地图先是数据，再是画。** 你现在的 `drawMap()` 把顺序反了，越早掰回来越省事。
