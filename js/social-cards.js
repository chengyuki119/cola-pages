/* ═══ 全站社交卡片（「关于 Snow Yuzu」页用）═══
   数据源与主页「找到我」同一份：site_settings.key='links'（后台「主页管理」维护），单一数据源不重复录入。
   图标与 index.html 的 HOME_ICONS 同一套 SVG。 */
(function () {
  'use strict';
  var HOME_ICONS = {
    gmail: '<svg viewBox="0 0 24 24" fill="none" stroke="#ea8c7b" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="m2 7 10 6L22 7"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="#e073a8" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="#e073a8" stroke="none"/></svg>',
    x: '<svg viewBox="-2.5 -2.5 29 29" fill="var(--text,#604C57)"><path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3l-4.9-6.4L6.4 22H3.3l7.3-8.3L1.2 2h6.4l4.4 5.9L18.9 2Zm-1.1 18h1.7L7 3.7H5.2L17.8 20Z"/></svg>',
    discord: '<svg viewBox="0 0 24 24" fill="#5865f2"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.6 1.25a18.3 18.3 0 0 0-5.5 0 12.6 12.6 0 0 0-.61-1.25.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.88 1.52.07.07 0 0 0-.04.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.22-2a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1-.01-.13c.13-.09.25-.19.37-.29a.07.07 0 0 1 .08 0 14.2 14.2 0 0 0 12.06 0 .07.07 0 0 1 .08 0c.12.1.25.2.38.29a.08.08 0 0 1-.01.13c-.6.35-1.22.64-1.87.9a.08.08 0 0 0-.04.11c.36.7.77 1.37 1.22 2a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6.02-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.68-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.95-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z"/></svg>',
    wechat: '<svg viewBox="0 0 24 24" fill="#57bb6a"><path d="M9.3 4C5.3 4 2 6.7 2 10.1c0 1.9 1 3.5 2.7 4.7l-.7 2.1 2.4-1.2c.7.2 1.4.4 2.2.4h.4a5.5 5.5 0 0 1-.2-1.5c0-3.2 3-5.8 6.7-5.8h.4C15.3 6 12.6 4 9.3 4ZM7 7.4a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm4.6 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8ZM15.5 10c-3.2 0-5.8 2.1-5.8 4.8 0 2.6 2.6 4.8 5.8 4.8.6 0 1.2-.1 1.8-.3l2 1-.6-1.7c1.4-.9 2.3-2.2 2.3-3.8 0-2.6-2.6-4.8-5.5-4.8Zm-2 2.3a.8.8 0 1 1 0 1.6.8.8 0 1 1 0-1.6Zm4 0a.8.8 0 1 1 0 1.6.8.8 0 1 1 0-1.6Z"/></svg>',
    xhs: '<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="6" fill="#ff2442"/><text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="bold" fill="#ffffff">红</text></svg>',
    douyin: '<svg viewBox="0 0 24 24" fill="#5ad7d0"><path d="M16.6 3c.4 2.3 1.9 3.8 4.4 4v3c-1.7 0-3.2-.5-4.4-1.4v6.6c0 3.5-2.6 5.8-5.9 5.8-3.1 0-5.7-2.4-5.7-5.6 0-3.3 2.9-5.8 6.3-5.4v3.1c-1.7-.5-3.2.5-3.2 2.2 0 1.5 1.2 2.6 2.6 2.6 1.6 0 2.8-1.1 2.8-3.2V3h3.1Z"/></svg>',
    netease: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#C20C0C"/><path fill="#ffffff" d="M15.9 6.4v8.1a2.75 2.75 0 1 1-1.7-2.54V8.3l-4.2 1.1v6.6a2.75 2.75 0 1 1-1.7-2.54V7.6c0-.5.35-.93.84-1.03l5.3-1.15c.75-.16 1.46.4 1.46 1.18Z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" fill="#1c1c1e"><path d="M16.6 3c.4 2.3 1.9 3.8 4.4 4v3c-1.7 0-3.2-.5-4.4-1.4v6.6c0 3.5-2.6 5.8-5.9 5.8-3.1 0-5.7-2.4-5.7-5.6 0-3.3 2.9-5.8 6.3-5.4v3.1c-1.7-.5-3.2.5-3.2 2.2 0 1.5 1.2 2.6 2.6 2.6 1.6 0 2.8-1.1 2.8-3.2V3h3.1Z"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" fill="#ff0000"><path d="M23 12s0-3.8-.5-5.6c-.3-1-1-1.7-2-2C18.7 4 12 4 12 4s-6.7 0-8.5.4c-1 .3-1.7 1-2 2C1 8.2 1 12 1 12s0 3.8.5 5.6c.3 1 1 1.7 2 2 1.8.4 8.5.4 8.5.4s6.7 0 8.5-.4c1-.3 1.7-1 2-2 .5-1.8.5-5.6.5-5.6ZM9.8 15.5v-7l6.2 3.5-6.2 3.5Z"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="var(--muted,#A88E9B)" stroke-width="2"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7L12.5 19"/></svg>'
  };

  /* ── 品牌 Logo（她 20261030 §4 最终版）：保留官方图形形状，全部改为统一单色玫瑰灰粉 #B98598
     不再使用 Discord 蓝 / Gmail 红 / 微信绿 / TikTok 黑 / Instagram 渐变；统一 20px，名称左侧
     Footer 与 About（本文件 text 模式）共用同一套；不用 Emoji、不用自创图案 ── */
  var SY_ICON_COLOR = '#B98598';
  var BRAND_ICONS = {
    discord: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.32 4.37a19.8 19.8 0 0 0-4.89-1.52.07.07 0 0 0-.08.04c-.21.38-.44.87-.6 1.25a18.3 18.3 0 0 0-5.5 0 12.6 12.6 0 0 0-.61-1.25.08.08 0 0 0-.08-.04 19.7 19.7 0 0 0-4.88 1.52.07.07 0 0 0-.04.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.05 19.9 19.9 0 0 0 6 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.22-2a.08.08 0 0 0-.04-.11 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1-.01-.13c.13-.09.25-.19.37-.29a.07.07 0 0 1 .08 0 14.2 14.2 0 0 0 12.06 0 .07.07 0 0 1 .08 0c.12.1.25.2.38.29a.08.08 0 0 1-.01.13c-.6.35-1.22.64-1.87.9a.08.08 0 0 0-.04.11c.36.7.77 1.37 1.22 2a.08.08 0 0 0 .08.03 19.8 19.8 0 0 0 6.02-3.03.08.08 0 0 0 .03-.05c.5-5.18-.84-9.68-3.55-13.66a.06.06 0 0 0-.03-.03ZM8.02 15.33c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.96 2.42-2.16 2.42Zm7.97 0c-1.18 0-2.16-1.08-2.16-2.42 0-1.33.95-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.34-.95 2.42-2.16 2.42Z"/></svg>',
    gmail: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457Z"/></svg>',
    wechat: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.3 4C5.3 4 2 6.7 2 10.1c0 1.9 1 3.5 2.7 4.7l-.7 2.1 2.4-1.2c.7.2 1.4.4 2.2.4h.4a5.5 5.5 0 0 1-.2-1.5c0-3.2 3-5.8 6.7-5.8h.4C15.3 6 12.6 4 9.3 4ZM7 7.4a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm4.6 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8ZM15.5 10c-3.2 0-5.8 2.1-5.8 4.8 0 2.6 2.6 4.8 5.8 4.8.6 0 1.2-.1 1.8-.3l2 1-.6-1.7c1.4-.9 2.3-2.2 2.3-3.8 0-2.6-2.6-4.8-5.5-4.8Zm-2 2.3a.8.8 0 1 1 0 1.6.8.8 0 1 1 0-1.6Zm4 0a.8.8 0 1 1 0 1.6.8.8 0 1 1 0-1.6Z"/></svg>',
    tiktok: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 3c.4 2.3 1.9 3.8 4.4 4v3c-1.7 0-3.2-.5-4.4-1.4v6.6c0 3.5-2.6 5.8-5.9 5.8-3.1 0-5.7-2.4-5.7-5.6 0-3.3 2.9-5.8 6.3-5.4v3.1c-1.7-.5-3.2.5-3.2 2.2 0 1.5 1.2 2.6 2.6 2.6 1.6 0 2.8-1.1 2.8-3.2V3h3.1Z"/></svg>',
    instagram: '<svg viewBox="0 0 24 24"><rect x="1.6" y="1.6" width="20.8" height="20.8" rx="6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.6" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.2" cy="6.8" r="1.3" fill="currentColor"/></svg>'
  };
  window.SY_ICON_COLOR = SY_ICON_COLOR;
  window.ykSocialIcon = function (icon, size) {
    var svg = BRAND_ICONS[icon];
    if (!svg) return '';
    var s = size || 20;
    return '<span class="sy-sicon" aria-hidden="true" style="display:inline-block;width:' + s + 'px;height:' + s + 'px;vertical-align:-4px;margin-right:7px;line-height:0;color:' + SY_ICON_COLOR + ';">' +
      svg.replace('<svg ', '<svg style="width:' + s + 'px;height:' + s + 'px;display:block;color:' + SY_ICON_COLOR + ';" ') + '</span>';
  };

  var DB = 'https://ukxrvcptwhlwvdanovgd.supabase.co/rest/v1/';
  var AK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVreHJ2Y3B0d2hsd3ZkYW5vdmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMzgyNDcsImV4cCI6MjEwODgxNDI0N30.Grdi23yToGPFF8e_kxFjf37JOOf51j-FW_FYQTUVu8E';
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  // 默认清单 = 主页「找到我」当前的静态配置（账号名/ID/链接逐字一致，2026-10-31 她最终版：只保留 Discord / Gmail / WeChat / TikTok / Instagram）；
  // 后台「主页管理」保存过 links 设置时以库里的为准
  var DEFAULT_LINKS = [
    { icon: 'discord', name: 'Discord', sub: '小柚的服务器', subEn: "Yuki's server", url: 'https://discord.gg/aWSfnydGG' },
    { icon: 'gmail', name: 'Gmail', sub: 'snowyuzustudio@gmail.com', url: 'mailto:snowyuzustudio@gmail.com' },
    { icon: 'wechat', name: '微信', sub: 'yuki_060119', url: '' },
    { icon: 'tiktok', name: 'TikTok', sub: '@snowyuzu.studio', url: 'https://www.tiktok.com/@snowyuzu.studio' },
    { icon: 'instagram', name: 'Instagram', sub: '@snowyuzu.studio', url: 'https://www.instagram.com/snowyuzu.studio/' }
  ];
  // 只允许这五个平台出现在前台（她 20261031 §6：其他平台彻底删除，不能只隐藏）
  var ALLOW_ICONS = ['discord', 'gmail', 'wechat', 'tiktok', 'instagram'];

  // 社交数据源单一出口：about 页与 Footer 共用（库里 links 行为准，无则用默认清单）
  var linksPromise = null;
  window.getSocialLinks = function () {
    if (!linksPromise) {
      linksPromise = fetch(DB + "site_settings?select=value&key=eq.links", { headers: { 'apikey': AK } })
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) {
          var links = [];
          try { links = JSON.parse((rows[0] && rows[0].value) || 'null') || []; } catch (e) {}
          return (Array.isArray(links) && links.length) ? links.filter(function (l) { return ALLOW_ICONS.indexOf(l.icon) !== -1; }) : DEFAULT_LINKS;
        })
        .catch(function () { return DEFAULT_LINKS; });
    }
    return linksPromise;
  };

  // mode='cards'（默认）：图标卡片网格；mode='text'：纵向文字链接列表（她 20261026 最终合并版 §3.3，不再用大卡网格）
  // 中英文切换：品牌名可保留，但展示名/提示语需本地化（她 20261029 任务书 §5.4；微信→WeChat、小红书→RED）
  /* 语言：URL 路径优先（window.YK.lang），其次 localStorage（她 20261030 路径即唯一依据） */
  function syLang() {
    if (window.YK && (window.YK.lang === 'zh' || window.YK.lang === 'en')) return window.YK.lang;
    try { return localStorage.getItem('yuki-lang') === 'en' ? 'en' : 'zh'; } catch (e) { return 'zh'; }
  }
  /* 副标题（如「小柚的服务器」）跟随语言：库里有 subEn 用 subEn，没有就用映射表，查不到保留原文 */
  var SUB_EN = { '小柚的服务器': "Yuki's server" };
  function sySub(l) {
    if (syLang() !== 'en') return l.sub || '';
    return l.subEn || SUB_EN[l.sub] || l.sub || '';
  }
  var NAME_EN = { '微信': 'WeChat', '小红书': 'RED', '抖音': 'Douyin', '网易云音乐': 'NetEase Music', '微博': 'Weibo', '邮件': 'Email', '账号整理中': 'account coming soon' };
  function syName(name) { if (syLang() !== 'en') return esc(name); return esc(NAME_EN[name] || name); }
  function syT(zh, en) { return syLang() === 'en' ? en : zh; }

  window.renderSocialCards = function (boxSel, mode) {
    var box = document.querySelector(boxSel);
    if (!box) return;
    window.getSocialLinks().then(function (links) {
        if (!links.length) {
          box.innerHTML = '<p style="color:var(--muted,#A88E9B);text-align:center;padding:30px 0;">' + syT('社交账号配置即将上线，先去首页逛逛吧 ♡', 'Social links coming soon ♡') + '</p>';
          return;
        }
        if (mode === 'row') { ensureRowStyle(); box.classList.add('sy-rowlist'); box.innerHTML = links.map(function (l) {
            var iconSvg = (window.ykSocialIcon ? window.ykSocialIcon(l.icon, 22) : '');
            var name = syName(l.name);
            var sub = l.sub ? esc(sySub(l)).replace('@', '@<wbr>') : syT('账号整理中', 'account coming soon');
            var inner = '<span class="sy-rc-top">' + iconSvg + '<b>' + name + '</b></span>' +
                        '<span class="sy-rc-sub">' + sub + '</span>';
            var icon = l.icon || '';
            if (icon === 'wechat' && l.sub) return '<a class="sy-rowcard" href="javascript:void(0)" data-sy-copy="' + escAttr(l.sub) + '" title="' + escAttr(syT('点击复制微信号：', 'Tap to copy: ') + l.sub) + '">' + inner + '</a>';
            if (icon === 'gmail') { var full = (l.sub || '').indexOf('@') >= 0 ? l.sub : (l.sub || '') + '@gmail.com'; return '<a class="sy-rowcard" href="javascript:void(0)" data-sy-mail="' + escAttr(full) + '">' + inner + '</a>'; }
            if (l.url) return '<a class="sy-rowcard" href="' + escAttr(l.url) + '" target="_blank" rel="noopener">' + inner + '</a>';
            return '<span class="sy-rowcard" style="cursor:default;">' + inner + '</span>';
          }).join('') + '<div id="sy-mail-pop" style="display:none;"></div>';
          bindSocialActions(box);
          return;
        }
        if (mode === 'text') {
          box.innerHTML = links.map(function (l) {
            var iconSvg = (window.ykSocialIcon ? window.ykSocialIcon(l.icon, 20) : ''); // §7 品牌 Logo
            var name = iconSvg + syName(l.name) + (l.sub ? '<small style="color:var(--muted,#A88E9B);font-weight:400;">　' + esc(sySub(l)) + '</small>' : '');
            var icon = l.icon || '';
            /* §4.3（她 20261026 总任务书）：微信点击复制微信号；Gmail 点击展开邮箱地址+复制/打开两操作 */
            if (icon === 'wechat' && l.sub) return '<a class="sy-linkline" href="javascript:void(0)" data-sy-copy="' + escAttr(l.sub) + '">' + name + '</a>';
            if (icon === 'gmail') { var full = (l.sub || '').indexOf('@') >= 0 ? l.sub : (l.sub || '') + '@gmail.com'; return '<a class="sy-linkline" href="javascript:void(0)" data-sy-mail="' + escAttr(full) + '">' + name + '</a>'; }
            if (l.url) return '<a class="sy-linkline" href="' + escAttr(l.url) + '" target="_blank" rel="noopener">' + name + '</a>';
            return '<span class="sy-linkline" style="cursor:default;">' + name + (l.sub ? '' : '<small style="color:var(--muted,#A88E9B);font-weight:400;">　' + syT('账号整理中', 'account coming soon') + '</small>') + '</span>';
          }).join('') + '<div id="sy-mail-pop" style="display:none;"></div>';
          bindSocialActions(box);
          return;
        }
        box.innerHTML = links.map(function (l) {
          return '<a class="link-card"' + (l.url ? ' href="' + escAttr(l.url) + '" target="_blank" rel="noopener"' : '') + '>' +
            (BRAND_ICONS[l.icon] || HOME_ICONS[l.icon] || HOME_ICONS.link) +
            '<span>' + syName(l.name) + (l.sub ? '<small>' + esc(sySub(l)) + '</small>' : '') + '</span>' +
            '</a>';
        }).join('');
      })
      .catch(function () {
        box.innerHTML = '<p style="color:var(--muted,#A88E9B);text-align:center;padding:30px 0;">' + syT('加载失败，请刷新重试', 'Failed to load, please refresh') + '</p>';
      });
  };

  /* —— 找我的横排卡片：
     外框 flex-wrap，项目 flex:1 1 120px → 宽度够就一排尽量摆满，放不下才换行（不缩放图标和文字）
     每个项目两排：① 图标 + 加粗平台名（垂直居中） ② 账号 / 邮箱 / 联系方式 —— */
  function ensureRowStyle() {
    if (document.getElementById('sy-rowcard-style')) return;
    var st = document.createElement('style');
    st.id = 'sy-rowcard-style';
    st.textContent =
      '.sy-rowlist{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px 18px;align-items:stretch;}' +
      '.sy-rowcard{min-width:0;box-sizing:border-box;display:flex;flex-direction:column;gap:7px;' +
        'padding:14px 16px;background:#FFF7FA;border:1.5px solid #FFD1E0;border-radius:16px;text-decoration:none;' +
        'color:#62545B;transition:background .18s,border-color .18s;}' +
      'a.sy-rowcard:hover{background:#FCE1EA;border-color:#F5BFD1;}' +
      '.sy-rowcard .sy-rc-top{display:flex;align-items:center;gap:8px;min-width:0;}' +
      '.sy-rowcard .sy-rc-top .sy-sicon{margin-right:0 !important;}' +
      '.sy-rowcard .sy-rc-top b{font-size:17px;font-weight:700;color:#55464E;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.sy-rowcard .sy-rc-sub{font-size:15px;line-height:1.55;color:#81717A;word-break:break-word;overflow-wrap:anywhere;}' +
      '@media (min-width:600px){.sy-rowcard .sy-rc-sub{padding-left:30px;}}' +
      '@media (max-width:599px){.sy-rowlist{grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px 10px;}.sy-rowcard{padding:12px 13px;border-radius:14px;}.sy-rowcard .sy-rc-top b{font-size:16px;}.sy-rowcard .sy-rc-sub{font-size:14px;}}';
    document.head.appendChild(st);
  }

  /* —— §4.3 复制与 Gmail 展开逻辑（social-cards 内部自足，不依赖页面其它脚本） —— */
  function syCopyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function(){done(true);}, function(){fallbackCopy(text)?done(true):done(false);});
    } else { done(fallbackCopy(text)); }
  }
  function fallbackCopy(text) {
    try {
      var ta=document.createElement('textarea'); ta.value=text; ta.style.cssText='position:fixed;opacity:0;';
      document.body.appendChild(ta); ta.select(); var ok=document.execCommand('copy'); ta.remove(); return ok;
    } catch(e){ return false; }
  }
  function syToast(msg, ok) {
    var t=document.getElementById('sy-copy-toast');
    if(!t){ t=document.createElement('div'); t.id='sy-copy-toast';
      t.style.cssText='position:fixed;left:50%;bottom:34px;transform:translateX(-50%);z-index:99999;background:#fff;border:1.5px solid #FFD9E6;border-radius:999px;padding:9px 22px;font-size:15px;color:#604C57;box-shadow:0 4px 18px rgba(255,143,171,.25);transition:opacity .25s;opacity:0;pointer-events:none;font-family:inherit;';
      document.body.appendChild(t); }
    t.textContent=msg; t.style.color=ok?'#604C57':'#D96570';
    t.style.opacity='1'; clearTimeout(t._tm); t._tm=setTimeout(function(){t.style.opacity='0';},1800);
  }
  function bindSocialActions(box) {
    if (box._syBound) return; box._syBound=true;
    box.addEventListener('click', function (e) {
      var cp = e.target.closest ? e.target.closest('[data-sy-copy]') : null;
      if (cp) { e.preventDefault();
        syCopyText(cp.getAttribute('data-sy-copy'), function(ok){ syToast(syLang()==='en'?(ok?'WeChat ID copied ♡':'Copy failed, manually: '+cp.getAttribute('data-sy-copy')):(ok?'已复制微信号 ♡':'复制失败，请手动复制：'+cp.getAttribute('data-sy-copy')), ok); });
        return;
      }
      var gm = e.target.closest ? e.target.closest('[data-sy-mail]') : null;
      if (gm) { e.preventDefault();
        var addr=gm.getAttribute('data-sy-mail');
        var pop=document.getElementById('sy-mail-pop'); if(!pop) return;
        if (pop.style.display==='block' && pop._for===addr) { pop.style.display='none'; return; }
        pop._for=addr;
        pop.innerHTML='<div style="max-width:420px;margin:10px auto 0;background:#fff;border:1.5px solid #FFD9E6;border-radius:14px;padding:14px 18px;font-size:15px;color:#604C57;display:flex;align-items:center;gap:10px;flex-wrap:wrap;">'+
          '<b style="word-break:break-all;">'+addr+'</b>'+
          '<button type="button" data-sy-copybtn="'+addr+'" style="border:none;background:#FCE4EC;color:#A98D96;border-radius:999px;padding:6px 16px;font-size:14px;cursor:pointer;font-family:inherit;">复制邮箱</button>'+
          '<a href="mailto:'+addr+'" style="border:1.5px solid #FFD9E6;color:#604C57;border-radius:999px;padding:5px 16px;font-size:14px;text-decoration:none;">打开邮箱</a>'+
          '</div>';
        pop.style.display='block';
        return;
      }
      var cb = e.target.closest ? e.target.closest('[data-sy-copybtn]') : null;
      if (cb) { syCopyText(cb.getAttribute('data-sy-copybtn'), function(ok){ syToast(syLang()==='en'?(ok?'Email copied ♡':'Copy failed'):(ok?'已复制邮箱 ♡':'复制失败，请手动复制'), ok); }); }
    });
  }
})();
