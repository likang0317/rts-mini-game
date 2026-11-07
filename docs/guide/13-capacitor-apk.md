# 13 先出包：用 Capacitor 把网页变成 APK

## 为什么先做这一步

大部分人会想"先把游戏做完，最后再打包"。这是反的。

打包会暴露一堆**只有真机才有**的问题：白屏、按钮点不到、字体发虚、DPR 太高导致掉帧、横屏后画布尺寸不对、安全区遮挡、音频不响。这些问题越晚发现，返工越贵。

所以：**在只有三个方块单位的时候，就先把包装到手机上。** 一天之内能做完。

## 环境依赖

以 **Capacitor 8** 为准（写作时主线版本，查证于 2026-11-07）：

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | ≥ 20 | 你已有 |
| JDK | **17**（21 也可） | AGP 8.13 要求 JDK 17+。`java -version` 确认 |
| Android SDK | Platform **36** + Build-Tools 36 | 装 Android Studio 最省事 |
| Android Studio | **Otter 2025.2.1+** | Capacitor 8 的最低要求 |
| adb | platform-tools | 装完 SDK 在 `%LOCALAPPDATA%\Android\Sdk\platform-tools` |
| Gradle | 不用单独装 | `android/gradlew` 自带 |

如果你装到的是 Capacitor 7，对应 `minSdk 23` / `targetSdk 35`，其余步骤一样。Capacitor 6 是 `minSdk 22` / `targetSdk 34`，已经偏旧，不建议新项目用。

验证环境：

```bash
java -version          # 17.x 或 21.x
adb version
adb devices            # 插上手机、开 USB 调试，应该能看到设备
```

手机上要打开「开发者选项 → USB 调试」。小米/OPPO 还要额外打开「USB 安装」，否则 `adb install` 会报 `INSTALL_FAILED_USER_RESTRICTED`。

## 接入 Capacitor（六步）

### 1. 装依赖

```bash
npm i @capacitor/core @capacitor/android
npm i -D @capacitor/cli
```

注意 `@capacitor/android` 是**运行时依赖**，不要装成 `-D`。装错的结果是打包时找不到原生工程模板。

### 2. 改 Vite 配置 —— 这一步错了就是白屏

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',        // 关键！默认是 '/'，在 WebView 的 file/https 本地协议下会去根目录找资源，直接白屏
  build: { outDir: 'dist' },
});
```

**`base: './'` 是 90% 的"打出来是白屏"的根因。** 记牢。

### 3. 初始化

```bash
npm run build
npx cap init "轩辕" com.likang.rtsmini --web-dir=dist
```

- `com.likang.rtsmini` 是**包名**，一旦发布就**永远不能改**。改了就是另一个应用，无法覆盖安装。
- `轩辕` 是桌面显示名，之后可以在 `android/app/src/main/res/values/strings.xml` 改。

### 4. 加 Android 平台

```bash
npx cap add android
npx cap sync android
```

`sync` 会把 `dist` 拷进 `android/app/src/main/assets/public`，并同步插件。**每次改完 Web 代码，都要 `npm run build && npx cap sync android`**，否则手机上跑的还是旧包。

### 5. 构建 APK

```bash
cd android
./gradlew assembleDebug          # Windows: .\gradlew.bat assembleDebug
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`。

首次构建要下 Gradle 和依赖，可能 5-15 分钟（经验值），之后 20-60 秒。

### 6. 装到手机

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

或者把 APK 拷到手机点击安装（需要允许"未知来源"，第 14 章讲）。

## `capacitor.config.ts` 该写什么

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.likang.rtsmini',
  appName: '轩辕',
  webDir: 'dist',
  android: {
    backgroundColor: '#0b0c07',   // 避免启动时白闪
  },
  server: {
    androidScheme: 'https',       // 默认；保证 localStorage 等 API 正常
  },
};
export default config;
```

不要用 `server.url` 指向开发机。那是调试热更用的，会让 APK 变成"必须和电脑在同一网络才能跑"，装给别人直接白屏。

## 横屏锁定与全屏

RTS 必须横屏。改 `android/app/src/main/AndroidManifest.xml`：

```xml
<activity
    android:name=".MainActivity"
    android:screenOrientation="sensorLandscape"
    android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
    android:exported="true">
```

`configChanges` 那一长串必须保留，否则旋转屏幕时 Activity 会重建，游戏直接重启。

全屏（隐藏状态栏）：

```bash
npm i @capacitor/status-bar
```

```ts
import { StatusBar } from '@capacitor/status-bar';
await StatusBar.hide();
```

**不要**同时开 `setOverlaysWebView({ overlay: true })` 和沉浸式全屏，除非你已经处理了安全区。刘海屏上，UI 会被切掉一块。

## 安全区：必须处理的三个地方

```css
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-left: env(safe-area-inset-left, 0px);
  --safe-right: env(safe-area-inset-right, 0px);
}
```

对应到 HUD：

- 资源条：`top: calc(8px + var(--safe-top))`
- 命令卡：`bottom: calc(12px + var(--safe-bottom))`（不然手势条会盖住按钮）
- 小地图：左右各留 `--safe-left/right`

`index.html` 的 viewport 必须加 `viewport-fit=cover`，否则 `env()` 全是 0：

```html
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
```

## WebView 里跑 Canvas 的注意点

### 1. 先量清楚你在渲染多少像素

手机 DPR 普遍 2.75-3。**不要假设 Phaser 会自动帮你压 DPR**，先打一行日志：

```ts
const c = game.canvas;
console.log(c.width, c.height, c.clientWidth, c.clientHeight, devicePixelRatio);
```

- 如果 `c.width === c.clientWidth`，你按 CSS 像素渲染，性能最好、画面略软。
- 如果 `c.width === c.clientWidth * 3`，你在按 DPR 3 渲染，清晰但填充率是 9 倍。

**目标：把渲染像素控制在 CSS 尺寸的 2 倍以内。** 具体做法取决于你测出来的结果：

- 如果已经是 1 倍，不要为了"锐利"去提到 3 倍，中端机会直接掉帧。
- 如果是 3 倍，把 Phaser 的内部尺寸或 canvas 后备缓冲压到 2 倍，或者改用固定内部分辨率（见下）。

一个稳妥的做法是**固定内部渲染尺寸 + 等比缩放**，不跟随设备 DPR：

```ts
new Phaser.Game({
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    width: 1280,
    height: 720,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // ...
});
```

代价是 20:9 的手机上会有黑边（或你改用 `ENVELOP` 裁切）。**先按现在的 `RESIZE` 跑，量完再决定要不要换。**

### 2. `Phaser.Scale.RESIZE` 要自己处理 resize

你 `src/main.ts:8-11` 用的是 `RESIZE` + `CENTER_BOTH`。它在横竖屏切换、刘海屏适配时靠得住，但你要自己重排相机与 HUD：

```ts
this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
  this.cameras.main.setSize(gameSize.width, gameSize.height);
  this.layoutHud(gameSize.width, gameSize.height);
});
```

### 3. 纹理与内存

APK 里的资源从 `assets/public` 加载，走 `https://localhost`，不是 `file://`，所以 `fetch`、纹理加载都正常。

但**不要在运行时生成大尺寸 Canvas 纹理**（比如用 Graphics 生成 1024×1024 的地图底图）。低端机很容易 OOM，而且这种纹理不会自动释放。

### 4. 音频必须"用户先点一下"

WebView 沿用浏览器的自动播放策略。做法：启动画面放一个「点击开始」，在里面初始化 `AudioContext` 并 `resume()`。

```ts
const ctx = new AudioContext();
await ctx.resume();   // 必须在点击事件里调用
```

## 真机调试

### 看 console

Chrome 打开 `chrome://inspect`，手机 USB 连上，找到你的 WebView，点 inspect。断点、console、Network、Performance 全都能用。

**debug 包默认开启 WebView 调试；release 包默认关闭。** 所以调试期一定用 debug 包。

### 看原生日志

```bash
adb logcat -s Capacitor:V CapacitorPlugin:V chromium:V AndroidRuntime:E
```

崩溃、插件报错、WebView 版本信息都在这里。白屏时先看 logcat，再猜代码。

### 常见故障对照

| 现象 | 首查 |
| --- | --- |
| 全白 | `vite.config.ts` 的 `base` 是否为 `'./'`；是否忘了 `cap sync` |
| 有画面但按钮点不动 | CSS 的 `touch-action`；是否有元素盖住 canvas |
| 字体发虚/变大 | canvas 后备缓冲与 DPR；viewport 是否缺 `viewport-fit=cover` |
| 旋转后布局错位 | `configChanges` 是否完整；有没有监听 `scale.resize` |
| 很卡 | canvas 实际像素；是否每帧 `setText`；Graphics 对象数量 |
| 没声音 | 是否在用户交互后才 `resume()` AudioContext |
| 装不上 | 是否允许 USB 安装；是否与已装版本签名冲突 |
| 启动闪退 | `adb logcat` 看 `AndroidRuntime:E`；多半是 `minSdk` 或插件版本不匹配 |

## debug 与 release 的区别

| | debug | release |
| --- | --- | --- |
| 签名 | 自动用 debug keystore | 必须用你自己的 keystore |
| 可调试 | 是（`chrome://inspect`） | 否 |
| 代码压缩 | 无 | 有（minify） |
| 体积 | 大 20-40% | 小 |
| 性能 | 略慢 | 正常 |
| 用途 | 开发、自测 | 分发给别人、长期玩 |

**从第一天起就用 debug 包装机**，但**在第一次要发给别人之前，把 release 流程走通一次**（第 14 章）。签名一旦搞错，后面所有更新都装不上。

## 签名与 keystore（先知道，别现在做）

```bash
keytool -genkey -v ^
  -keystore rts-release.keystore ^
  -alias rts ^
  -keyalg RSA -keysize 2048 -validity 10000
```

三条铁律：

1. **keystore 文件不能进 git**。加到 `.gitignore`。
2. **密码和 alias 记在密码管理器里**，不要写进 `build.gradle` 提交。
3. **丢了这个文件，你就再也无法给已安装的用户发更新**。备份两份，一份离线。

完整流程（Gradle 签名配置、`versionCode`、`assembleRelease`）在第 14 章。

## 包体大概多大

你的 APK = WebView 壳（约 3-5MB）+ `dist` + 图片/音频。

- 现在 `dist` 的 JS 是 **1.49MB**（`npm run build` 的输出：`assets/index-*.js` 1,485.01kB）。
- 不加任何资源，APK 大约 **6-9MB**（经验值）。
- 加 20MB 音频图片会到 30MB 以上。

这个量级对"自己玩、朋友装"完全没问题。真要压，先压图片（WebP/图集），不要压 JS。

## 自检

- [ ] `npm run build` 通过，`dist/index.html` 里的资源路径是 `./assets/...`
- [ ] `npx cap sync android` 后 `android/app/src/main/assets/public` 里有 `index.html`
- [ ] debug APK 能装、能启动、能看到三个方块
- [ ] 横屏锁定生效，旋转不重启
- [ ] 刘海/挖孔不遮挡资源条与命令卡
- [ ] 双指缩放生效（说明 `activePointers` 配好了，第 04 章）
- [ ] `chrome://inspect` 能看到 console
- [ ] 断网打开，游戏正常（说明资源全本地）
- [ ] `adb logcat` 没有红色 `AndroidRuntime:E`

## 一句话总结

**打包不是最后一步，是第一天就要做的事。** 它会把"桌面幻觉"一次性打掉。
