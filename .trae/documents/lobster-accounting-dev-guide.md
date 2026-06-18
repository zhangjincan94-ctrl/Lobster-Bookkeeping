# 🦞 龙虾记账小程序 — 从零开始的开发指南

## 目录

- [一、项目架构总览](#一项目架构总览)
- [二、环境安装](#二环境安装)
- [三、后端配置与启动](#三后端配置与启动)
- [四、前端配置与启动](#四前端配置与启动)
- [五、开发流程](#五开发流程)
- [六、常见问题](#六常见问题)

---

## 一、项目架构总览

### 1.1 整体架构图

```
┌──────────────────────────────────────────────────────┐
│                  微信小程序 (前端)                      │
│  文件位置: d:\Project\miniprogram\                     │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ 卖家工作台 │  │ 买家查账页 │  │ 分享卡片入口       │  │
│  └─────┬────┘  └─────┬────┘  └────────┬──────────┘  │
│        └──────────────┼───────────────┘              │
│              wx.request (HTTPS)                       │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────────┐
│              后端服务 (Node.js + Koa2)                 │
│  文件位置: d:\Project\server\                         │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ 交易模块  │  │ 统计模块  │  │ 导出模块          │  │
│  └─────┬────┘  └─────┬────┘  └────────┬──────────┘  │
│        └──────────────┼───────────────┘              │
│              ┌────────┴────────┐                     │
│              │   业务逻辑层     │                     │
│              │  (鉴权/校验/计算) │                     │
│              └────────┬────────┘                     │
└──────────────────────┼───────────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────────┐
│              数据存储层                                │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  MySQL    │  │  Redis   │  │  文件存储          │  │
│  │ (主数据)  │  │ (缓存)   │  │ (导出文件)         │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 1.2 技术栈一览

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| **小程序前端** | 微信原生小程序 | - | 性能最优，API 支持最全 |
| **UI 组件** | Vant Weapp (可选) | - | 成熟稳定的组件库 |
| **后端框架** | Node.js + Koa2 | Node >= 18 | 轻量灵活的 Web 框架 |
| **ORM** | Sequelize | ^6.35 | Node.js 生态成熟 ORM |
| **数据库** | MySQL | 8.0+ | 关系型数据库，事务支持完善 |
| **缓存** | Redis | 7.0+ | 会话管理、统计缓存 (MVP 阶段可暂不用) |
| **部署** | Docker + Nginx | - | 标准化部署 (生产环境用) |

### 1.3 后端代码架构

```
server/
├── src/
│   ├── app.js                 # 🔑 Koa 应用入口，加载中间件和路由
│   ├── sync.js                # 🔧 数据库建表脚本 (开发用)
│   │
│   ├── config/                # ⚙️ 配置层
│   │   ├── index.js           #   读取 .env 环境变量
│   │   └── database.js        #   Sequelize 数据库连接配置
│   │
│   ├── models/                # 📦 数据模型层 (Sequelize Model)
│   │   ├── index.js           #   模型统一导出 + 关联关系建立
│   │   ├── merchant.js        #   商户表 (id, openid, shop_name, phone)
│   │   ├── buyer.js           #   买家表 (id, merchant_id, name, phone, share_token)
│   │   ├── transaction.js     #   交易表 (龙虾类型/重量/单价/金额/付款/配送)
│   │   └── payment_record.js  #   付款记录表 (交易关联的多次付款)
│   │
│   ├── services/              # 🧠 业务逻辑层
│   │   ├── authService.js     #   微信登录 → 获取openid → 查找/创建商户 → 签发JWT
│   │   ├── merchantService.js #   商户信息读取/更新
│   │   ├── buyerService.js    #   买家CRUD + 统计计算(消费总额/欠款)
│   │   └── transactionService.js # 交易CRUD + 自动计算金额 + 付款状态推算
│   │
│   ├── controllers/           # 🎮 控制器层 (处理HTTP请求/响应)
│   │   ├── authController.js  #   POST /api/auth/login
│   │   ├── merchantController.js # GET/PUT /api/merchants/profile
│   │   ├── buyerController.js #   买家CRUD + 公开查账接口
│   │   └── transactionController.js # 交易CRUD + 补录付款
│   │
│   ├── routes/                # 🛤️ 路由层 (URL → 控制器方法映射)
│   │   ├── index.js           #   路由汇总入口
│   │   ├── auth.js            #   /api/auth/*
│   │   ├── merchant.js        #   /api/merchants/*
│   │   ├── buyer.js           #   /api/buyers/*
│   │   └── transaction.js     #   /api/transactions/*
│   │
│   ├── middlewares/           # 🛡️ 中间件
│   │   ├── auth.js            #   JWT鉴权：从请求头提取token → 验证 → 注入ctx.state.merchant
│   │   └── errorHandler.js    #   全局错误捕获 → 统一JSON错误响应
│   │
│   └── utils/                 # 🔧 工具函数
│       ├── wx.js              #   调用微信 jscode2session 接口
│       └── response.js        #   标准化响应格式: success() / error() / paginate()
│
├── .env                       # 环境变量 (数据库密码、JWT密钥、微信AppID等)
├── .env.example               # 环境变量模板
├── .gitignore
└── package.json               # 依赖声明 + 启动脚本
```

**请求处理流程：**

```
客户端请求
    ↓
Koa app.js (加载中间件: cors → bodyparser → errorHandler)
    ↓
Routes (URL 匹配 → 如果需要鉴权则走 auth 中间件)
    ↓
Controller (参数校验 → 调用 Service)
    ↓
Service (业务逻辑 → 调用 Model 操作数据库)
    ↓
Model (Sequelize ORM → MySQL)
    ↓
返回: Service 返回数据 → Controller 包装响应 → 客户端收到JSON
```

### 1.4 前端代码架构

```
miniprogram/
├── app.js                     # 🔑 小程序入口，启动时检查登录态
├── app.json                   # 📋 全局配置 (页面路由、tabBar、导航栏)
├── app.wxss                   # 🎨 全局样式 (卡片/按钮/标签/flex工具类)
├── project.config.json        # ⚙️ 微信开发者工具项目配置
├── sitemap.json               # 🗺️ 小程序页面索引配置
│
├── utils/                     # 🔧 工具模块
│   ├── config.js              #   API基础地址 + 端点定义 (函数形式支持动态路径)
│   ├── request.js             #   🔑 网络请求封装
│   │                          #     - 自动 camelCase ↔ snake_case 双向转换
│   │                          #     - 自动注入 Authorization: Bearer token
│   │                          #     - 401 自动清除登录态跳转登录页
│   │                          #     - 提供 get()/post()/put()/del() 快捷方法
│   ├── auth.js                #   登录态管理 (token/商户信息的 Storage 存取)
│   └── format.js              #   格式化工具 (价格/日期/状态文本/状态CSS类名)
│
├── assets/icons/              # 🖼️ tabBar 图标 (6个: home/order/friends × 正常/选中)
│
└── pages/                     # 📄 页面 (每个页面4个文件: .js .json .wxml .wxss)
    ├── login/                 # 🔐 登录页
    │   └── 微信一键登录 → 获取code → POST /api/auth/login → 存token → 跳转首页
    │
    ├── index/                 # 🏠 卖家工作台首页 (tabBar第1项)
    │   └── 问候语 + 今日统计 + 快捷操作 + 最近5笔交易
    │
    ├── transaction/           # 💰 交易模块
    │   ├── list/              #   交易列表 (tabBar第2项)
    │   │   └── 状态筛选 + 日期范围 + 分页加载 + 浮动添加按钮
    │   ├── add/               #   新增交易
    │   │   └── 买家搜索/新建 + 龙虾类型选择 + 自动计算总价 + 付款/配送信息
    │   └── detail/            #   交易详情
    │       └── 只读信息展示 + 补录付款弹窗 + 分享给买家
    │
    ├── buyer/                 # 👤 买家模块
    │   ├── list/              #   买家列表 (tabBar第3项)
    │   │   └── 搜索 + 消费/欠款统计 + 新增买家弹窗
    │   └── detail/            #   买家详情
    │       └── 统计卡片 + 操作按钮(记一笔/分享) + 该买家交易记录
    │
    └── share/                 # 🔗 买家查账 (公开页面，无需登录)
        └── records/           #   通过 share_token 查看买家消费和欠款
```

### 1.5 数据库表关系

```
┌─────────────┐       ┌─────────────┐       ┌─────────────────┐
│  merchants   │       │   buyers    │       │  transactions   │
│─────────────│       │─────────────│       │─────────────────│
│ id (PK)     │──1:N──│ merchant_id │──1:N──│ buyer_id (FK)   │
│ openid      │       │ id (PK)     │       │ merchant_id(FK) │
│ shop_name   │       │ name        │       │ lobster_type    │
│ phone       │       │ phone       │       │ weight/quantity │
│ created_at  │       │ share_token │       │ unit_price      │
└─────────────┘       │ created_at  │       │ total_amount    │
                      └──────┬──────┘       │ payment_status  │
                             │              │ paid_amount     │
                             │              │ delivery_*      │
                             │              │ transaction_time│
                             │              └────────┬────────┘
                             │                       │
                             │              ┌────────┴────────┐
                             │              │ payment_records  │
                             │              │─────────────────│
                             │              │ id (PK)         │
                             └─────────1:N──│ transaction_id  │
                                            │ amount          │
                                            │ payment_method  │
                                            │ paid_at         │
                                            └─────────────────┘
```

### 1.6 API 接口总览

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|:----:|------|
| POST | `/api/auth/login` | ❌ | 微信登录，返回 JWT token |
| GET | `/api/merchants/profile` | ✅ | 获取商户信息 |
| PUT | `/api/merchants/profile` | ✅ | 更新商户信息 |
| GET | `/api/buyers` | ✅ | 买家列表 (支持搜索/分页) |
| POST | `/api/buyers` | ✅ | 新增买家 |
| PUT | `/api/buyers/:id` | ✅ | 更新买家 |
| GET | `/api/buyers/:id` | ✅ | 买家详情 (含统计) |
| GET | `/api/buyers/:token/records` | ❌ | 买家查账 (公开，通过share_token) |
| GET | `/api/transactions` | ✅ | 交易列表 (支持筛选/分页) |
| POST | `/api/transactions` | ✅ | 新增交易 |
| GET | `/api/transactions/:id` | ✅ | 交易详情 (含付款记录) |
| PUT | `/api/transactions/:id` | ✅ | 更新交易 |
| POST | `/api/transactions/:id/payments` | ✅ | 补录付款记录 |

---

## 二、环境安装

> 你需要安装以下 3 个软件。请按照顺序操作。

### 2.1 Node.js（后端运行环境）

**作用：** 后端服务基于 Node.js 运行

**下载地址：** https://nodejs.org/

**安装步骤：**
1. 打开上面的链接，点击 **LTS（长期支持版）** 下载，当前推荐 v20.x 或 v22.x
2. 运行安装程序，一路 **Next** 即可，所有选项保持默认
3. 安装完成后，打开 **PowerShell**（按 Win 键搜索 "PowerShell"），输入以下命令验证：

```powershell
node --version
# 应输出类似 v20.11.0

npm --version
# 应输出类似 10.2.4
```

> ⚠️ 如果提示"node 不是可识别的命令"，需要重启电脑或重新打开 PowerShell 窗口。

### 2.2 MySQL（数据库）

**作用：** 存储商户、买家、交易等所有业务数据

**下载地址：** https://dev.mysql.com/downloads/installer/

**安装步骤：**
1. 打开上面的链接，点击 **mysql-installer-community** 下载（较大的那个完整安装包）
2. 运行安装程序：
   - Choosing a Setup Type：选择 **Server only**（只装服务器即可）
   - Type and Networking：保持默认（Config Type: Development Computer）
   - Authentication Method：选择 **Use Legacy Authentication Method**（兼容性更好）
   - Accounts and Roles：**设置 root 密码**，请记住你设的密码，后面配置要用
   - Windows Service：勾选 **Start the MySQL Server at System Startup**（开机自启）
   - Apply Configuration：点击 Execute 等待完成
3. 安装完成后验证，打开 PowerShell：

```powershell
mysql -u root -p
# 输入你设置的密码，能进入 mysql> 提示符即成功
```

4. 创建项目数据库：

```sql
CREATE DATABASE lobster_accounting DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
exit
```

> 💡 **推荐安装 MySQL 可视化工具**（可选，方便查看数据）：
> - Navicat：https://www.navicat.com.cn/ （付费，有试用）
> - DBeaver：https://dbeaver.io/ （免费开源，推荐）

### 2.3 微信开发者工具（前端开发 & 调试）

**作用：** 编写、预览、调试微信小程序

**下载地址：** https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html

**安装步骤：**
1. 打开上面的链接，下载 **稳定版 (Stable)** Windows 64位版本
2. 运行安装程序，保持默认选项安装
3. 首次启动需要微信扫码登录

**注册微信小程序账号（必须）：**
1. 打开 https://mp.weixin.qq.com/
2. 点击 **立即注册** → 选择 **小程序**
3. 按提示完成注册（需要未绑定过微信公众号的邮箱）
4. 注册完成后登录，在 **开发管理 → 开发设置** 中获取：
   - **AppID**（小程序ID）：形如 `wx1234567890abcdef`
   - **AppSecret**（小程序密钥）：点击生成，**请妥善保存，只显示一次**

> 💡 开发阶段可以使用微信提供的 **测试号**，无需注册正式账号也能开发调试。
> 测试号申请：https://mp.weixin.qq.com/wxamp/sandbox

---

## 三、后端配置与启动

### 3.1 配置环境变量

打开文件 `d:\Project\server\.env`，修改以下内容：

```env
# 数据库配置 — 修改为你的实际信息
DB_HOST=127.0.0.1          # 数据库地址，本地保持默认
DB_PORT=3306               # 数据库端口，保持默认
DB_NAME=lobster_accounting # 数据库名，与上面创建的一致
DB_USER=root               # 数据库用户名，保持默认
DB_PASSWORD=你的MySQL密码    # ← 改成你安装MySQL时设置的root密码

# JWT密钥 — 生产环境必须更换为随机字符串
JWT_SECRET=lobster_accounting_jwt_secret_2024

# 微信小程序配置 — 填入你的 AppID 和 AppSecret
WX_APPID=你的AppID          # ← 改成你的微信小程序 AppID
WX_SECRET=你的AppSecret      # ← 改成你的微信小程序 AppSecret

# 服务端口
PORT=3000
```

### 3.2 安装依赖

打开 PowerShell，执行：

```powershell
cd d:\Project\server
npm install
```

> 首次安装可能需要 30-60 秒，请耐心等待。出现 `added xxx packages` 即成功。
> npm WARN 警告可以忽略，不影响使用。

### 3.3 创建数据库表

```powershell
cd d:\Project\server
npm run sync
```

> 输出 `数据库表已创建` 即成功。此命令会根据模型定义自动在 MySQL 中创建 4 张表：merchants、buyers、transactions、payment_records。
>
> ⚠️ `force: true` 模式会**删除已有表重建**，生产环境请勿使用。

### 3.4 启动后端服务

```powershell
cd d:\Project\server
npm run dev
```

> 输出 `服务器运行在端口 3000` 即启动成功。
> 使用 `nodemon` 启动，修改代码后会自动重启。

**验证服务是否正常：**

在浏览器中打开 http://localhost:3000/ ，应看到：

```json
{"code":0,"message":"龙虾记账服务运行中","data":null}
```

**停止服务：** 在 PowerShell 窗口按 `Ctrl + C`

### 3.5 后端常用命令

| 命令 | 作用 |
|------|------|
| `npm run dev` | 启动开发服务器（代码修改自动重启） |
| `npm start` | 启动生产服务器（不会自动重启） |
| `npm run sync` | 重建数据库表（⚠️ 会清空数据） |

---

## 四、前端配置与启动

### 4.1 配置 API 地址

打开文件 `d:\Project\miniprogram\utils\config.js`，修改 `baseUrl`：

```js
var baseUrl = 'http://localhost:3000'  // ← 填入后端服务地址
```

> 💡 如果后端部署在云服务器上，改为服务器的公网地址，如 `http://123.45.67.89:3000`
>
> ⚠️ 微信小程序正式版要求使用 HTTPS，开发阶段可以在开发者工具中关闭域名校验。

### 4.2 配置小程序 AppID

打开文件 `d:\Project\miniprogram\project.config.json`，修改 appid：

```json
"appid": "wx1234567890abcdef"  // ← 改成你的微信小程序 AppID
```

> 如果使用测试号，可以保持默认的 `wx0000000000000000`。

### 4.3 在微信开发者工具中打开项目

1. 启动 **微信开发者工具**
2. 点击 **"+"** 或 **"导入项目"**
3. 选择项目目录：`d:\Project\miniprogram`
4. AppID：填入你的小程序 AppID，或选择 **测试号**
5. 点击 **确定**

### 4.4 开发者工具设置（重要）

打开项目后，需要做以下设置：

1. 点击右上角 **详情** → **本地设置**
2. ✅ 勾选 **不校验合法域名、web-view（业务域名）、TLS版本以及HTTPS证书**
   - 开发阶段必须勾选，否则无法请求 localhost 后端
3. ✅ 勾选 **启用自定义处理命令**
4. 其他保持默认

### 4.5 编译运行

1. 点击工具栏的 **编译** 按钮（或按 Ctrl+B）
2. 在模拟器中应看到登录页面
3. 点击 **预览** 可以用手机微信扫码在真机上预览

### 4.6 替换 tabBar 图标

当前项目使用的是占位图标（空白方块），需要替换为正式图标：

1. 准备 6 个 **81×81 像素** 的 PNG 图片：
   - `home.png` — 首页图标（灰色）
   - `home-active.png` — 首页图标（橙色）
   - `order.png` — 交易图标（灰色）
   - `order-active.png` — 交易图标（橙色）
   - `friends.png` — 买家图标（灰色）
   - `friends-active.png` — 买家图标（橙色）
2. 将这 6 个图片放入 `d:\Project\miniprogram\assets\icons\` 目录覆盖现有文件
3. 在微信开发者工具中重新编译

> 💡 图标资源推荐：
> - 阿里巴巴 IconFont：https://www.iconfont.cn/ （免费，海量图标）
> - 搜索关键词：home、order、user、friends

---

## 五、开发流程

### 5.1 完整的开发启动步骤

每次开始开发时，按以下顺序操作：

```
1. 确保 MySQL 服务正在运行
   → Windows 搜索"服务" → 找到 MySQL80 → 确认状态为"正在运行"

2. 启动后端
   → 打开 PowerShell
   → cd d:\Project\server
   → npm run dev
   → 看到"服务器运行在端口 3000"

3. 启动前端
   → 打开微信开发者工具
   → 点击"龙虾记账"项目
   → 编译运行
   → 在模拟器或真机中调试

4. 修改代码
   → 后端：修改 .js 文件后 nodemon 自动重启
   → 前端：修改 .wxml/.wxss/.js 后点击编译或 Ctrl+B
```

### 5.2 调试技巧

**后端调试：**
- 在代码中使用 `console.log()` 输出日志
- 日志会显示在运行 `npm run dev` 的 PowerShell 窗口中
- 使用 Postman 或浏览器直接测试 API 接口

**前端调试：**
- 微信开发者工具底部有 **Console** 和 **Network** 面板
- Console 查看 `console.log` 输出和错误信息
- Network 查看网络请求和响应内容
- 点击 **调试器** 可以在 Sources 面板中设置断点

### 5.3 微信登录开发说明

微信登录需要真实的 AppID 和 AppSecret 才能工作。开发阶段有两种方案：

**方案A：使用微信测试号（推荐新手）**
1. 访问 https://mp.weixin.qq.com/wxamp/sandbox 获取测试号的 AppID 和 AppSecret
2. 在 `project.config.json` 和 `.env` 中填入测试号信息
3. 在微信开发者工具中使用测试号编译即可

**方案B：绕过登录直接测试**
1. 手动在数据库 merchants 表中插入一条测试商户记录
2. 手动生成一个 JWT token（可以用在线工具 https://jwt.io/）
3. 在微信开发者工具的 Storage 中手动设置 token 和 merchantInfo
4. 注释掉 app.js 中的登录检查逻辑

---

## 六、常见问题

### Q1: `npm install` 报错 "EPERM" 或权限错误
**A:** 以管理员身份运行 PowerShell：右键 PowerShell → 以管理员身份运行

### Q2: `npm run sync` 报错 "ER_ACCESS_DENIED_ERROR"
**A:** 数据库密码不正确。检查 `.env` 文件中的 `DB_PASSWORD` 是否与你安装 MySQL 时设置的密码一致。

### Q3: `npm run sync` 报错 "ECONNREFUSED"
**A:** MySQL 服务未启动。按 Win 键搜索"服务"，找到 MySQL80，右键启动。

### Q4: 微信开发者工具无法请求后端接口
**A:** 确保以下设置：
1. 后端已启动（PowerShell 窗口显示"服务器运行在端口 3000"）
2. `config.js` 中 `baseUrl` 设置正确
3. 开发者工具 → 详情 → 本地设置 → 勾选"不校验合法域名"

### Q5: 点击登录没反应
**A:** 微信登录接口需要有效的 AppID 和 AppSecret。开发阶段请参考 [5.3 微信登录开发说明](#53-微信登录开发说明)。

### Q6: 模拟器中 tabBar 不显示或显示空白
**A:** tabBar 图标文件必须是有效的 PNG 格式。当前是占位图标，替换为正式 81×81 像素 PNG 后即可正常显示。

### Q7: 修改代码后页面没有更新
**A:**
- 前端：按 Ctrl+B 重新编译，或点击编译按钮
- 后端：`npm run dev` 使用 nodemon 会自动重启，检查终端是否有报错

### Q8: 如何查看数据库中的数据
**A:** 推荐安装 DBeaver（免费）：https://dbeaver.io/
1. 新建连接 → MySQL → 填入 root 用户名和密码
2. 连接后展开 `lobster_accounting` 数据库即可查看和编辑表数据
