# Snow Yuzu Google 地图样式 · 使用说明（她 20261117 第二任务书 第三部分）

## 一、为什么要去 Cloud Console 配

Google Maps JS API 的矢量地图（用 mapId + AdvancedMarkerElement 的新方案）**不支持在代码里传样式**，
`styles:` 选项会被矢量渲染忽略。官方做法是把样式放进 Cloud Console 的「Map Styles」并关联 Map ID。
我们地图页和主页地图共用同一个 Map ID，所以**一次配置，两处自动同步**——正好满足任务书
「两处地图应尽量共用配置」的要求。

## 二、步骤（约 3 分钟）

1. 打开 https://console.cloud.google.com/ → 左菜单「Google Maps Platform」→「Map Styles」（地图样式）
2. 点「Create Style / 创建样式」
3. 选「Import JSON / 导入 JSON」→ 把本目录的 `google-map-style-snowyuzu.json` 里的
   `styles` 数组内容粘进去（或整个文件导入，控制台会自己取 styles 字段）
4. 名字填 `Snow Yuzu Soft` → 创建
5. 创建完成后控制台会提示「Associate with Map ID」→ 选现有的
   `978a3c94f7738f2f991725ef`（snowyuzu-foodie）
6. 保存并发布该样式（Publish）

之后 **Foodie Map 页面、主页地图预览、详情页小地图**（同一 Map ID）自动变成新配色，前端零改动。

## 三、配色对照（任务书要求 → JSON 实现）

| 任务书要求 | JSON 实现 |
|---|---|
| 道路柔和浅灰 | road geometry `#ece7ea`（高速带淡粉 `#f0dfe6`） |
| 公园浅绿 | poi.park `#e3efe2` |
| 水域浅蓝 | water `#dceaf2` |
| 建筑奶油/淡粉 | building `#fbf3ef` |
| 地图文字深蓝灰 | labels.text.fill `#4a5568` |
| 保留辨识度 | 全部低饱和浅色，文字对比度保留 |

## 四、Leaflet 降级的同款观感

无 Key / 加载失败时走 Leaflet + OSM 兜底。已在 `css/foodie.css` 给 Leaflet 瓦片加了
柔和滤镜（低饱和 + 提亮 + 轻微暖调），保证降级状态下页面观感接近 Snow Yuzu 色调，
不会突然跳成一张高对比的标准地图。这部分是 CSS 滤镜近似，非逐色映射。

## 五、柚子标记

三引擎（Google / 高德 / Leaflet 降级）共用 `js/foodie-map-engine.js` 里的同一套柚子
pin 素材（`YUZU_SVG_LOCAL` / `pinDom`），不是 Google 默认红色图钉——这条在
20261116 引擎升级时已实现，本次样式改动不影响标记。
