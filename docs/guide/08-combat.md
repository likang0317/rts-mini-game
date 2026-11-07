# 08 战斗结算：攻击间隔、伤害、护甲与索敌

## 先说清楚：战斗一行代码都没有

`MainScene.ts` 里没有 hp 以外的战斗概念。每个单位有一个绿色血条（`createUnit()` L102），但它永远满格——没有 `hp` 字段，没有伤害，没有死亡。

`DESIGN-v2.md` 也只给了造价（3.3），**没给血量、攻击力、护甲、攻速、射程**。这一章的数字都是我给的起步值，标了"经验值"的你可以直接改。

## 一个单位需要哪些战斗字段

```ts
// src/game/sim/unit.ts
export interface CombatStats {
  hp: number;
  maxHp: number;
  damage: number;
  armor: number;
  /** 攻击间隔，逻辑帧数（60Hz 下 72 = 1.2 秒） */
  attackInterval: number;
  /** 射程，像素（48 = 1 格） */
  range: number;
  /** 索敌半径，像素；比射程大 */
  acquireRange: number;
}

export interface UnitState {
  // ...第 03 章那些
  hp: number;
  nextAttackTick: number;   // 下一次可攻击的帧号
  targetId: number | null;
  lastTargetTick: number;   // 用于目标黏性
}
```

**攻击间隔用帧数，不用秒。** 用秒就要每帧做浮点减法，累积误差会让两台设备的攻击节奏漂移，而且和固定步长（第 02 章）冲突。

## 伤害公式：两种，选一种

### 方案 A：减法护甲

```ts
damage = Math.max(1, attacker.damage - defender.armor);
```

- 优点：玩家一眼能算清"我 14 攻，他 3 甲，一下打 11"。
- 缺点：高攻低甲时会溢出，低攻高甲时收益断崖。数值范围要控制好。

### 方案 B：百分比减伤

```ts
damage = attacker.damage * (100 / (100 + defender.armor));
```

- 优点：数值平滑，不会出现"1 点伤害"的尴尬。
- 缺点：玩家算不清，需要 UI 显示"减伤 23%"。

**建议用 A（减法），并且设最低 1 点。** 你的单位种类少（农人/族兵/弓手/精英），减法足够表达克制关系，而且符合"符号化、可读"的美术方向（`DESIGN-v2.md:7.1`）。

## 一组起步数值（经验值）

| 单位 | HP | 攻击 | 护甲 | 间隔 | 射程 | 造价（文档） |
| --- | --- | --- | --- | --- | --- | --- |
| 农人 | 40 | 5 | 0 | 1.5s | 1 格 | 50 谷 |
| 族兵 | 90 | 16 | 3 | 1.2s | 1 格 | 60 谷 |
| 弓手 | 55 | 11 | 1 | 1.5s | 4 格 | 70 谷 + 10 玉 |
| 精英 | 160 | 24 | 5 | 1.4s | 1 格 | 100 谷 + 25 玉 |

算一下击杀时间（TTK）：

- 族兵打农人：`16 - 0 = 16`，40 / 16 = 3 下，`3 × 1.2 = 3.6 秒`。
- 族兵打族兵：`16 - 3 = 13`，90 / 13 = 7 下，`7 × 1.2 = 8.4 秒`。
- 弓手打族兵：`11 - 3 = 8`，90 / 8 = 12 下，`12 × 1.5 = 18 秒`——太慢，弓手需要 3-4 个一组才有威胁，这符合"远程靠数量"的设计。
- 族兵打精英：`16 - 5 = 11`，160 / 11 = 15 下，18 秒——精英确实难杀。

**RTS 的近战 TTK 一般控制在 5-10 秒**（经验值）。低于 3 秒会变成"谁先手谁赢"，高于 15 秒会变成"互相挠痒"。上面这组数大致在这个区间。

## 攻击循环：用 tick 判定，不要用计时器

```ts
function updateCombat(u: UnitState, state: GameState): void {
  const target = u.targetId != null ? state.unitsById.get(u.targetId) : null;

  // 1. 目标没了 / 死了 / 跑太远 → 放弃
  if (!target || target.hp <= 0 || dist(u, target) > u.stats.acquireRange * 1.5) {
    u.targetId = null;
  }

  // 2. 索敌（不要每帧都做，见下）
  if (u.targetId == null && state.tick % 15 === 0) {
    u.targetId = findTarget(u, state);
  }

  if (u.targetId == null) return;

  // 3. 射程内且冷却好了 → 攻击
  if (dist(u, target) <= u.stats.range && state.tick >= u.nextAttackTick) {
    state.damageEvents.push({ from: u.id, to: target.id, amount: calcDamage(u, target) });
    u.nextAttackTick = state.tick + u.stats.attackInterval;
  }
}
```

注意几个细节：

- **`nextAttackTick` 用帧号**，不是 `cooldown -= dt`。后者在掉帧时会漂移。
- **索敌不是每帧做**。每 15 帧（0.25 秒）一次，100 个单位也就每帧 6-7 次查询。
- **脱战半径**是 `acquireRange × 1.5`，不是无限追。没有这个，单位会追着敌人跑遍全图。

## 目标选择：优先级 + 黏性

简单版优先级：

1. 正在攻击我的敌人（自卫优先）。
2. 最近的敌人。
3. 血量最低的敌人（集火）。

**但不要每帧重新选。** 每帧重选会导致"目标抖动"：两个敌人距离差不多，单位在两者之间来回转头，一下都打不出去。

两个机制解决：

- **黏性**：一旦选定，至少保持 1 秒（60 帧），除非目标死亡或超出脱战半径。
- **迟滞**：新目标的距离要比当前目标近 20% 才换。

```ts
function shouldSwitch(u: UnitState, current: UnitState, candidate: UnitState): boolean {
  if (current.hp <= 0) return true;
  if (dist(u, candidate) < dist(u, current) * 0.8) return true;
  if (candidate.id === u.lastAttackerId) return true;   // 被打优先还手
  return false;
}
```

## 两段式结算：不要边打边扣血

最典型的 bug：单位 A 打死 B，B 在同一帧也打出了伤害，因为 B 的更新在 A 之后、`hp` 还没扣到 0。

正确顺序：

```ts
function resolveCombat(state: GameState): void {
  // 阶段 1：所有单位决定"这帧打不打、打谁"，只写 damageEvents
  for (const u of state.units) updateCombat(u, state);

  // 阶段 2：统一结算伤害（先算总伤害，避免过杀）
  const incoming = new Map<number, number>();
  for (const e of state.damageEvents) {
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + e.amount);
  }
  for (const [id, dmg] of incoming) {
    const t = state.unitsById.get(id);
    if (t) t.hp -= dmg;
  }

  // 阶段 3：清理死亡
  state.units = state.units.filter(u => u.hp > 0);
  state.damageEvents.length = 0;
}
```

三个阶段分开，顺序就不会影响结果。这也是第 02 章说的"累加顺序"的具体应用。

## 过杀（overkill）：远程齐射的通病

5 个弓手同时打一个 40 血的农人，每人 11 点，总伤害 55。前 4 个就够打死，第 5 个的伤害浪费了——更糟的是，如果目标已经死了，第 5 个还会"鞭尸"或者卡住。

三种处理：

1. **算总伤害前先看血量**：`incoming` 累计到目标当前 hp 就停止分配（简单，但会让部分单位"白打"）。
2. **目标预约**：每个目标记录"已被预约的伤害"，新单位索敌时跳过预约已满的目标。复杂，但效果好。
3. **不处理**。前期单位少，过杀不明显。等有 10 个以上远程单位再说。

**建议 v0.1 用 3，v0.2 用 1。** 不要一上来做预约表。

## 常见 bug 清单

| 现象 | 原因 | 修法 |
| --- | --- | --- |
| 单位一边走一边打 | 攻击逻辑没检查"是否在移动" | 攻击时锁移动，或允许移动射击但降低命中 |
| 追到天涯海角 | 没有脱战半径 | `acquireRange × 1.5` |
| 两个单位互相穿过 | 没有软避让 | 第 07 章的分离力 |
| 打死了还在打 | 目标引用没清 | 每帧检查 `hp <= 0` |
| 一队兵同时转火，伤害全溢出 | 过杀 | 预约或总量截断 |
| 远程隔墙射击 | 没有视线检查 | 射程内做 Bresenham 遮挡检查 |
| 攻击间隔忽快忽慢 | 用 `dt` 累加冷却 | 用 `nextAttackTick` |
| 单位死亡后血条还在 | 渲染层没同步删除 | `syncViews()` 的删除分支（第 03 章） |

## 追击与攻击移动

两种指令要分开：

- **攻击**（点敌人）：走到射程内，停下打，目标死了就停。
- **攻击移动**（点地面）：往目标点走，途中遇到敌人就停下打，打完继续走。

手机上"攻击移动"需要一个独立按钮，因为 tap-tap 的默认语义是移动。放在命令卡第二排，图标用"剑 + 箭头"。

**不要做"自动攻击移动"**：玩家点地面就自动打沿途敌人，会导致"我只想撤退，结果部队停下来打架"。

## 战斗可读性（第 11 章展开）

战斗系统做完后，玩家要能一眼看出：

- 谁在打谁（攻击目标有细线或朝向）。
- 谁快死了（血条变红 + 闪烁）。
- 谁在挨打（受击闪白，持续 100ms）。
- 伤害数字（可选，单位多了会刷屏，建议只显示暴击/大伤害）。

这些都不是"特效"，是**信息**。没有它们，玩家会觉得"打起来了但看不懂"。

## 自检

- [ ] 3 个族兵打 5 个农人，10 秒内结束，农人不会站着不动挨打。
- [ ] 目标死亡后，攻击者立刻停止，不"鞭尸"。
- [ ] 单位追出 1.5 倍索敌半径后放弃。
- [ ] 攻击间隔稳定，不随帧率变化。
- [ ] 两个单位近战不会互相穿过。
- [ ] 远程单位隔墙不能射击。

## 一句话总结

**战斗的难点不是伤害公式，是"什么时候打、打谁、打完怎么办"。** 把这三件事的时序定死，数值才有意义。
