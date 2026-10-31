// ══════════════════════════════════════════════════════════════════
// email-worker：处理 public.email_log 队列（由 pg_cron 每分钟拉起）
// - 鉴权：Authorization: Bearer <WORKER_TOKEN>（与 vault 中 email_worker_token 同值）
//   例外：一键退订 endpoint（List-Unsubscribe-Post）用邮件里的退订令牌鉴权，无需 WORKER_TOKEN
// - SMTP：Gmail App Password（SMTP_USER / SMTP_PASS secrets）
//   secrets 未配置时不动队列、如实返回，绝不假装发送成功
// - 重试：取批时标 sending；失败 attempts+1，<3 次保持 failed 由下一轮 cron 重试，
//   ≥3 次标 dead；卡死超过 5 分钟的 sending 会被下一轮营救
// - 品牌模板（2026-10-26 全面改版）：
//   品牌名统一 Snow Yuzu（页眉加大加粗 + 类型独立副标题）；主体 600px、左右留白 20px；
//   金额亮粉 #FF6FA5 加粗；按钮 #FFD9E6 底 #604C57 字；商品图正方形圆角最大 520px、整图可点击；
//   商品链接不展示裸 URL（渲染成行动按钮）；页脚分行（品牌/官方邮箱/联系客服/退订）；
//   营销邮件（new_product）带 List-Unsubscribe + One-Click 头和页脚 Unsubscribe；
//   交易邮件（订单/留言/回复）不带退订入口，退订营销不影响交易邮件发送
// ══════════════════════════════════════════════════════════════════
import nodemailer from 'npm:nodemailer@6.9.16';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WORKER_TOKEN = Deno.env.get('WORKER_TOKEN') ?? '';
const SMTP_USER = Deno.env.get('SMTP_USER') ?? '';
const SMTP_PASS = Deno.env.get('SMTP_PASS') ?? '';

const MAX_ATTEMPTS = 3;
const BATCH = 10;
const SITE = 'https://yukicheng.com'; // 正式域名（她 2026-10-28 任务书：邮件链接不得指向已停用测试站）
const BRAND = 'Snow Yuzu';
const OFFICIAL_MAIL = 'snowyuzustudio@gmail.com';

// ── 邮件类型 → 独立副标题 + 版式家族（三家版式：交易 / 通知 / 营销）──
//   2026-10-30 22:56 任务书 §1.2：不同类邮件不能长得一模一样，也不能靠随机改内容躲垃圾过滤。
//   所以拆成三套固定版式：交易类左对齐像小票、通知类居中像便签、营销类大图在前。
function kindMeta(kind: string): { sub: string; marketing: boolean; tone: 'transaction' | 'notice' | 'marketing' } {
  const k = kind || '';
  if (/^new_product/.test(k)) return { sub: '新品上架', marketing: true, tone: 'marketing' };
  if (/^order_created/.test(k)) return { sub: '订单确认', marketing: false, tone: 'transaction' };
  if (/^order_confirm/.test(k)) return { sub: '订单确认', marketing: false, tone: 'transaction' };
  if (/^order_paid/.test(k)) return { sub: '付款成功', marketing: false, tone: 'transaction' };
  if (/^order_shipped/.test(k)) return { sub: '发货通知', marketing: false, tone: 'transaction' };
  if (/^order_refund|^order_cancel|^after_sales/.test(k)) return { sub: '售后通知', marketing: false, tone: 'transaction' };
  if (/^order_/.test(k)) return { sub: '订单通知', marketing: false, tone: 'transaction' };
  if (/^contact_notify/.test(k)) return { sub: '客户留言', marketing: false, tone: 'notice' };
  if (/^reply/.test(k)) return { sub: '站长回复', marketing: false, tone: 'notice' };
  if (/^birthday/.test(k)) return { sub: '生日快乐', marketing: false, tone: 'notice' };
  if (/^admin_invite/.test(k)) return { sub: '管理员邀请', marketing: false, tone: 'notice' };
  if (/^account/.test(k)) return { sub: '账号通知', marketing: false, tone: 'notice' };
  return { sub: '通知', marketing: false, tone: 'notice' };
}

/* ── 纯文本版（task 2026-10-30 §1.2）──
   以前 text 部分直接把带 [商品卡片]/| 分隔符的内部正文丢给收件人，
   HTML 是一套、纯文本是一堆机器标记 —— 这是垃圾邮件评分里很实的减分项。
   这里把同一份数据渲成人能读的纯文本，链接保留。 */
function plainText(bodyText: string): string {
  let t = bodyText.split('[lang:en]').join('');
  const rowsOf = (block: string) => block.split('\n').map((l) => l.trim()).filter((l) => l && l.indexOf('|') >= 0);
  t = t.replace(/\[商品卡片\]\s*\n([\s\S]*?)(?=\n\s*\n|$)/g, (_m, block: string) => {
    const out = rowsOf(block).map((l) => {
      const p = l.split('|');
      const sku = (p[1] || '').trim();
      const qty = (p[2] || '1').trim();
      const price = (p[3] || '').trim();
      return '· ' + (p[0] || '').trim() + (sku ? '（' + sku + '）' : '') + ' ×' + qty + (price ? '  ' + price : '');
    });
    return '\n' + out.join('\n') + '\n';
  });
  t = t.replace(/\[金额\]\s*\n([\s\S]*?)(?=\n\s*\n|$)/g, (_m, block: string) => {
    const out = rowsOf(block).map((l) => { const p = l.split('|'); return (p[0] || '').trim() + '：' + (p[1] || '').trim(); });
    return '\n' + out.join('\n') + '\n';
  });
  t = t.replace(/\[物流\]\s*\n([\s\S]*?)(?=\n\s*\n|$)/g, (_m, block: string) => {
    const out = block.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      if (l.indexOf('|') < 0) return l;
      const p = l.split('|');
      return (p[0] || '').trim() + '：' + (p[1] || '').trim();
    });
    return '\n' + out.join('\n') + '\n';
  });
  t = t.split('[生日图案]').join('').split('[后台按钮]').join('').split('[商品图片]').join('');
  t = t.replace(/商品链接：(\S+)/g, '$1').replace(/退订链接：(\S+)/g, '$1');
  t = t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return t + '\n\n—\nSnow Yuzu · ' + SITE + '\n';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// ── 订单商品卡片：body 里的 [商品卡片] 块（每行 名称|规格|数量|价格|图片URL|商品id）→
//    整齐卡片列表（每件商品：图+名称+规格+数量+价格一一对应，多商品全显示，图可点击跳商品页）
//    2026-10-26j 重写：display:flex 在 Gmail 等客户端不被支持导致图文重叠 → 改 HTML table 布局；
//    图片正方形缩略图（桌面 100px / 手机 72px，<head><style> 媒体查询降级安全）；object-fit:contain 防拉伸；
//    无图占位 = 浅粉块 + Snow Yuzu 小字（不再用爱心）；名称/规格/数量单价各占一行，互不重叠 ──
function itemsCardHtml(rawBlock: string, curSym: string, isEn: boolean): string {
  const lines = rawBlock.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('['));
  if (!lines.length) return '';
  const rows = lines.map((line) => {
    const p = line.split('|');
    const name = (p[0] || '商品').trim();
    const sku = (p[1] || '').trim();
    const qty = (p[2] || '1').trim();
    const price = (p[3] || '').trim();
    const img = (p[4] || '').trim();
    const pid = /^[0-9a-fA-F-]{36}$/.test((p[5] || '').trim()) ? (p[5] || '').trim() : '';
    const imgEl = img
      ? '<img src="' + esc(img) + '" alt="" width="100" height="100" class="yk-item-img" style="width:100px;height:100px;border-radius:14px;object-fit:contain;background:#FFF8FA;display:block;border:1px solid #ffd9e6;">'
      : '<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="yk-item-img" style="width:100px;height:100px;border-collapse:collapse;"><tr><td align="center" valign="middle" style="width:100px;height:100px;border-radius:14px;background:#FCE4EC;font-family:\'Millo Body\',-apple-system,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;font-size:11px;letter-spacing:1px;color:#A88E9B;text-align:center;">Snow&nbsp;Yuzu</td></tr></table>';
    const imgWrap = pid
      ? '<a href="' + SITE + '/shop/?id=' + pid + '" target="_blank" style="text-decoration:none;">' + imgEl + '</a>'
      : imgEl;
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid #ffd9e6;border-collapse:collapse;"><tr>'
      + '<td class="yk-item-td" width="100" valign="top" style="padding:12px 0;width:100px;">' + imgWrap + '</td>'
      + '<td valign="top" style="padding:12px 0 12px 14px;">'
      + '<div style="font-size:15px;font-weight:600;color:#604C57;line-height:1.5;">' + esc(name) + '</div>'
      + (sku ? '<div style="font-size:13px;color:#A88E9B;margin-top:3px;line-height:1.6;">' + (isEn ? 'SKU: ' : '规格：') + esc(sku) + '</div>' : '')
      + '<div style="font-size:14px;color:#604C57;margin-top:6px;line-height:1.6;">' + (isEn ? 'Qty ×' : '数量 ×') + esc(qty)
      + (price ? ' · <span style="color:#ff6fa5;font-weight:700;">' + curSym + (parseFloat(price.replace(/[^\d.-]/g, '')) || 0).toFixed(2) + '</span>' : '') + '</div>'
      + '</td></tr></table>';
  });
  return '<div style="margin:8px 0 4px;">' + rows.join('') + '</div>';
}
function linkify(s: string): string {
  return s.replace(/(https?:\/\/[^\s<）)】」]+)/g, (m) => '<a href="' + m + '" style="color:#A04A68;text-decoration:underline;">' + m + '</a>');
}

// ── 统一品牌模板：返回 { html, unsubUrl }（unsubUrl 供 List-Unsubscribe 头使用）──
function renderHtml(kind: string, bodyText: string): { html: string; unsubUrl: string; shopUrl: string } {
  const meta = kindMeta(kind);
  // 20261027g：双语支持——body 末尾 [lang:en] 标记决定按钮/页脚语言（触发器写入，展示前剥除）
  const isEn = bodyText.indexOf('[lang:en]') >= 0;
  bodyText = bodyText.split('[lang:en]').join('');
  // 20261027g2：徽章副标题双语——英文邮件全部用英文标签
  const SUB_EN: Record<string, string> = {
    '新品上架': 'New Arrival', '订单确认': 'Order Confirmation', '付款成功': 'Payment Confirmed',
    '发货通知': 'Shipping Notification', '售后通知': 'After-Sales Notice', '订单通知': 'Order Update',
    '客户留言': 'New Message', '站长回复': 'A Reply from Snow Yuzu', '管理员邀请': 'Admin Invitation', '账号通知': 'Account Notice',
    '通知': 'Notice',
  };
  const subLabel = isEn ? (SUB_EN[meta.sub] || 'Notice') : meta.sub;
  if (isEn) {
    // 20261027g：英文邮件的中文残留统一替换（徽章副标题/署名）
    bodyText = bodyText.split('Snow Yuzu 的小店主').join("Snow Yuzu's little shopkeeper");
  }
  // 订单商品卡片块先在原文提取（转义/金额高亮前），正文里留占位符
  let itemsHtml = '';
  const cim = bodyText.match(/\[商品卡片\]\s*\n([\s\S]*?)(?=\n\s*\n|$)/);
  if (cim) {
    const curSym = /^order_/.test(kind || '') && /\u00a5/.test(bodyText) ? '\u00a5' : '$';
    itemsHtml = itemsCardHtml(cim[1], curSym, isEn);
    bodyText = bodyText.replace(/\s*\[商品卡片\]\s*\n[\s\S]*?(?=\n\s*\n|$)/, '\n\u0002ITEMSCARD\u0002\n');
  }
  let sumHtml = '';
  const sumRaw = bodyText.match(/\[金额\]\s*\n([\s\S]*?)(?=\n\s*\n|$)/);
  if (sumRaw) {
    bodyText = bodyText.replace(/\s*\[金额\]\s*\n[\s\S]*?(?=\n\s*\n|$)/, '\n\u0003SUMROWS\u0003\n');
    const sym = bodyText.indexOf('\u00a5') >= 0 ? '\u00a5' : '$';
    const rows = sumRaw[1].split('\n').map((l) => l.trim()).filter(Boolean).filter((l) => l.indexOf('|') >= 0).map((line) => {
      const p = line.split('|');
      const label = esc((p[0] || '').trim());
      const val = parseFloat((p[1] || '0').replace(/[^\d.-]/g, '')) || 0;
      const neg = val < 0 || /折扣|减免|优惠/.test(label);
      const cls = /总额|应付|实收/.test(label) ? 'font-size:16px;font-weight:700;border-top:1.5px solid #ffd9e6;padding:10px 0 2px;' : 'font-size:14px;padding:4px 0;';
      // 2026-10-26j：justify-content:flex 在 Gmail 不支持 → 金额行同样改 table 左右两格（显示层，数值/逻辑不变）
      return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>'
        + '<td align="left" style="' + cls + 'color:#604C57;">' + label + '</td>'
        + '<td align="right" style="' + cls + 'color:' + (neg ? '#9ecfae' : '#ff6fa5') + ';font-weight:700;white-space:nowrap;">' + (neg ? '-' : '') + sym + Math.abs(val).toFixed(2) + '</td>'
        + '</tr></table>';
    }).join('');
    sumHtml = rows ? '<div style="margin:10px 0 4px;background:#FFF8FA;border:1px solid #ffd9e6;border-radius:14px;padding:12px 16px;">' + rows + '</div>' : '';
  }
  // [物流] 块 → 物流信息卡片（快递公司|运单号|发货时间|最新状态）
  let trackHtml = '';
  const trm = bodyText.match(/\[物流\]\s*\n([\s\S]*?)(?=\n\s*\n|$)/);
  if (trm) {
    const tlink = trm[1].split('\n').map((l) => l.trim()).filter((l) => l && l.indexOf('http') >= 0).join('\n');
    bodyText = bodyText.replace(/\s*\[物流\]\s*\n[\s\S]*?(?=\n\s*\n|$)/, (tlink ? '\n' + tlink + '\n' : '\n') + '\u0004TRACKCARD\u0004\n');
    const trows = trm[1].split('\n').map((l) => l.trim()).filter((l) => l && l.indexOf('|') >= 0).map((line) => {
      const p = line.split('|');
      const lb = esc((p[0] || '').trim());
      let val = esc((p[1] || '').trim());
      if (/链接|track/i.test(lb)) return ''; // 链接行由 linkify/CTA 处理，不进卡片
      return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr>'
        + '<td align="left" style="font-size:14px;color:#604C57;padding:4px 0;">' + lb + '</td>'
        + '<td align="right" style="font-size:14px;font-weight:600;color:#604C57;padding:4px 0;">' + val + '</td>'
        + '</tr></table>';
    }).join('');
    trackHtml = trows ? '<div style="margin:10px 0 4px;background:#FFF8FA;border:1px solid #ffd9e6;border-radius:14px;padding:12px 16px;">'
      + '<div style="font-size:13px;font-weight:700;color:#A88E9B;letter-spacing:1px;margin-bottom:4px;">'
      + (isEn ? 'TRACKING' : '物流信息') + '</div>' + trows + '</div>' : '';
  }
  // [生日图案] → 等宽 ASCII 兔兔蛋糕（ birthday 邮件）
  let asciiHtml = '';
  const am = bodyText.match(/\[生日图案\]/);
  if (am) {
    bodyText = bodyText.replace('\u0000', '').replace(/\s*\[生日图案\]\s*/, '\n\u0005ASCII\u0005\n');
    const art = [
      '(\_/)   ♡  ♡  ♡',
      '( ˶ᵔ ᵕ ᵔ˶ )   🎂  ~ HAPPY BIRTHDAY ~  🎂',
      '/ >🥕  ♡  ♡  ♡',
    ].join('\n');
    asciiHtml = '<div style="margin:10px 0;text-align:center;">'
      + '<pre style="display:inline-block;text-align:left;background:#FFF8FA;border:1px solid #ffd9e6;border-radius:14px;'
      + 'padding:14px 18px;font-family:Menlo,Consolas,monospace;font-size:13px;line-height:1.7;color:#604C57;margin:0;">' + art + '</pre></div>';
  }
  // [后台按钮] → 前往后台回复（仅 contact_notify 站长通知）
  let adminCta = '';
  if (bodyText.indexOf('[后台按钮]') >= 0) {
    bodyText = bodyText.replace(/\s*\[后台按钮\]\s*/, '\n');
    adminCta = '<div style="text-align:center;margin:16px 0 4px;"><a href="' + SITE + '/admin.html" target="_blank" '
      + 'style="display:inline-block;background:#FFD9E6;color:#604C57;text-decoration:none;font-size:15px;font-weight:600;'
      + 'padding:12px 34px;border-radius:999px;">' + (isEn ? 'Open Admin & Reply ♡' : '前往后台查看并回复 ♡') + '</a></div>';
  }
  let body = esc(bodyText);
  // 旧品牌名兜底替换（触发器 body 等数据层来源）
  body = body.replace(/SnowYuzu 小柚的小世界/g, BRAND);
  // 金额高亮 + 统一两位小数（她 2026-10-26：$52000.0 → $52000.00，只改显示不改数值）
  body = body.replace(/(USD |\u00a5|\$)\s?\d[\d,]*(\.\d+)?/g, (m) => {
    const mm = m.match(/([\d,]*\.?\d+)/);
    const num = mm ? parseFloat(mm[1].replace(/,/g, '')) : 0;
    if (/USD/.test(m) && m.trim().charAt(0) !== '$') return '<span style="color:#ff6fa5;font-weight:700;">USD ' + num.toFixed(2) + '</span>';
    const sym = m.trim().charAt(0);
    return '<span style="color:#ff6fa5;font-weight:700;">' + sym + num.toFixed(2) + '</span>';
  });
  // 新品上架：[商品图片]\n<url> → 圆角商品图（占位符保护，防 linkify 二次包裹）
  let imgUrl = '';
  const mim = body.match(/\[商品图片\]\s*\n?(https?:\/\/[^\s<）)】」]+)/);
  if (mim) {
    imgUrl = mim[1];
    body = body.replace(/\s*\[商品图片\]\s*\n?https?:\/\/[^\s<）)】」]+\s*/, '\u0001IMGPLACEHOLDER\u0001');
  }
  body = linkify(body).replace(/\n/g, '<br>');
  // 提取商品链接（不展示裸 URL → 行动按钮）；提取退订链接（页脚独立 Unsubscribe + 一键退订头）
  let shopUrl = '';
  const lim = body.match(/\u5546\u54c1\u94fe\u63a5\uff1a<a href=\"([^\"]+)\"/);
  if (lim) {
    shopUrl = lim[1];
    body = body.replace(/\u5546\u54c1\u94fe\u63a5\uff1a<a href=\"[^\"]+\"[^>]*>[^<]*<\/a>\s*(<br>)?/g, '');
  }
  let unsubUrl = '';
  const uim = body.match(/\u9000\u8ba2\u94fe\u63a5\uff1a<a href=\"([^\"]+)\"/);
  if (uim) {
    unsubUrl = uim[1];
    body = body.replace(/\u4e0d\u60f3\u518d\u6536\u5230[\s\S]*?\u9000\u8ba2\u94fe\u63a5\uff1a<a href=\"[^\"]+\"[^>]*>[^<]*<\/a>\s*(<br>)?/g, '');
  }
  // 行动按钮（营销/有商品链接时）：粉底深字，跳商品详情页
  let cta = '';
  if (shopUrl) {
    const label = isEn ? (meta.marketing ? 'Take a Peek ♡' : 'View Details ♡') : (meta.marketing ? '去看看这件新品 ♡' : '查看详情 ♡');
    cta = '<div style="text-align:center;margin:18px 0 4px;">'
      + '<a href="' + shopUrl + '" target="_blank" style="display:inline-block;background:#FFD9E6;color:#604C57;'
      + 'text-decoration:none;font-size:15px;font-weight:600;padding:12px 34px;border-radius:999px;">' + label + '</a></div>';
  }
  const imgBlock = imgUrl
    ? '<div style="margin:6px 0 14px;text-align:center;">'
      + (shopUrl ? '<a href="' + shopUrl + '" target="_blank" style="text-decoration:none;">' : '')
      + '<img src="' + imgUrl + '" alt="" style="width:100%;max-width:520px;aspect-ratio:1/1;object-fit:cover;border-radius:18px;display:block;margin:0 auto;border:1px solid #ffd9e6;">'
      + (shopUrl ? '</a>' : '') + '</div>'
    : '';
  body = body.replace('\u0001IMGPLACEHOLDER\u0001', imgBlock);
  body = body.replace('\u0002ITEMSCARD\u0002', itemsHtml);
  body = body.replace('\u0003SUMROWS\u0003', sumHtml);
  body = body.replace('\u0004TRACKCARD\u0004', trackHtml);
  body = body.replace('\u0005ASCII\u0005', asciiHtml);
  // 页脚分行：品牌名 / 官方邮箱 / 联系客服 / Unsubscribe（仅营销邮件）
  const unsubLine = (meta.marketing && unsubUrl)
    ? '<div style="margin-top:10px;"><a href="' + unsubUrl + '" style="color:#A88E9B;text-decoration:underline;">Unsubscribe</a>'
      + '<span style="color:#c9b6c2;"> · ' + (isEn ? 'Unsubscribing stops new-arrival emails only. Order emails are not affected.' : '退订后不再收到上新通知，订单相关邮件不受影响') + '</span></div>'
    : '';
  // ── 三套版式（2026-10-30 22:56 任务书 §1.2）──
  //   交易：左对齐小票感 + 顶部窄条；通知：居中便签；营销：徽章在前、品牌在后、大图优先
  const tone = meta.tone;
  let headerHtml = '';
  let cardStyle = '';
  let bodyPad = '';
  let topStrip = '';
  if (tone === 'transaction') {
    headerHtml = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">'
      + '<tr>'
      + '<td align="left" valign="middle" style="font-size:20px;font-weight:800;color:#604C57;letter-spacing:2px;">' + BRAND + '</td>'
      + '<td align="right" valign="middle"><span style="display:inline-block;background:#FFF1F5;color:#604C57;font-size:12px;font-weight:600;padding:4px 12px;border-radius:8px;letter-spacing:1px;">' + esc(subLabel) + '</span></td>'
      + '</tr></table>'
      + '<div style="height:2px;background:#FFD9E6;margin:12px 0 18px;border-radius:2px;"></div>';
    cardStyle = 'border-radius:18px;';
    bodyPad = '22px 24px 18px';
    topStrip = '<div style="background:#FFF7FA;border-bottom:1px solid #FFE9F1;padding:9px 24px;font-size:12px;color:#A88E9B;letter-spacing:.5px;">'
      + (isEn ? 'Order update · no reply needed' : '订单相关通知 · 无需回复') + '</div>';
  } else if (tone === 'marketing') {
    headerHtml = '<div style="text-align:center;margin-bottom:14px;">'
      + '<span style="display:inline-block;background:#FCE4EC;color:#604C57;font-size:12px;font-weight:600;padding:4px 16px;border-radius:999px;letter-spacing:2px;">' + esc(subLabel) + '</span>'
      + '<div style="font-size:28px;font-weight:800;color:#604C57;letter-spacing:5px;margin-top:10px;">' + BRAND + '</div>'
      + '</div>';
    cardStyle = 'border-radius:26px;';
    bodyPad = '24px 26px 22px';
  } else {
    headerHtml = '<div style="text-align:center;margin-bottom:18px;">'
      + '<div style="font-size:26px;font-weight:800;color:#604C57;letter-spacing:3px;">' + BRAND + '</div>'
      + '<div style="margin-top:8px;"><span style="display:inline-block;background:#FCE4EC;color:#604C57;font-size:12px;font-weight:600;padding:4px 16px;border-radius:999px;letter-spacing:2px;">' + esc(subLabel) + '</span></div>'
      + '</div>';
    cardStyle = 'border-radius:24px;';
    bodyPad = '26px 28px 22px';
  }
  const html = '<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">'
    // 手机端商品图 72px（客户端不支持 <style>/媒体查询时安全降级回内联的 100px）
    + '<style>@media only screen and (max-width:480px){.yk-item-img{width:72px !important;height:72px !important}.yk-item-td{width:72px !important}}</style></head>'
    + '<body style="margin:0;padding:0;background:#FFF8FA;">'
    + '<div style="max-width:600px;margin:0 auto;padding:28px 20px;font-family:\'Millo Body\',-apple-system,BlinkMacSystemFont,\'PingFang SC\',\'Segoe UI\',\'Microsoft YaHei\',sans-serif;">'
    + headerHtml
    + '<div style="background:#ffffff;' + cardStyle + 'overflow:hidden;border:1px solid #ffd9e6;">'
    + topStrip
    + '<div style="padding:' + bodyPad + ';font-size:15px;line-height:1.9;color:#604C57;white-space:normal;">' + body + cta + adminCta + '</div>'
    // 页脚分行：品牌名 / 官方邮箱 / 联系客服 / 退订
    + '<div style="border-top:1px solid #ffd9e6;padding:18px 28px 22px;font-size:12px;color:#A88E9B;line-height:2;">'
    + '<div style="font-size:13px;font-weight:700;color:#604C57;letter-spacing:1px;">' + BRAND + '</div>'
    + '<div>' + (isEn ? 'Official mail: ' : '官方邮箱：') + '<a href="mailto:' + OFFICIAL_MAIL + '" style="color:#A88E9B;text-decoration:none;">' + OFFICIAL_MAIL + '</a></div>'
    + '<div>' + (isEn ? 'Customer care: ' : '联系客服：') + '<a href="' + SITE + '/askbox/" style="color:#A88E9B;text-decoration:underline;">' + (isEn ? 'Leave me a message ♡' : '给我留言 ♡') + '</a></div>'
    + unsubLine
    + '</div>'
    + '</div>'
    + '<div style="text-align:center;font-size:11px;color:#A88E9B;margin-top:14px;">© ' + BRAND + ' · ' + (isEn ? 'Sent automatically by Snow Yuzu' : '本邮件由系统自动发送') + '</div>'
    + '</div></body></html>';
  return { html, unsubUrl, shopUrl };
}

// 从正文提取退订 token（触发器 body 的「退订链接：…?unsub=<token>」）
function extractUnsubToken(bodyText: string): string {
  const m = bodyText.match(/unsub=([0-9a-fA-F-]{36})/);
  return m ? m[1] : '';
}

Deno.serve(async (req: Request) => {
  // ── 公开一键退订 endpoint：List-Unsubscribe-Post=One-Click（邮件客户端原生退订走这里）──
  // RFC 8058：客户端 POST 表单 `List-Unsubscribe=One-Click` 到含令牌的 URL；令牌即凭据，
  // 只能把 notify_new 置 false，幂等，无敏感数据返回
  let oneClickToken = req.method === 'POST'
    ? (new URL(req.url).searchParams.get('unsub') ?? '')
    : '';
  if (oneClickToken && !/^[0-9a-fA-F-]{36}$/.test(oneClickToken)) oneClickToken = '';
  if (oneClickToken) {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/unsubscribe_notify', {
      method: 'POST',
      headers: { apikey: SERVICE_ROLE, Authorization: 'Bearer ' + SERVICE_ROLE, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: oneClickToken }),
    });
    const ok = r.ok && (await r.json()) === true;
    return new Response(JSON.stringify({ ok }), { status: ok ? 200 : 400, headers: { 'Content-Type': 'application/json' } });
  }
  if (req.method !== 'POST' || WORKER_TOKEN === '' || req.headers.get('authorization') !== 'Bearer ' + WORKER_TOKEN) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }
  return processQueue();
});

async function processQueue(): Promise<Response> {
  const pickRes = await fetch(SUPABASE_URL + '/rest/v1/rpc/email_pick_batch', {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE, Authorization: 'Bearer ' + SERVICE_ROLE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_limit: BATCH, p_max_attempts: MAX_ATTEMPTS }),
  });
  if (!pickRes.ok) {
    return new Response(JSON.stringify({ error: 'pick failed', detail: (await pickRes.text()).slice(0, 200) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  const rows: any[] = await pickRes.json();
  if (!rows.length) {
    return new Response(JSON.stringify({ ok: true, sent: 0, failed: 0, note: '队列为空' }), { headers: { 'Content-Type': 'application/json' } });
  }

  // SMTP 未配置：把取出的行放回 pending（不烧重试次数），如实返回
  if (!SMTP_USER || !SMTP_PASS) {
    for (const row of rows) { await mark(row.id, 'pending', null); }
    return new Response(JSON.stringify({
      ok: true, sent: 0, failed: 0,
      note: 'SMTP 未配置（需要 snowyuzustudio@gmail.com 的 App Password），队列保留 ' + rows.length + ' 封待发',
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const rendered = renderHtml(row.kind ?? '', row.body);
      // List-Unsubscribe 头（营销邮件）：One-Click POST endpoint + 页面 URL 备用
      const headers: Record<string, string> = {};
      const toneNow = kindMeta(row.kind ?? '').tone;
      if (toneNow === 'transaction') {
        // 交易通知不是自动应答对象：告诉邮件客户端不要拿它去触发休假/自动回复
        headers['X-Auto-Response-Suppress'] = 'OOF, AutoReply';
        headers['Auto-Submitted'] = 'auto-generated';
      }
      if (kindMeta(row.kind ?? '').marketing && rendered.unsubUrl) {
        const token = extractUnsubToken(row.body);
        const oneClick = token ? SUPABASE_URL + '/functions/v1/email-worker?unsub=' + token : '';
        headers['List-Unsubscribe'] = (oneClick ? '<' + oneClick + '>, ' : '') + '<' + rendered.unsubUrl + '>';
        headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      }
      await transporter.sendMail({
        from: '"' + BRAND + '" <' + SMTP_USER + '>',
        to: row.to_email,
        subject: row.subject.split('[lang:en]').join(''), // 顾客可见标题绝不带语言标记
        text: plainText(row.body || ''),                 // 纯文本版：同一份内容，人可读，不再丢机器标记
        html: rendered.html,
        replyTo: SMTP_USER, // 客户直接回复邮件 → 到官方邮箱
        headers,
      });
      await mark(row.id, 'sent', null);
      sent++;
      // 同一批不在一秒内连发一堆：给 SMTP 一点节奏，避免看起来像批量发信
      await new Promise((r) => setTimeout(r, 250));
    } catch (e) {
      const msg = String(e && (e as any).message ? (e as any).message : e).slice(0, 500);
      const attempts = (row.attempts ?? 0) + 1;
      await mark(row.id, attempts >= MAX_ATTEMPTS ? 'dead' : 'failed', msg, attempts);
      failed++;
    }
  }
  return new Response(JSON.stringify({ ok: true, sent, failed }), { headers: { 'Content-Type': 'application/json' } });
}

async function mark(id: string, status: string, err: string | null, attempts?: number) {
  const body: any = { status, last_error: err, sent_at: status === 'sent' ? new Date().toISOString() : null };
  if (attempts != null) body.attempts = attempts;
  await fetch(SUPABASE_URL + '/rest/v1/email_log?id=eq.' + id, {
    method: 'PATCH',
    headers: { apikey: SERVICE_ROLE, Authorization: 'Bearer ' + SERVICE_ROLE, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
