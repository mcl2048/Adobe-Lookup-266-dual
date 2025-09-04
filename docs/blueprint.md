# **App Name**: Adobe Subscription Lookup

## Core Features:

- Data Ingestion: Fetches and parses CSV data from provided URLs (blueskyy.csv and parvis.csv) to build a searchable dataset.
- Results Display: Displays search results in a clear table format with columns for Adobe Account (email), Status, Organization, Subscription Details, and Device Limit. The table includes dual language support (English and Chinese).
- Subscription Query: Queries the ingested CSV data based on user-provided email address to determine subscription status, organization, subscription details, and device limit. The system uses logic to calculate the device limit and concatenate subscription details as needed.

## Style Guidelines:

- Color scheme based on macOS gray tones.
- Accent color: Purple (#800080) for highlights and interactive elements.
- Display the logo from https://www.parvis.uk/wp-content/uploads/2025/02/Website-LOGO-300x101.png, resized to fit the application's header.
- Dual language display (American English and Simplified Chinese) with English on top and Chinese below.

## Original User Request:
化身职业资深程序员，设计一个Adobe订阅查询系统：
系统名称：Adobe 订阅查询系统（翻译为美式英文）
系统所有者：Parvis School of Economics and Music

开发前准备：
- 仔细研究Adobe管理用户使用的CSV表格模板和格式
- 将我的附件blueskyy.csv和parvis.csv加入系统
https://s3.tebi.io/cache.parvis.top/files/blueskyy.csv
https://s3.tebi.io/cache.parvis.top/files/parvis.csv

- 仔细研究查询系统UI，要求：
1.参考Mac 系统灰色方案的配色，重点色使用紫色
2.LOGO：调用https://www.parvis.uk/wp-content/uploads/2025/02/Website-LOGO-300x101.png,调整为适合的大小

- 界面语言
1.使用美式英语（母语级别）和简体中文（母语级别）双语同时显示。
2.2种语言分行显示，上面为美式英语，下面为简体中文。

系统功能概述：
- 输入邮箱地址后查询csv文件：blueskyy.csv 和 parvis.csv

- 查询结果表格展示：
1.adobe账号（即邮箱地址）

2.状态。只有2个结果，在blueskyy.csv 和 parvis.csv可以查询到的显示“有效”，查询不到的显示“无效”

3.所属组织。在blueskyy.csv可以查询到的显示“Blueskyy National Academy of Arts”；在parvis.csv可以查询到的显示“Parvis School of Economics and Music”；在blueskyy.csv 和parvis.csv可以查询到的显示““Blueskyy National Academy of Arts & Parvis School of Economics and Music””

4.订阅详情。自动检索Adobe 用户csv表格blueskyy.csv 和 parvis.csv产品订阅字段。有“Default Adobe Express for K-12 configuration”的显示为“Adobe Express”；有“Default All Apps plan configuration”的显示为“All Apps plan”；有“Default Creative Cloud All Apps Student License with a MOQ of 250 configuration”的显示为“All Apps MOQ of 250 Plan”，如果同时出现多个订阅的，可以叠加显示，以“/”分隔（比如Adobe Express / All Apps plan）

5.设备限制。只在blueskyy.csv 和 parvis.csv其中一个表格能查询到的，显示为“2台设备”；在blueskyy.csv 和 parvis.csv能同时查询到的，显示为“4台设备”；在blueskyy.csv 和 parvis.csv都无法查询到的，显示为“0台设备”。

- 页面底部提示信息
1. 提示信息“本数据库不与adobe数据库同步更新，更新时间为每周六早上9点，如果查询不到你的有效信息可以在更新后再进行查询，或咨询学校IT Desk Service：itdesk@my.parvis.uk”
2.加入Copyright信息（可根据当前年份自动调整）。
  