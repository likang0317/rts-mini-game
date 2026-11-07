# 14 签名、发布与分发

## 这一章解决什么

你已经有一个能装的 debug 包。现在要把它变成"能给朋友装、能覆盖升级、签名不会丢"的 release 包。

四件事：**签名、版本号、图标/包名、分发方式。**

## 包名：定了就不能改

`appId`（`com.likang.rtsmini`）是应用的身份。Android 用它区分"这是同一个应用"还是"另一个应用"。

- 改了包名 → 手机上会装出两个图标，旧数据不共享。
- 上架后更不能改。
- 命名用反向域名：`com.你的域名.项目名`。没有域名就用 `com.你的名字.项目名`，但要注意可能和别人撞。

**在第一次发给别人之前，把包名想清楚。** 之后不要动。

## 版本号：两个字段，各管一件事

```gradle
// android/app/build.gradle
android {
    defaultConfig {
        applicationId "com.likang.rtsmini"
        minSdkVersion 24
        targetSdkVersion 36
        versionCode 1          // 整数，只能递增，Android 用它判断"哪个更新"
        versionName "0.1.0"    // 给人看的
    }
}
```

规则：

- `versionCode` 每次发版 **+1**，不能回退。回退会导致新包装不上旧包。
- `versionName` 用语义化版本：`0.1.0` → `0.1.1`（修 bug）→ `0.2.0`（加功能）→ `1.0.0`（正式）。
- 一个可维护的换算：`versionCode = major * 10000 + minor * 100 + patch`。`0.2.3` → `203`。

**每次发版前检查 `versionCode`。** 忘了加，手机会提示"应用未安装"或"版本降级"。

## 生成 keystore

只需要做一次：

```bash
keytool -genkey -v -keystore rts-release.keystore -alias rts -keyalg RSA -keysize 2048 -validity 10000
```

会问你密码、姓名、组织等。密码记在密码管理器里。

**三条铁律：**

1. `rts-release.keystore` **不能进 git**。加到 `.gitignore`。
2. 密码不要写进 `build.gradle` 后提交。
3. 备份两份，一份离线（U 盘/另一台机器）。**丢了这个文件，已安装的用户永远收不到你的更新。**

## Gradle 签名配置

不要硬编码密码。用 `keystore.properties`（同样不进 git）：

```properties
# android/keystore.properties
storeFile=../rts-release.keystore
storePassword=你的密码
keyAlias=rts
keyPassword=你的密码
```

```gradle
// android/app/build.gradle
def keystoreProperties = new Properties()
def keystorePropertiesFile = rootProject.file("keystore.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}

android {
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false       // 首版不要开，开了要配 keep 规则
            shrinkResources false
        }
    }
}
```

`.gitignore` 加两行：

```
android/keystore.properties
*.keystore
```

## 打 release 包

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleRelease
```

产物：`android/app/build/outputs/apk/release/app-release.apk`。

验证签名：

```bash
apksigner verify --print-certs app-release.apk
```

能看到你的证书指纹就对了。`apksigner` 在 `%LOCALAPPDATA%\Android\Sdk\build-tools\36.0.0\` 下。

## APK 还是 AAB？

- **自己分发/朋友装：APK。** 直接安装，不需要商店。
- **上 Google Play：AAB。** 商店会按设备拆分。你不上架，不用管。

Capacitor 应用本身是 Java/Kotlin + Web 资源，没有自己的 `.so` 库，所以**不需要按 ABI 拆包**（arm64/armv7）。除非你以后加了带原生库的插件。

## 图标

Android 8+ 用自适应图标（adaptive icon）：

- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` 定义前景/背景。
- 前景图 **432×432**，安全区是中间 **66%**（约 288×288），超出部分会被裁掉。
- 背景可以是纯色或纹理。

最省事的做法：用 Android Studio 的 Image Asset 工具（右键 `res` → New → Image Asset），选一张 1024×1024 的图，它会生成所有尺寸。

**不要**只放一张 `ic_launcher.png` 就完事。高 DPR 机器上会糊，圆形/方形图标遮罩也会切掉你的图案。

## 权限：能删就删

Capacitor 默认只加 `INTERNET`。检查 `android/app/src/main/AndroidManifest.xml`，把不需要的权限删掉：

- 不要加 `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE`，你的资源都在 APK 内。
- 不要加定位、通讯录、相机，除非真的用。
- 权限越多，安装时的提示越吓人，朋友越不敢装。

## 分发：不上架怎么给别人

### 方式 1：直接发 APK 文件

微信/QQ 传文件，对方点击安装。问题：

- 微信可能提示"文件格式不支持"或拦截，让对方用文件管理器打开。
- Android 8+ 需要给"文件管理器/浏览器"授予"安装未知应用"权限。
- Google Play Protect 可能弹"未知开发者"，选"仍然安装"。

### 方式 2：网盘 + 二维码

把 APK 放网盘，生成短链/二维码。注意部分国内网盘会对 APK 做拦截或要求登录，体验不稳定（经验判断，实际以你用的平台为准）。

### 方式 3：GitHub Releases

如果仓库是公开的，直接在 Releases 上传 APK，得到一个稳定下载链接。这是最干净的方案：

- 不用处理网盘限速/登录。
- 每个版本一个 tag，历史可查。
- 缺点：国内下载可能慢。

### 方式 4：自己的静态页

把 APK 放在 GitHub Pages（你已经有 `docs/ui/index.html` 的经验），做一个简单下载页 + 更新日志。适合"给一小群人玩"。

**不要做的**：把 APK 提交进 git 仓库。二进制文件会让仓库迅速膨胀，而且每次更新都留一份历史。

## 更新策略

### 手动更新（推荐首版）

1. 改 `versionCode` +1，`versionName` 递增。
2. 打 release 包。
3. 发给玩家，覆盖安装。
4. 数据（`localStorage`）会保留，因为包名和签名没变。

**前提：签名必须一致。** 换了 keystore，新包装不上去，只能卸载重装（数据丢失）。

### 应用内检查更新（可选）

在 GitHub Pages 放一个 `version.json`：

```json
{ "versionCode": 3, "versionName": "0.2.0", "url": "https://.../app-release.apk", "notes": "修复采集卡住" }
```

启动时 fetch 它，比较本地 `versionCode`，有新版就弹提示 + 打开下载链接。

**不要做静默自动更新。** 自己分发也要用户知情，而且 Android 安装 APK 必须经过系统确认，静默不了。

### 热更新（不建议）

Capacitor 支持 `server.url` 指向远程，或用第三方 live update 插件替换 Web 资源。听起来很爽，但：

- 远程挂了，游戏直接打不开。
- 你等于在运行时执行任意 JS，安全风险自己承担。
- 调试链路变复杂（"我改了怎么没生效"）。

**首版不要做。** 重新打包 30 秒的事，不值得引入一个运行时依赖。

## 发布前检查清单

- [ ] `versionCode` 比上一版大。
- [ ] `versionName` 与更新日志一致。
- [ ] 包名没变。
- [ ] 用同一个 keystore 签名。
- [ ] `apksigner verify` 通过。
- [ ] 装到一台**已装旧版**的手机上，能覆盖安装，数据还在。
- [ ] 装到一台**没装过**的手机上，能正常启动。
- [ ] 断网能玩。
- [ ] 图标在圆形/方形遮罩下不被切掉。
- [ ] 权限列表里没有多余项。
- [ ] keystore 和密码有离线备份。
- [ ] APK 没有提交进 git。

## 自检

- [ ] 你能说清 `versionCode` 和 `versionName` 的区别。
- [ ] 你知道换 keystore 的后果。
- [ ] 你打过一次 release 包，并且用 `apksigner` 验证过。
- [ ] 你在一台旧版手机上做过覆盖安装。
- [ ] 你知道朋友装的时候会遇到哪几个系统提示。

## 一句话总结

**签名是身份，版本号是顺序。** 这两件事搞对，更新就是"发个文件"；搞错，就是"让所有人卸载重装"。
