/* ═══════════════════════════════════════════════════════════════════
   Foodie Map · 坐标转换层（她 20261115 地图引擎任务书 §三）
   · 数据库统一存 WGS-84 原始经纬度，本文件是唯一的坐标转换入口。
   · 高德（GCJ-02）显示/选点前先转，保存前转回 WGS-84，不在数据库里反复修改。
   · wgs2gcj/gcj2wgs 为公开算法；gcj2wgs 用迭代逼近（精度 ~1e-6，够用）。
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function outOfChina(lat, lng) {
    if (lng < 72.004 || lng > 137.8347) return true;
    if (lat < 0.8293 || lat > 55.8271) return true;
    return false;
  }

  /* WGS-84 → GCJ-02 */
  function wgs2gcj(lat, lng) {
    if (outOfChina(lat, lng)) return [lat, lng];
    var a = 6378245.0, ee = 0.00669342162296594323;
    function tLat(x, y) {
      var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
      ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
      ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
      ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
      return ret;
    }
    function tLng(x, y) {
      var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
      ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
      ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
      ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
      return ret;
    }
    var dLat = tLat(lng - 105.0, lat - 35.0);
    var dLng = tLng(lng - 105.0, lat - 35.0);
    var radlat = lat / 180.0 * Math.PI;
    var magic = Math.sin(radlat);
    magic = 1 - ee * magic * magic;
    var sqrtmagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtmagic) * Math.PI);
    dLng = (dLng * 180.0) / (a / sqrtmagic * Math.cos(radlat) * Math.PI);
    return [lat + dLat, lng + dLng];
  }

  /* GCJ-02 → WGS-84（迭代逼近 wgs2gcj 的偏移，3 轮后精度 ~1e-6，餐厅选点够用） */
  function gcj2wgs(lat, lng) {
    if (outOfChina(lat, lng)) return [lat, lng];
    var w = [lat, lng];
    for (var i = 0; i < 3; i++) {
      var g = wgs2gcj(w[0], w[1]);
      w = [w[0] - (g[0] - lat), w[1] - (g[1] - lng)];
    }
    return w;
  }

  window.FoodieCoord = {
    wgs2gcj: wgs2gcj,
    gcj2wgs: gcj2wgs,
    outOfChina: outOfChina
  };
})();
