# 06 寻路：A\*、堵路与局部避让

## 为什么现在还没问题

`updateUnits()`（`MainScene.ts:246-264`）是直线移动：算角度，`cos/sin` 走一步。地图是 40×30 的空网格（`MainScene.ts:3-7`），没有任何阻挡，所以怎么走都对。

一旦有了建筑和资源点，直线移动就会出现三种情况：

1. 撞墙后原地抖动（目标在墙后，永远走不到）。
2. 从两个建筑之间"擦"过去，视觉上穿模。
3. 一队兵全部沿同一条直线走，末端堆成一坨。

**寻路不是"让单位聪明"，是"让单位不违反地图规则"。**

## 网格寻路的基本模型

把地图离散成格子，每格两种状态：可走 / 不可走。

```ts
// src/game/map/terrain.ts
export const WALKABLE = 0;
export const BLOCKED = 1;

export interface Terrain {
  cols: number;
  rows: number;
  tiles: Uint8Array;       // 长度 cols * rows，WALKABLE / BLOCKED
  index(x: number, y: number): number;
}
```

现在 `drawMap()`（`MainScene.ts:67-86`）只画了线，没有数据。**先有数据，再有寻路**；否则你会在渲染代码里到处 `if (x === 12)`。

建筑占位也要进这张表：放置建筑时把覆盖的格子标 `BLOCKED`，拆除时恢复。注意现在 `createBase()`（L88-95）画的是 2.5 格宽（120px），**没有对齐网格**——这是第 07 章要修的坐标问题。

## A\* 的要点

A\* 不复杂，容易写错的是四件事。

### 1. 启发函数要与移动方式匹配

八方向移动用 **octile 距离**：

```ts
function heuristic(x: number, y: number, gx: number, gy: number): number {
  const dx = Math.abs(x - gx);
  const dy = Math.abs(y - gy);
  return 10 * (dx + dy) + (14 - 20) * Math.min(dx, dy);
  // 直走代价 10，斜走代价 14（≈10√2）
}
```

四方向用曼哈顿距离。**用欧氏距离配四方向、或用曼哈顿配八方向，都会让寻路变慢或走歪。**

### 2. 禁止斜穿墙角

八方向最容易出的 bug：两个对角方向都是墙，但斜着穿过去了，视觉上从墙缝里钻出来。

```ts
// 从 (x,y) 走向 (nx,ny)，如果是斜向，要求两个相邻正交格都可走
if (nx !== x && ny !== y) {
  if (!walkable(nx, y) || !walkable(x, ny)) continue;
}
```

### 3. 用开放列表的正确结构

小地图（1200 格）用"每次线性扫最小 f"也能跑，但单位一多就慢。写一个二叉堆，20 行：

```ts
class MinHeap<T> {
  private a: T[] = [];
  constructor(private less: (x: T, y: T) => boolean) {}
  push(v: T) { this.a.push(v); this.up(this.a.length - 1); }
  pop(): T | undefined {
    const top = this.a[0];
    const last = this.a.pop();
    if (this.a.length && last) { this.a[0] = last; this.down(0); }
    return top;
  }
  get size() { return this.a.length; }
  private up(i: number) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(this.a[i], this.a[p])) break;
      [this.a[i], this.a[p]] = [this.a[p], this.a[i]];
      i = p;
    }
  }
  private down(i: number) {
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let m = i;
      if (l < this.a.length && this.less(this.a[l], this.a[m])) m = l;
      if (r < this.a.length && this.less(this.a[r], this.a[m])) m = r;
      if (m === i) break;
      [this.a[i], this.a[m]] = [this.a[m], this.a[i]];
      i = m;
    }
  }
}
```

### 4. 路径要平滑

A\* 出来的是"格子中心点的折线"，单位走起来会一顿一顿。用**视线拉直**（string pulling）：从当前点出发，尽量连到最远的、中间无阻挡的点。

```ts
function smooth(path: Vec2[], walkableLine: (a: Vec2, b: Vec2) => boolean): Vec2[] {
  const out: Vec2[] = [];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !walkableLine(path[i], path[j])) j--;
    out.push(path[j]);
    i = j;
  }
  return out;
}
```

`walkableLine` 用 Bresenham 逐格采样即可。

## 为什么多单位会堵成一团

这是 RTS 寻路真正的难点，不是 A\* 本身。

假设 20 个单位从基地出发，目标同一片区域。每个单位独立跑 A\*，得到的路径几乎一样（网格只有那么几条通路）。于是：

1. **入口只有一个格子**，20 个单位同时挤进去，互相推挤。
2. **没有动态代价**，先到的单位不会"让路"，后到的继续往同一个格子走。
3. **没有局部避让**，单位之间可以重叠，视觉上像一坨。

三种解法，按成本排：

### 解法 1：槽位 + 分离力（先做这个）

- 目标点用第 05 章的槽位分配，不要所有单位同一个点。
- 每帧给单位加一个"互相推开"的力：

```ts
// 只对距离 < 半径和的单位对生效
const push = (minDist - dist) * 0.5;
u.x -= nx * push;
u.y -= ny * push;
```

分离力要**小**，否则队伍会像爆炸一样散开。经验值：每帧最多推 0.5-1px。

### 解法 2：流场（30 个单位以上）

对同一个目标点，做一次反向 BFS（从目标扩散），得到每格的"下一步方向"。所有单位共享这张表，不再各自跑 A\*。

- 优点：一次计算，N 个单位共享；不会出现"20 条不同路径"。
- 缺点：只适合同一目的地；目标变了要重算；窄口仍然会堵（物理上就那么大）。

### 解法 3：预约表 / 时间窗（不建议现在做）

给每个格子记录"谁在什么时候占用"，单位排队通过。这是正经 RTS 的做法，但实现复杂、容易死锁，单人项目不值得。

**建议路线：v0.1 用槽位 + 分离力；单位超过 30 再用流场。** `DESIGN-v2.md:9.5` 也写了"M2 若单位 >30 再上网格 A\*"，方向一致，但顺序要反过来——先有槽位和分离，再谈 A\*，否则 A\* 只会让所有人更快地挤到一起。

## 性能：A\* 不是免费的

40×30 = 1200 格。一次最坏情况的 A\* 大约扩展几百到一千个节点，在 JS 里 **0.1-0.5ms**（经验值，取决于实现和浏览器）。听起来很少，但：

- 20 个单位同一帧寻路 = **2-10ms**，直接吃掉 60fps 预算的一半。
- 100 个单位 = **10-50ms**，一帧卡死。

所以必须**分帧**：

```ts
const PATH_BUDGET_PER_TICK = 2;   // 每逻辑帧最多算 2 条

function processPathRequests(state: GameState) {
  let done = 0;
  while (done < PATH_BUDGET_PER_TICK && state.pathQueue.length) {
    const req = state.pathQueue.shift()!;
    req.unit.path = findPath(req.from, req.to);
    done++;
  }
}
```

配套两条：

- **路径缓存**：`Map<"sx,sy,gx,gy", Vec2[]>`，同起点终点直接复用。缓存要在地图变化（建筑建成/拆除）时清空。
- **失败降级**：找不到路时不要每帧重试，标记 `pathFailedAt = tick`，隔 30 帧再试一次。

## 什么时候不该用 A\*

- **单位在地图外/目标不可走**：直接拒绝，不要跑 A\*。
- **直线可达**：先用 Bresenham 检查视线，能直走就不寻路。这一步能省掉 80% 的计算（经验值）。
- **同一帧大量单位收到同一目标**：先合并请求，用流场或槽位，不要逐个跑。

## 和渲染无关

寻路结果只应该是"一串世界坐标"，放在 `src/game`。**不要在 A\* 里 `this.add.circle` 画路径**，那是调试代码，用 `if (DEBUG_PATH)` 包起来，发布前删掉。

## 自检

- [ ] 40×30 地图上放 3 个建筑，单位能绕过去，不穿墙。
- [ ] 斜向移动不会穿过两个对角墙的缝隙。
- [ ] 20 个单位走到同一区域，5 秒内散开站定，不永久抖动。
- [ ] 100 个单位同时下令，单帧不出现 > 20ms 的长任务（DevTools 看）。
- [ ] 地图加一栋建筑后，旧路径缓存失效。

## 一句话总结

**A\* 解决"怎么绕过墙"，槽位和分离力解决"怎么不挤在一起"。** 后者才是玩家感知到的"寻路好不好"。
