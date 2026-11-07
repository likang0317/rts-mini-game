# 15 测试与验证：怎么证明你没改坏

## 现在的测试是零

`package.json` 里只有 `dev`、`build`、`preview`，没有测试框架，没有测试文件。`build` 只做 `tsc --noEmit`（类型检查）+ `vite build`，它能抓语法和类型错误，抓不到"农人采完木头卡在原地"。

RTS 的 bug 有两个特点：**复现难、连锁反应多**。改一个移动速度，可能让采集回环慢 20%，进而让祭坛晚 1 分钟，进而让整局节奏崩掉。靠手玩很难发现。

这一章给三层验证：**纯逻辑单测、可重放对局、真机清单**。

## 第一层：纯逻辑单测

前提是第 03 章的分层做了：`src/game` 不依赖 Phaser、不依赖 `window`。做到了，就能在 Node 里跑。

装 vitest：

```bash
npm i -D vitest
```

```json
// package.json
"scripts": {
  "dev": "vite",
  "build": "tsc --noEmit && vite build",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

### 该测什么

不要追求覆盖率，测这五类：

1. **A\***：直线可达、绕墙、不可达、斜角禁止穿墙。
2. **伤害公式**：减法护甲、最低 1 点。
3. **目标点分配**：12 个单位分 12 个槽位，不重复、不落在阻挡格。
4. **采集回环**：一个完整周期后资源增加准确值。
5. **状态哈希**：同样输入跑两遍，哈希一致（下面详述）。

例：

```ts
// src/game/sim/__tests__/gather.test.ts
import { describe, it, expect } from 'vitest';
import { createGame } from '../createGame';
import { step } from '../step';

describe('采集回环', () => {
  it('农人采一趟木，资源准确 +10', () => {
    const state = createGame({ seed: 1 });
    // 把农人放到林地旁边，省掉走路时间
    state.units[0].x = 400; state.units[0].y = 400;
    state.nodes[0] = { id: 1, kind: 'wood', tx: 9, ty: 8, amount: 100, radius: 1 };
    state.units[0].order = { kind: 'gather', nodeId: 1 };

    for (let i = 0; i < 60 * 15; i++) step(state, 1 / 60);

    expect(state.resources.wood).toBe(10);
    expect(state.nodes[0].amount).toBe(90);
  });
});
```

**注意**：测试里不要 `await`、不要定时器、不要真实时间。`step(state, dt)` 是纯函数，跑 900 次是毫秒级的。

## 第二层：可重放对局

这是 RTS 最有价值的测试手段，也是第 02 章确定性的回报。

### 记录什么

```ts
interface Replay {
  version: number;        // 数值表版本，改过就不兼容
  seed: number;           // PRNG 种子
  commands: Array<{
    tick: number;
    player: 0 | 1;
    type: 'move' | 'attack' | 'gather' | 'build' | 'train';
    payload: unknown;
  }>;
  /** 每 60 帧一个状态哈希，用来定位分叉 */
  checkpoints: Array<{ tick: number; hash: number }>;
}
```

**只记录指令，不记录结果。** 位置、血量、资源都是由指令 + 种子推出来的。这是 lockstep 的基础，也是"回放文件只有几 KB"的原因。

### 状态哈希

```ts
function hashState(s: GameState): number {
  let h = 0x811c9dc5;                       // FNV-1a
  const mix = (n: number) => {
    h ^= n & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (n >>> 8) & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (n >>> 16) & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (n >>> 24) & 0xff; h = Math.imul(h, 0x01000193);
  };

  mix(s.tick);
  mix(s.units.length);
  for (const u of s.units) {                // 必须按 id 升序
    mix(u.id);
    mix(Math.round(u.x * 1000));            // 量化到千分之一像素
    mix(Math.round(u.y * 1000));
    mix(u.hp);
  }
  mix(s.resources.grain);
  mix(s.resources.wood);
  mix(s.resources.stone);
  mix(s.resources.jade);
  mix(s.legitimacy);
  return h >>> 0;
}
```

三个细节：

- **按 id 升序**，不能依赖数组当前顺序。
- **量化浮点**。`Math.round(x * 1000)` 把 0.0001 的差异过滤掉，否则你会被正常的浮点抖动淹没。
- **包含所有影响玩法的状态**：资源、德望、人口、冷却、目标 id。漏一个，哈希就测不出那部分的 bug。

### 怎么用

```ts
// 录制时
replay.checkpoints.push({ tick: state.tick, hash: hashState(state) });

// 重放时
for (let i = 0; i < replay.checkpoints.length; i++) {
  const expected = replay.checkpoints[i];
  while (state.tick < expected.tick) step(state, 1 / 60);
  if (hashState(state) !== expected.hash) {
    throw new Error(`分叉于 tick ${expected.tick}`);
  }
}
```

**分叉帧就是 bug 的位置。** 比"我玩的时候感觉不对"精确一百倍。

### 什么时候会分叉

- 用了 `Math.random()` 或 `Date.now()`。
- 用了 `Math.sin/cos/atan2`（跨引擎最后一位可能不同）。
- 遍历顺序依赖 `Map`/对象键顺序。
- 浮点累加顺序变了（比如把两段循环合并）。
- 渲染层偷偷改了逻辑状态（比如 `body.x` 就是逻辑坐标，第 03 章那条）。

## 第三层：真机清单

纯逻辑测不到触摸、渲染、性能、安全区。每次发版前，在真机上过一遍：

- [ ] 冷启动 ≤ 5 秒（经验值，低端机可放宽）。
- [ ] 点选、框选、tap-tap 移动，单手完成。
- [ ] 双指缩放后，UI 不变形、不模糊。
- [ ] 切后台 30 秒回来，不卡死、不瞬移。
- [ ] 刘海/挖孔不挡按钮。
- [ ] 横屏锁定，旋转不重启。
- [ ] 断网能玩。
- [ ] 连续玩 30 分钟，不崩、不严重发热。
- [ ] 覆盖安装新版本，存档还在。
- [ ] `adb logcat` 无红色崩溃。

## 最小可玩循环：怎么定义

不要用"感觉差不多了"判断。用一条可观测的链路：

> **选中农人 → 采集一种资源 → 造一个建筑 → 造一个兵 → 打掉一个敌方单位 → 出现胜利/失败提示。**

这条链路能在 **10 分钟内**走完，且不需要重启，就算"能玩了"。

五个验收标准：

1. **闭环**：上面六个动作全部可完成，没有死路。
2. **时长**：一局 8-12 分钟（`DESIGN-v2.md:10.2` 的 M2 验收是 10-15 分钟，首版可以短一点）。
3. **反馈**：每个动作 0.1-0.4 秒内有可见反馈（第 11 章）。
4. **稳定**：连续三局不崩、不卡死。
5. **可解释**：你能说清"我为什么输/赢"，而不是"不知道怎么就结束了"。

## 性能回归测试

不需要自动化工具，做一个手动基线：

1. 固定场景：100 个单位，全部移动，10 秒。
2. 记录：`game.loop.actualFps` 的平均值。
3. 每次改动后重跑，掉超过 15% 就查。

把这个数字写在 `docs/guide` 或 commit message 里，形成历史。**没有基线，"变卡了"只是感觉。**

## CI（可选）

如果仓库在 GitHub，加一个最简 workflow：

```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm test
      - run: npm run build
```

它只能保证"类型对、单测过、能构建"，不能保证"手机上好玩"。别对它期待过高。

## 自检

- [ ] `npm test` 能跑，至少覆盖 A\*、伤害、采集回环。
- [ ] 能录一局，重放两次哈希一致。
- [ ] 改坏一个逻辑（比如把采集量改成 11），重放能报出分叉帧。
- [ ] 有一份真机清单，每次发版都过。
- [ ] 有一个性能基线数字。
- [ ] 你能用一句话定义"这版能玩了"。

## 一句话总结

**确定性不是为了联机，是为了让你能复现 bug。** 一个能重放的对局，抵得上一百次"我这边好像卡了一下"。
