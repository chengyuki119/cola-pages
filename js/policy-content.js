/* ═══════════ 政策内容唯一数据源 + 渲染器（FAQ / 退货退款 / 配送 / 隐私 / 条款 / 键帽购买须知）
   20261028p12 版：任务书《Snow Yuzu 商品说明及全部网站政策改版》全文；品牌统一 Snow Yuzu。
   渲染规则：每个小标题在独立圆角内容框上方（.pol-sec = 标题 + .pol-card 正文框）。
   FAQ：每个问题独立成组（问题标题突出，答案在下方独立浅粉框内）。
   site_settings 覆盖：若库里有 policy_<key>_zh / policy_<key>_en（简单 HTML 字符串），优先渲染它；
   fetch 失败或无数据时用内置默认内容，页面不报错。 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://vmmmuyxrsiufzurwbydg.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtbW11eXhyc2l1Znp1cndieWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NzM2NTAsImV4cCI6MjEwODQ0OTY1MH0.SbdbAJV5hP3MtyZxf7DQUAD9Fm-XNlVC5PaYf47lzsw';

  // ===== FAQ（问题行双语同时显示，答案按当前语言）=====
  var FAQ = {
    zh: { items: [
      { q: '手工键帽会完全没有瑕疵吗？', a: '手工制作的树脂键帽可能存在少量细小气泡、轻微打磨痕迹或表面纹理差异。我们会尽力控制制作质量，并在发货前检查商品。具体制作特点请查看对应商品页面。' },
      { q: '轻微气泡可以申请退款吗？', a: '对于已合理披露、符合商品描述且处于合理范围内的轻微工艺差异，不能仅以此为由要求退款或换货。如果气泡明显、存在较大空洞、影响外观或正常使用，或商品与描述存在重大不符，请联系我们核实。' },
      { q: '为什么实物颜色和图片看起来不完全一样？', a: '拍摄光线、相机设置、屏幕显示、树脂材质和制作工艺都可能造成轻微色差。商品颜色及实际外观请以收到的实物为准。我们会尽力准确展示商品，但无法保证所有设备上显示的颜色完全一致。' },
      { q: '收到商品时发现损坏怎么办？', a: '请尽快联系我们，提供订单编号以及清晰展示商品损坏情况的照片或视频。我们会核实情况，并根据售后政策及适用法律协助处理。' },
      { q: '收到错误的商品怎么办？', a: '请提供订单编号、实际收到商品的照片及相关说明。我们会核对订单信息并联系你处理。' },
      { q: '所有键帽都适用于我的键盘吗？', a: '不一定。下单前请确认键盘是否使用标准十字轴，以及键帽的尺寸、高度和其他兼容要求。如不确定，请先联系我们。' },
      { q: '可以定制键帽吗？', a: '部分款式可能支持定制，具体可定制内容、价格和制作周期请查看商品页面或提前联系我们确认。' },
      { q: '定制商品需要等多久？', a: '制作周期取决于设计复杂度、当前订单数量和材料准备情况。具体预计时间以商品页面或双方确认的订单信息为准。' },
      { q: '配送需要多长时间？', a: '订单处理和运输时间可能因商品、定制要求、配送方式及目的地而不同。请查看商品页面和结账页面显示的信息。' },
      { q: '什么情况下可以包邮？', a: '是否包邮取决于具体商品、订单金额、组合要求和配送地址。请以商品页面或结账页面实际显示的包邮条件及运费为准。' },
      { q: '可以取消订单吗？', a: '如需取消订单，请尽快联系我们。是否可以取消取决于订单状态、制作进度、商品类型、售前披露的条款及适用法律。' },
      { q: '可以因为改变主意而退货吗？', a: '退换货资格取决于商品类型、订单情况、购买前披露的条件及适用法律。请查看退货与退款政策；如不确定，请在下单前联系我们。' },
      { q: '如何联系 Snow Yuzu？', a: '请通过网站的「联系我们」页面提交问题，并尽量附上订单编号，以便我们更快核实。' },
      { q: '在哪里可以查看完整的网站政策？', a: '你可以在网站页脚或相关页面查看退货与退款政策、配送政策、隐私政策和服务条款。' }
    ]},
    en: { items: [
      { q: 'Are handmade keycaps perfectly flawless?', a: 'Handmade resin keycaps may contain a few tiny bubbles, minor sanding marks, or surface variations. We do our best to maintain quality and inspect each item before shipping. Please check the relevant product listing for specific details.' },
      { q: 'Can I request a refund for minor bubbles?', a: 'Minor crafting variations that were reasonably disclosed, match the product description, and fall within a reasonable range do not automatically qualify for a refund or exchange. If bubbles are conspicuous, there are large voids, normal use or appearance is materially affected, or the item differs significantly from its description, please contact us for review.' },
      { q: 'Why does the item look slightly different from the photos?', a: 'Lighting, camera settings, screen displays, resin materials, and crafting processes may cause slight color differences. Please refer to the actual item received for its true color and appearance. We do our best to represent products accurately, but colors cannot be guaranteed to look identical on every device.' },
      { q: 'What if my item arrives damaged?', a: 'Please contact us promptly with your order number and clear photos or videos showing the damage. We will review the issue and assist under our after-sales policy and applicable law.' },
      { q: 'What if I receive the wrong item?', a: 'Please provide your order number, photos of the item received, and a description of the issue. We will check the order details and contact you about the next steps.' },
      { q: 'Will every keycap fit my keyboard?', a: 'Not necessarily. Before ordering, check whether your keyboard uses a standard cross stem and verify the keycap dimensions, profile, and other compatibility requirements. If you are unsure, please contact us first.' },
      { q: 'Can keycaps be customized?', a: 'Some designs may be available for customization. Please check the product listing or contact us to confirm the available options, pricing, and estimated production time.' },
      { q: 'How long do custom orders take?', a: 'Production time depends on design complexity, current order volume, and material availability. Please refer to the product listing or the timing confirmed for your order.' },
      { q: 'How long does shipping take?', a: 'Processing and delivery times may vary depending on the item, customization requirements, shipping method, and destination. Please check the information shown on the product and checkout pages.' },
      { q: 'When does an order qualify for free shipping?', a: 'Free shipping depends on the product, order total, bundle requirements, and shipping destination. Please refer to the free-shipping conditions and shipping charges shown on the product or checkout page.' },
      { q: 'Can I cancel my order?', a: 'If you need to cancel an order, please contact us as soon as possible. Eligibility depends on the order status, production progress, item type, terms disclosed before purchase, and applicable law.' },
      { q: 'Can I return an item if I changed my mind?', a: 'Return eligibility depends on the item type, order circumstances, terms disclosed before purchase, and applicable law. Please review the Return & Refund Policy or contact us before ordering if you are unsure.' },
      { q: 'How can I contact Snow Yuzu?', a: 'Please use the website\'s Contact page and include your order number whenever possible so we can review your question more efficiently.' },
      { q: 'Where can I read the full store policies?', a: 'You can find the Return & Refund Policy, Shipping Policy, Privacy Policy, and Terms of Service in the website footer or relevant policy pages.' }
    ]}
  };

  // ===== 退货与退款政策 =====
  var RETURN = {
    zh: { blocks: [
      { h2: '一般政策' },
      { p: '请在下单前仔细阅读商品描述、图片、尺寸、规格、制作说明及配送信息。不同商品的售后条件可能因商品类型、制作状态和订单情况而有所不同。' },
      { p: '如果收到的商品存在问题，请通过网站的「联系我们」页面与我们沟通，并提供订单编号及相关照片或视频。' },
      { p: '本政策不排除消费者根据适用法律享有的权利。' },
      { h2: '手工制品' },
      { p: '手工包包、娃娃、树脂键帽及其他手工作品可能存在合理范围内的轻微线头、缝线差异、细小气泡、打磨痕迹、纹理差异、尺寸差异或轻微颜色偏差。' },
      { p: '对于与商品描述一致、已合理披露、不实质影响正常用途且属于合理制作范围的轻微差异，不能仅以这些差异为由认定商品存在重大缺陷。' },
      { p: '但明显影响外观或功能的缺陷、未披露的重大瑕疵、运输损坏及商品与描述存在重大不符的情况，将根据具体情况和适用法律处理。' },
      { h2: '键帽商品' },
      { p: '手工树脂键帽可能存在少量细小气泡、轻微打磨痕迹及表面纹理差异。商品图片也可能因拍摄光线、设备和屏幕显示而与实物存在轻微色差，商品颜色及实际外观请以收到的实物为准。' },
      { p: '下单前请仔细查看商品图片、制作说明和键盘兼容性要求。' },
      { p: '对于事先合理披露、与商品描述一致且处于合理范围内的轻微工艺差异，不能仅以此为由要求退款或换货。' },
      { p: '如果出现明显气泡或空洞、明显影响外观或正常使用的缺陷、运输损坏、错发，或实际商品与描述存在重大不符，请提供清晰的照片或视频并联系我们，以便核实处理。' },
      { h2: '可申请售后的情况' },
      { p: '如果出现以下情况，请联系我们：' },
      { ul: ['商品在运输过程中明显损坏。', '收到的商品与订单不符。', '商品存在售前未披露的明显缺陷。', '实际商品与商品描述或双方确认的定制方案存在重大不符。', '商品存在依法应当获得售后处理的其他问题。'] },
      { p: '我们会根据订单记录、商品页面说明、相关证据及适用法律核实处理。' },
      { h2: '通常不适用退换货的情况' },
      { p: '在适用法律允许的范围内，以下情况可能不符合退换货条件：' },
      { ul: ['与商品描述一致、已合理披露且不影响正常用途的轻微手工制作差异。', '已在商品页面清楚说明并由买家在购买前知悉的商品特征。', '商品送达后因不当使用、存放、安装、自行改造或意外造成的损坏。', '对于依法可以限制退换的定制或个性化商品，因个人改变主意而提出的申请。'] },
      { p: '具体适用条件需结合商品页面的事先说明、订单情况和适用法律判断。不得仅凭本条拒绝依法应当受理的售后申请。' },
      { h2: '如何申请退货或退款' },
      { p: '如需申请售后，请按以下步骤操作：' },
      { ol: ['尽快通过网站的「联系我们」页面联系 Snow Yuzu。', '提供订单编号及问题说明。', '附上能清楚展示商品及问题的照片或视频。', '等待我们确认处理方案后，再按照提供的指引进行退货或其他操作。'] },
      { p: '未经确认，不建议自行将商品寄回，以免影响后续核实。' },
      { h2: '退款处理' },
      { p: '如果退款申请获批，我们会告知适用的退款方式和处理步骤。退款通常会在可行的情况下退回原支付方式。' },
      { p: '实际到账时间取决于支付平台或金融机构的处理速度。运费及其他相关费用将根据订单条款、具体情况和适用法律处理。' },
      { h2: '联系我们' },
      { p: '如有退货、退款或商品质量相关问题，请通过网站的「联系我们」页面提交申请，并尽量提供订单编号。' }
    ]},
    en: { blocks: [
      { h2: 'General Policy' },
      { p: 'Please review the product description, photos, dimensions, specifications, crafting notes, and shipping information before ordering. After-sales conditions may vary depending on the item type, production status, and order circumstances.' },
      { p: 'If there is a problem with your order, please contact us through the website\'s Contact page with your order number and relevant photos or videos.' },
      { p: 'Nothing in this policy excludes rights that consumers may have under applicable law.' },
      { h2: 'Handmade Items' },
      { p: 'Handmade bags, dolls, resin keycaps, and other handmade products may have minor variations within a reasonable range, including loose threads, stitching differences, tiny bubbles, sanding marks, texture variations, small size differences, or slight color variations.' },
      { p: 'Minor variations that are consistent with the product description, reasonably disclosed, and do not materially affect normal use are not automatically considered significant defects.' },
      { p: 'However, defects that materially affect appearance or function, significant undisclosed imperfections, shipping damage, and material differences from the description will be reviewed based on the circumstances and applicable law.' },
      { h2: 'Keycap Products' },
      { p: 'Handmade resin keycaps may contain a few tiny bubbles, minor sanding marks, or subtle surface variations. Product photos may also differ slightly from the actual item due to lighting, camera settings, and screen displays. Please refer to the actual item received for its true color and appearance.' },
      { p: 'Please review the product photos, crafting notes, and keyboard compatibility requirements before purchasing.' },
      { p: 'Minor crafting variations that are reasonably disclosed, consistent with the description, and within a reasonable range do not automatically qualify for a refund or exchange.' },
      { p: 'If the item has conspicuous bubbles or voids, defects that materially affect appearance or normal use, shipping damage, an incorrect item, or a material difference from the description, please contact us with clear photos or videos so we can review the issue.' },
      { h2: 'When You May Request After-Sales Assistance' },
      { p: 'Please contact us if:' },
      { ul: ['Your item is visibly damaged during shipping.', 'You receive an item that does not match your order.', 'The item has a significant defect that was not disclosed before purchase.', 'The item materially differs from its description or the custom design confirmed by both parties.', 'Another issue arises for which a remedy is required under applicable law.'] },
      { p: 'We will review the order records, product listing, available evidence, and applicable legal requirements.' },
      { h2: 'Situations That May Not Qualify for Returns or Exchanges' },
      { p: 'To the extent permitted by applicable law, the following circumstances may not qualify for a return or exchange:' },
      { ul: ['Minor handmade variations that match the description, were reasonably disclosed, and do not affect normal use.', 'Product characteristics clearly stated on the listing and disclosed before purchase.', 'Damage caused after delivery by improper use, storage, installation, modification, or accidents.', 'Change-of-mind requests for custom or personalized items where applicable law permits restrictions.'] },
      { p: 'Eligibility depends on the prior product disclosure, order circumstances, and applicable law. This section must not be used to deny a remedy that is legally required.' },
      { h2: 'How to Request a Return or Refund' },
      { p: 'To request after-sales assistance:' },
      { ol: ['Contact Snow Yuzu through the website\'s Contact page as soon as reasonably possible.', 'Provide your order number and a description of the issue.', 'Include clear photos or videos showing the item and the problem.', 'Wait for confirmation and instructions before returning the item or taking further action.'] },
      { p: 'Please do not send an item back without confirming the return instructions, as this may complicate the review process.' },
      { h2: 'Refund Processing' },
      { p: 'If a refund is approved, we will explain the applicable refund method and next steps. Where feasible, refunds will generally be issued to the original payment method.' },
      { p: 'The time required for funds to appear depends on the payment provider or financial institution. Shipping and other related costs will be handled according to the order terms, circumstances, and applicable law.' },
      { h2: 'Contact Us' },
      { p: 'For return, refund, or product-quality questions, please use the website\'s Contact page and include your order number whenever possible.' }
    ]}
  };

  // ===== 配送政策 =====
  var SHIPPING = {
    zh: { blocks: [
      { h2: '订单处理' },
      { p: '订单将在付款确认后进入处理流程。手工制作、定制需求、商品库存及订单数量都可能影响处理时间。' },
      { p: '如果商品页面标注了预计制作或处理时间，请以对应页面的信息为准。特殊定制订单的开始制作时间及预计完成时间，应以双方确认的订单信息为准。' },
      { h2: '配送方式与运费' },
      { p: '可用配送方式、运费及包邮条件以商品页面或结账页面实际显示的信息为准。不同商品、订单金额、配送地址和促销活动可能适用不同条件。' },
      { p: '如商品有明确的包邮门槛或组合购买要求，请在下单前确认是否满足条件。未达到适用门槛时，系统应在结账时显示实际运费。' },
      { h2: '预计送达时间' },
      { p: '预计送达时间可能受到配送方式、目的地、天气、节假日、承运商运营及其他因素影响。除非订单中另有明确约定，预计送达时间仅供参考，不构成保证。' },
      { h2: '收货地址' },
      { p: '请在提交订单前仔细核对收货地址、邮政编码及联系方式。如发现地址有误，请尽快联系我们。' },
      { p: '订单开始处理或包裹交给承运商后，我们无法保证一定可以修改地址。因地址错误造成的额外费用或配送问题，将根据具体情况和适用法律处理。' },
      { h2: '物流追踪' },
      { p: '如果配送方式支持物流追踪，我们会在可以提供相关信息时向买家发送物流单号或查询链接。' },
      { p: '物流记录可能需要一定时间更新。请以承运商的官方物流信息为准。' },
      { h2: '包裹丢失、损坏或错发' },
      { p: '如果包裹疑似丢失、收到时明显损坏，或包裹内商品与订单不符，请尽快联系我们，并提供订单编号、相关照片及物流信息。' },
      { p: '我们会核实订单与配送情况，并根据实际情况、承运商规则及适用法律协助处理。' },
      { h2: '联系我们' },
      { p: '如有配送相关问题，请通过网站的「联系我们」页面与我们联系，并提供订单编号。' }
    ]},
    en: { blocks: [
      { h2: 'Order Processing' },
      { p: 'Orders enter processing after payment is confirmed. Handmade production, customization requirements, stock availability, and order volume may affect processing time.' },
      { p: 'If a product listing provides an estimated production or processing time, please refer to that listing. For custom orders, the agreed order details determine the expected start and completion time.' },
      { h2: 'Shipping Methods and Fees' },
      { p: 'Available shipping methods, shipping fees, and free-shipping eligibility are based on the information displayed on the product or checkout page. Different products, order totals, destinations, and promotions may have different conditions.' },
      { p: 'If an item has a free-shipping threshold or bundle requirement, please check whether your order qualifies before purchasing. Applicable shipping charges should be displayed at checkout.' },
      { h2: 'Estimated Delivery Time' },
      { p: 'Estimated delivery times may be affected by the shipping method, destination, weather, holidays, carrier operations, and other factors. Unless expressly agreed otherwise in the order, delivery estimates are provided for reference and are not guaranteed.' },
      { h2: 'Shipping Address' },
      { p: 'Please verify your shipping address, postal code, and contact details before submitting your order. If you notice an error, contact us as soon as possible.' },
      { p: 'Once processing has begun or the package has been handed to the carrier, we cannot guarantee that the address can be changed. Additional costs or delivery issues caused by an incorrect address will be reviewed based on the circumstances and applicable law.' },
      { h2: 'Tracking' },
      { p: 'If the selected shipping method supports tracking, we will provide the tracking number or tracking link when available.' },
      { p: 'Tracking updates may take time to appear. Please refer to the carrier\'s official tracking information.' },
      { h2: 'Lost, Damaged, or Incorrect Packages' },
      { p: 'If your package appears to be lost, arrives visibly damaged, or contains an item different from your order, please contact us promptly with your order number, relevant photos, and tracking information.' },
      { p: 'We will review the order and shipping details and assist according to the circumstances, carrier procedures, and applicable law.' },
      { h2: 'Contact Us' },
      { p: 'For shipping questions, please contact us through the website\'s Contact page and include your order number.' }
    ]}
  };

  // ===== 隐私政策 =====
  var PRIVACY = {
    zh: { blocks: [
      { h2: '我们收集的信息' },
      { p: '根据你使用网站和购买商品的方式，我们可能收集姓名、电子邮箱、联系方式、收货地址、订单信息、交易状态、联系表单内容，以及维持网站运行和安全所需的技术信息。' },
      { h2: '信息使用方式' },
      { p: '我们可能使用相关信息来处理订单、确认付款、安排配送、回复咨询、提供售后服务、发送必要的订单通知、维护网站安全、防范欺诈及履行法律义务。' },
      { p: '只有在具备适当依据并符合适用规则的情况下，我们才会发送营销邮件，并在需要时提供退订方式。' },
      { h2: '付款信息' },
      { p: '付款可能由第三方支付服务商处理。我们会根据实际支付流程接收订单所需的付款状态及相关交易信息。' },
      { p: '第三方处理的支付信息受相应服务商的隐私政策、安全措施及适用规则约束。' },
      { h2: '信息共享' },
      { p: '为完成订单和维护网站，我们可能在必要范围内向支付服务商、物流承运商、网站托管服务商、数据库服务商及其他实际使用的技术服务商提供相关信息。' },
      { p: '法律要求时，我们可能依法披露相关信息。' },
      { h2: 'Cookies 与技术数据' },
      { p: '网站可能根据实际启用的功能使用 Cookies 或类似技术，以维持登录状态、记住用户偏好、保障功能正常运行或了解网站使用情况。具体使用的技术应以网站实际配置为准。' },
      { h2: '数据安全与保存期限' },
      { p: '我们会采取与网站实际技术能力相符的合理措施保护信息，并在业务、法律和安全需要的合理期限内保存相关记录。' },
      { p: '任何在线服务都无法保证绝对安全。如果发生需要依法通知的个人信息安全事件，我们会按照适用要求处理。' },
      { h2: '你的隐私权利' },
      { p: '根据你所在地及适用法律，你可能有权请求查阅、更正、删除特定个人信息，或了解相关信息的处理方式。' },
      { p: '你可以通过网站的「联系我们」页面提交请求。我们可能需要核实请求人的身份，并依法处理请求。' },
      { h2: '第三方服务' },
      { p: '网站部分功能可能依赖第三方服务。第三方服务可能依据自己的隐私政策和条款处理相关信息。' },
      { h2: '儿童隐私' },
      { p: '本网站不会故意以违反适用法律的方式收集儿童个人信息。如发现相关信息的收集或处理不符合适用要求，我们会根据法律规定采取适当措施。' },
      { h2: '政策更新' },
      { p: '我们可能因网站功能、业务流程或法律要求的变化更新本政策。更新后的版本将在本页面公布，并在适用情况下说明生效日期。' },
      { h2: '联系我们' },
      { p: '如有隐私相关问题或请求，请通过网站的「联系我们」页面提交。' }
    ]},
    en: { blocks: [
      { h2: 'Information We Collect' },
      { p: 'Depending on how you use the website and purchase products, we may collect your name, email address, contact details, shipping address, order information, transaction status, contact-form submissions, and technical information needed to operate and secure the website.' },
      { h2: 'How We Use Information' },
      { p: 'We may use relevant information to process orders, confirm payments, arrange shipping, respond to inquiries, provide after-sales support, send necessary order notifications, maintain website security, prevent fraud, and meet legal obligations.' },
      { p: 'Marketing emails will be sent only where there is an appropriate basis and in accordance with applicable requirements. An unsubscribe option will be provided where required.' },
      { h2: 'Payment Information' },
      { p: 'Payments may be processed by third-party payment providers. We receive the payment status and transaction details needed to manage the order according to the actual payment flow.' },
      { p: 'Payment information handled by third parties is subject to their privacy policies, security measures, and applicable requirements.' },
      { h2: 'Information Sharing' },
      { p: 'To fulfill orders and operate the website, we may share relevant information as necessary with payment providers, shipping carriers, hosting providers, database providers, and other technical service providers actually used by the website.' },
      { p: 'We may also disclose information when required by law.' },
      { h2: 'Cookies and Technical Data' },
      { p: 'Depending on the features enabled, the website may use cookies or similar technologies to maintain login sessions, remember preferences, support website functionality, or understand how the website is used. The specific technologies used reflect the website\'s actual configuration.' },
      { h2: 'Data Security and Retention' },
      { p: 'We take reasonable measures consistent with the website\'s actual technical capabilities to protect information and retain records for periods reasonably necessary for business, legal, and security purposes.' },
      { p: 'No online service can guarantee absolute security. If a personal information incident requires notification under applicable law, we will respond according to the relevant requirements.' },
      { h2: 'Your Privacy Rights' },
      { p: 'Depending on your location and applicable law, you may have the right to request access to, correction of, or deletion of certain personal information, or to learn how your information is handled.' },
      { p: 'You may submit a request through the website\'s Contact page. We may need to verify your identity and will handle the request according to applicable law.' },
      { h2: 'Third-Party Services' },
      { p: 'Some website features may rely on third-party services. Those services may process information according to their own privacy policies and terms.' },
      { h2: 'Children\'s Privacy' },
      { p: 'The website does not knowingly collect children\'s personal information in a manner that violates applicable law. If we identify information collected or processed in a way that does not meet applicable requirements, we will take appropriate steps as required by law.' },
      { h2: 'Policy Updates' },
      { p: 'We may update this policy when website features, business practices, or legal requirements change. The updated version will be published on this page, with an effective date where appropriate.' },
      { h2: 'Contact Us' },
      { p: 'For privacy-related questions or requests, please use the website\'s Contact page.' }
    ]}
  };

  // ===== 服务条款 =====
  var TERMS = {
    zh: { blocks: [
      { h2: '同意服务条款' },
      { p: '访问或使用 Snow Yuzu 网站，即表示你同意遵守适用的服务条款和网站政策。下单前请仔细阅读商品描述、价格、规格、配送信息及相关政策。' },
      { h2: '商品信息' },
      { p: '我们会尽合理努力确保商品描述、图片、价格、规格和库存信息准确。由于拍摄光线、屏幕显示、材质及手工制作工艺不同，实物可能与屏幕显示存在轻微差异。' },
      { p: '商品的具体内容和包含的配件，以对应商品页面及订单确认信息为准。' },
      { h2: '手工制品与颜色差异' },
      { p: '手工制品可能存在合理范围内的轻微制作差异，例如细小气泡、打磨痕迹、纹理差异、缝线差异或轻微颜色变化。商品图片也可能因拍摄光线、设备和屏幕显示而与实物存在轻微色差，商品颜色及实际外观请以收到的实物为准。' },
      { p: '本条不意味着任何程度的缺陷都属于正常情况。对于明显缺陷、未披露的重大瑕疵或与商品描述存在重大不符的情况，将根据售后政策及适用法律处理。' },
      { h2: '订单与付款' },
      { p: '订单的提交不代表商品一定已经售出或付款已经完成。订单状态以网站实际记录和支付服务商的确认信息为准。' },
      { p: '如果订单无法履行，我们会在适用情况下联系买家并说明可行的处理方案。' },
      { h2: '价格与库存' },
      { p: '商品价格、详情和库存可能发生变化。价格及库存的具体情况以结账时的有效信息和订单确认记录为准。' },
      { p: '任何价格或库存更新均不影响适用法律所确立的权利与义务。' },
      { h2: '知识产权' },
      { p: '网站原创文字、图形、照片、标志和设计可能受到知识产权法律保护。未经授权，不得擅自复制、转载或用于商业用途。' },
      { p: '第三方品牌、角色及相关素材的权利仍归各自权利人所有。' },
      { h2: '禁止行为' },
      { p: '不得利用网站从事违法活动、尝试未经授权访问、干扰网站正常运行、实施欺诈，或不当获取、使用其他用户的信息。' },
      { h2: '第三方服务' },
      { p: '网站部分功能可能依赖第三方支付、托管、数据库、邮件或物流服务。这些服务受各自适用的条款和政策约束。' },
      { h2: '责任限制' },
      { p: '本条款中的任何内容均不排除或限制适用法律禁止排除或限制的责任或消费者权利。其他责任问题应根据实际情况及适用法律判断。' },
      { h2: '适用法律' },
      { p: '本条款的适用法律及争议处理方式，应根据 Snow Yuzu 的实际经营情况和适用法律确定。' },
      { h2: '条款更新' },
      { p: '我们可能根据网站功能、业务流程或法律要求更新本条款。更新版本将在本页面公布。' },
      { h2: '联系我们' },
      { p: '如对服务条款有任何疑问，请通过网站的「联系我们」页面提交。' }
    ]},
    en: { blocks: [
      { h2: 'Agreement to These Terms' },
      { p: 'By accessing or using the Snow Yuzu website, you agree to comply with the applicable terms of service and website policies. Please review product descriptions, prices, specifications, shipping information, and relevant policies before placing an order.' },
      { h2: 'Product Information' },
      { p: 'We make reasonable efforts to ensure that product descriptions, photos, prices, specifications, and stock information are accurate. Actual items may differ slightly from screen images because of lighting, display settings, materials, and handmade processes.' },
      { p: 'The contents and included accessories are determined by the relevant product listing and order confirmation.' },
      { h2: 'Handmade Items and Color Differences' },
      { p: 'Handmade products may have minor variations within a reasonable range, such as tiny bubbles, sanding marks, texture differences, stitching variations, or slight color changes. Product photos may also differ slightly from the actual item because of lighting, camera settings, and screen displays. Please refer to the actual item received for its true color and appearance.' },
      { p: 'This does not mean that defects of any severity are considered normal. Significant defects, material undisclosed imperfections, and material differences from the description will be handled under the after-sales policy and applicable law.' },
      { h2: 'Orders and Payment' },
      { p: 'Submitting an order does not necessarily mean that the sale has been completed or payment has been received. The order status is based on the website\'s actual records and payment-provider confirmation.' },
      { p: 'If an order cannot be fulfilled, we will contact the buyer where appropriate and explain the available options.' },
      { h2: 'Prices and Availability' },
      { p: 'Product prices, details, and availability may change. The applicable price and availability are based on the information valid at checkout and the order confirmation records.' },
      { p: 'Price or stock updates do not affect rights and obligations established under applicable law.' },
      { h2: 'Intellectual Property' },
      { p: 'Original text, graphics, photos, logos, and designs on the website may be protected by intellectual property laws. They may not be copied, redistributed, or used commercially without authorization.' },
      { p: 'Rights to third-party brands, characters, and related materials remain with their respective owners.' },
      { h2: 'Prohibited Use' },
      { p: 'You may not use the website for unlawful activities, attempt unauthorized access, interfere with website operations, commit fraud, or improperly obtain or use other users\' information.' },
      { h2: 'Third-Party Services' },
      { p: 'Some website features may rely on third-party payment, hosting, database, email, or shipping services. Those services are subject to their respective terms and policies.' },
      { h2: 'Limitation of Liability' },
      { p: 'Nothing in these terms excludes or limits liability or consumer rights that cannot be excluded or limited under applicable law. Other liability questions will be determined according to the circumstances and applicable law.' },
      { h2: 'Governing Law' },
      { p: 'The governing law and dispute-resolution provisions for these terms are determined according to Snow Yuzu\'s actual business circumstances and applicable law.' },
      { h2: 'Changes to These Terms' },
      { p: 'We may update these terms as website features, business practices, or legal requirements change. The updated version will be published on this page.' },
      { h2: 'Contact Us' },
      { p: 'If you have questions about these terms, please contact us through the website\'s Contact page.' }
    ]}
  };

  // ===== 键帽商品购买须知（商品详情页按类型展示；数据源同政策，口径一致）=====
  var KEYCAP = {
    zh: [
      { t: '手工制作说明', blocks: [
        { p: '本商品为手工制作的键帽。由于制作、固化和手工整理工艺的特点，成品可能存在少量细小气泡、轻微打磨痕迹、细微表面纹理差异或其他合理范围内的手工痕迹。' },
        { p: '我们会尽力控制制作质量，并在发货前检查商品。对于较明显的瑕疵，会尽可能在商品图片或描述中提前说明。' },
        { p: '下单前请仔细查看商品图片和说明，确认自己可以接受合理范围内的手工制作差异哦。' }
      ]},
      { t: '气泡与打磨痕迹说明', blocks: [
        { p: '手工制作的树脂键帽可能出现少量细小气泡或轻微打磨痕迹，这些情况在合理范围内可能属于制作工艺差异。' },
        { p: '但并不是所有气泡或瑕疵都自动属于正常范围。如果出现较大气泡、明显空洞、数量异常或明显影响商品外观、结构或正常使用的缺陷，需要根据具体情况判断。' },
        { p: '如果商品存在未披露的明显缺陷、运输损坏，或与商品描述存在重大不符，请联系我们并提供清晰的照片或视频，以便核实处理。' }
      ]},
      { t: '商品颜色说明：色差以实物为准', blocks: [
        { p: '由于拍摄光线、拍摄设备、屏幕显示设置、树脂材质及制作工艺等因素，商品图片与实际商品之间可能存在轻微色差。不同设备上看到的颜色也可能有所不同。' },
        { p: '商品颜色及实际外观请以收到的实物为准。我们会尽力真实展示商品的颜色和细节，但无法保证屏幕显示与实物完全一致。' },
        { p: '下单前请仔细查看商品图片和说明，并确认可以接受合理范围内的颜色差异哦。' }
      ]},
      { t: '键盘兼容性', blocks: [
        { p: '下单前请确认自己的键盘是否使用标准十字轴（MX-style cross stem），并核实键帽尺寸、高度及其他兼容要求。' },
        { p: '并非所有键帽都适用于所有键盘。特殊结构、非标准轴体、磁轴键盘或其他特殊型号可能存在兼容性差异。' },
        { p: '如不确定是否适用，请在下单前联系 Snow Yuzu 确认。商品页面应尽可能注明已知的兼容性限制。' }
      ]},
      { t: '定制商品说明', blocks: [
        { p: '部分键帽可能支持定制图案、颜色、文字或立体装饰。具体可定制内容、报价、制作周期及可修改次数，以商品页面说明或双方确认的订单信息为准。' },
        { p: '定制商品开始制作后，通常无法随意更改设计或取消订单。具体限制必须在买家下单前清楚说明，并遵守适用法律。' },
        { p: '如果定制商品存在明显制作缺陷、与双方确认的设计存在重大不符，或其他依法应当获得售后处理的情况，请联系我们。' }
      ]},
      { t: '商品价格、数量与规格', blocks: [
        { p: '不同款式、尺寸、装饰复杂度和定制要求可能对应不同价格。购买单颗键帽、多颗组合或整套商品时，请以所选规格、数量、商品页面价格和结账金额为准。' },
        { p: '如商品提供多个款式或规格，请在下单前确认选择正确。不要把单颗价格误认为整套价格，也不要在没有明确说明的情况下默认商品包含额外配件。' }
      ]}
    ],
    en: [
      { t: 'Handmade Item Notice', blocks: [
        { p: 'This keycap is handmade. Due to the nature of crafting, curing, and hand-finishing, a finished piece may contain a few tiny bubbles, minor sanding marks, subtle surface texture variations, or other small handmade imperfections.' },
        { p: 'We do our best to maintain quality and inspect each item before shipping. More noticeable imperfections will be disclosed in the product photos or description whenever reasonably possible.' },
        { p: 'Please review the product photos and description before ordering to make sure you are comfortable with reasonable handmade variations.' }
      ]},
      { t: 'Bubbles and Sanding Marks', blocks: [
        { p: 'Handmade resin keycaps may contain a few tiny bubbles or minor sanding marks. These may be normal variations within a reasonable range of the crafting process.' },
        { p: 'However, not every bubble or imperfection automatically qualifies as a normal variation. Large bubbles, conspicuous voids, unusually extensive imperfections, or defects that materially affect appearance, structure, or normal use will be reviewed based on the specific circumstances.' },
        { p: 'If your item has a significant undisclosed defect, shipping damage, or a material difference from its description, please contact us with clear photos or videos so we can review the issue.' }
      ]},
      { t: 'Color Disclaimer', blocks: [
        { p: 'Slight color differences may occur between product photos and the actual item due to lighting, camera settings, screen displays, resin materials, and crafting processes. Colors may also appear different on different devices.' },
        { p: 'Please refer to the actual item received for its true color and appearance. We do our best to represent each product\'s colors and details accurately, but exact color matching between screen images and the physical item cannot be guaranteed.' },
        { p: 'Please review the product photos and description before ordering to make sure you are comfortable with reasonable color variations.' }
      ]},
      { t: 'Keyboard Compatibility', blocks: [
        { p: 'Before ordering, please check whether your keyboard uses a standard MX-style cross stem and verify the keycap dimensions, profile, and other compatibility requirements.' },
        { p: 'Not every keycap fits every keyboard. Special mounting systems, non-standard switches, magnetic-switch keyboards, and certain models may have different compatibility requirements.' },
        { p: 'If you are unsure whether a keycap will fit your keyboard, please contact Snow Yuzu before ordering. Known compatibility limitations should be stated on the relevant product page whenever possible.' }
      ]},
      { t: 'Custom Orders', blocks: [
        { p: 'Some keycaps may be customized with different patterns, colors, text, or three-dimensional decorations. Customization options, pricing, production estimates, and revision limits will be based on the product listing or the order details confirmed by both parties.' },
        { p: 'Once production begins, design changes or cancellations may not always be possible. Applicable conditions must be clearly disclosed before purchase and must comply with applicable law.' },
        { p: 'If a custom item has a significant manufacturing defect, materially differs from the approved design, or otherwise qualifies for a remedy under applicable law, please contact us.' }
      ]},
      { t: 'Prices, Quantities, and Specifications', blocks: [
        { p: 'Prices may vary depending on the design, size, decorative details, and customization requirements. For single keycaps, bundles, or sets, please refer to the selected variant, quantity, listed price, and checkout total.' },
        { p: 'If multiple styles or specifications are available, please verify your selection before ordering. Do not assume that a single-key price includes a full set or additional accessories unless the listing explicitly states so.' }
      ]}
    ]
  };

  window.POLICY_CONTENT = { faq: FAQ, return: RETURN, shipping: SHIPPING, privacy: PRIVACY, terms: TERMS, keycap: KEYCAP };

  // ===== 小工具 =====
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function currentLang() {
    if (window.LANG === 'zh' || window.LANG === 'en') return window.LANG;
    try {
      var l = localStorage.getItem('yuki-lang');
      if (l === 'en') return 'en';
    } catch (e) {}
    return 'zh';
  }

  // ===== site_settings 覆盖（fetch 失败/无数据 → 用内置默认，页面不报错）=====
  var SETTINGS_CACHE = null;
  function fetchOverrides(key) {
    var kZh = 'policy_' + key + '_zh';
    var kEn = 'policy_' + key + '_en';
    if (SETTINGS_CACHE && (kZh in SETTINGS_CACHE || kEn in SETTINGS_CACHE)) return Promise.resolve(SETTINGS_CACHE);
    var url = SUPABASE_URL + '/rest/v1/site_settings?select=key,value&key=in.(' + encodeURIComponent(kZh) + ',' + encodeURIComponent(kEn) + ')';
    return fetch(url, { headers: { 'apikey': ANON, 'Authorization': 'Bearer ' + ANON } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var map = SETTINGS_CACHE || {};
        (Array.isArray(rows) ? rows : []).forEach(function (row) {
          if (row && row.key && typeof row.value === 'string') map[row.key] = row.value;
          else if (row && row.key && row.value) map[row.key] = String(row.value);
        });
        SETTINGS_CACHE = map;
        return map;
      })
      .catch(function () {
        if (!SETTINGS_CACHE) SETTINGS_CACHE = {};
        return SETTINGS_CACHE;
      });
  }

  // ===== 结构化内容 → HTML（20261028p12：每个小标题 + 独立圆角文本框）=====
  function renderBlocks(blocks) {
    var out = [], cur = null;
    function flush() {
      if (cur) {
        out.push('<section class="pol-sec"><h2 class="pol-h2">' + esc(cur.title) + '</h2><div class="pol-card">' + cur.inner + '</div></section>');
        cur = null;
      }
    }
    (blocks || []).forEach(function (b) {
      var html = '';
      if (b.h2 != null) { flush(); cur = { title: b.h2, inner: '' }; return; }
      if (b.p != null) html = '<p' + (b.strong ? ' class="pol-strong"' : '') + '>' + esc(b.p) + '</p>';
      else if (Array.isArray(b.ul)) html = '<ul class="pol-list">' + b.ul.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
      else if (Array.isArray(b.ol)) html = '<ol class="pol-list pol-ol">' + b.ol.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>';
      if (!html) return;
      if (cur) cur.inner += html;
      else out.push('<div class="pol-card">' + html + '</div>');
    });
    flush();
    return out.join('');
  }

  // 键帽购买须知（商品页用；标题+独立框，与政策页同一布局语言）
  window.renderKeycapNotes = function (containerId, lang) {
    var box = document.getElementById(containerId || 'keycap-notes');
    if (!box) return;
    var l = lang || currentLang();
    var data = KEYCAP[l] || KEYCAP.zh;
    box.innerHTML = '<h2 class="keycap-notes-title" data-zh="键帽购买须知 ♡" data-en="Keycap Shopping Notes ♡"></h2>'
      + data.map(function (sec) {
        return '<section class="pol-sec"><h3 class="pol-h2 keycap-h3">' + esc(sec.t) + '</h3><div class="pol-card">'
          + sec.blocks.map(function (b) { return '<p>' + esc(b.p) + '</p>'; }).join('')
          + '</div></section>';
      }).join('');
    // 标题走双语替换（applyLang 会处理 data-zh/data-en）
    var t = box.querySelector('.keycap-notes-title');
    if (t && typeof applyLang === 'function') applyLang(l);
  };

  function renderFaq(lang) {
    var data = (POLICY_CONTENT.faq && POLICY_CONTENT.faq[lang]) || POLICY_CONTENT.faq.zh;
    var other = lang === 'en' ? 'zh' : 'en';
    var dataOther = (POLICY_CONTENT.faq && POLICY_CONTENT.faq[other]) || POLICY_CONTENT.faq.zh;
    return (data.items || []).map(function (item, i) {
      var otherItem = (dataOther.items || [])[i] || {};
      var qEn = lang === 'en' ? item.q : (otherItem.q || '');
      var qZh = lang === 'zh' ? item.q : (otherItem.q || '');
      return '<div class="faq-item">' +
        '<button type="button" class="faq-q">' +
          (qEn ? '<span class="faq-q-en">' + esc(qEn) + '</span>' : '') +
          (qZh ? '<span class="faq-q-zh">' + esc(qZh) + '</span>' : '') +
          '<span class="faq-arrow">▾</span>' +
        '</button>' +
        '<div class="faq-a"><div class="faq-a-box"><p>' + esc(item.a) + '</p></div></div>' +
        '</div>';
    }).join('');
  }

  // ===== 对外渲染入口 =====
  window.renderPolicyPage = function (key, containerId) {
    var box = document.getElementById(containerId || 'policy-content');
    if (!box) return;
    var lang = currentLang();
    var data = window.POLICY_CONTENT[key];
    if (!data) { box.innerHTML = ''; return; }

    if (key === 'faq') {
      box.innerHTML = '<div class="faq-list">' + renderFaq(lang) + '</div>';
    } else {
      var langData = data[lang] || data.zh;
      box.innerHTML = '<div class="pol-sections">' + renderBlocks(langData.blocks) + '</div>';
    }

    fetchOverrides(key).then(function (map) {
      var html = map['policy_' + key + '_' + lang];
      if (typeof html === 'string' && html.trim() !== '') {
        box.innerHTML = '<div class="pol-card pol-custom">' + html + '</div>';
      }
    });
  };

  // FAQ 展开/收起（事件委托，重渲染后依然可用）
  document.addEventListener('click', function (e) {
    var q = e.target && e.target.closest ? e.target.closest('.faq-q') : null;
    if (!q) return;
    var item = q.closest('.faq-item');
    if (item) item.classList.toggle('open');
  });

  // 语言切换时重渲染（延迟 50ms，等页面自身逻辑先跑；site-common 会整页刷新，这里是兜底）
  window.__policyLangBound = (function () {
    document.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.lang-btn') : null;
      if (!btn || !window.__policyCurrentKey) return;
      setTimeout(function () { window.renderPolicyPage(window.__policyCurrentKey); }, 50);
    });
    return true;
  })();
})();
