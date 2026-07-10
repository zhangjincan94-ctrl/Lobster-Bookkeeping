# 龙虾记账数据库说明

## 查看云端数据

当前测试环境使用 TiDB Cloud 的 `lobster_accounting` 数据库。

1. 登录 TiDB Cloud，打开 `lobster-accounting-test` 实例。
2. 进入 `SQL Editor`。
3. 先执行：

```sql
USE lobster_accounting;
SHOW TABLES;
```

只读查看数据时使用 `SELECT`，不要在测试过程中执行 `DELETE`、`UPDATE`、`DROP` 或 `TRUNCATE`。

## 表关系

```text
merchants
  |- buyers
  |- suppliers
  |- transactions
  |    |- payment_records
  |    `- transaction_purchase_allocations -- purchase_records
  |- purchase_records
  |    `- supplier_payment_records
  `- other_costs
```

除 `merchants` 外，所有业务数据都通过 `merchant_id` 隔离到对应商户。

## 业务表

### `merchants`

商户账号与店铺资料。

| 关键字段 | 说明 |
| --- | --- |
| `id` | 商户主键 |
| `openid` | 微信用户标识，唯一 |
| `shop_name` | 店铺名称 |
| `phone` | 联系电话 |

### `buyers`

买家资料。

| 关键字段 | 说明 |
| --- | --- |
| `merchant_id` | 所属商户，关联 `merchants.id` |
| `name` / `phone` | 买家姓名与电话 |
| `share_token` | 买家账单分享令牌，唯一 |

### `transactions`

销售单主记录。

| 关键字段 | 说明 |
| --- | --- |
| `merchant_id` / `buyer_id` | 所属商户与买家 |
| `lobster_size` | 龙虾规格 |
| `weight` / `unit_price` / `total_amount` | 销售重量、单价、总金额 |
| `paid_amount` / `payment_status` | 已收款与收款状态 |
| `delivery_address` / `delivery_status` / `delivery_time` | 配送信息 |
| `transaction_time` | 销售时间 |
| `order_status` / `cancelled_at` | 订单状态与取消时间 |
| `remark` | 备注 |

### `payment_records`

销售补录收款记录。

| 关键字段 | 说明 |
| --- | --- |
| `transaction_id` | 关联销售单 |
| `amount` / `payment_method` | 收款金额与方式 |
| `paid_at` / `note` | 收款时间与说明 |

### `suppliers`

供应商资料。

| 关键字段 | 说明 |
| --- | --- |
| `merchant_id` | 所属商户 |
| `name` / `phone` / `remark` | 供应商资料 |
| `share_token` | 供应商采购账单分享令牌 |

### `purchase_records`

采购单与库存来源。

| 关键字段 | 说明 |
| --- | --- |
| `merchant_id` / `supplier_id` | 所属商户与供应商 |
| `lobster_size` | 龙虾规格 |
| `gross_weight` / `tare_weight` / `deduct_weight` | 毛重、皮重、扣减重量 |
| `net_weight` / `remaining_weight` | 净重与尚可分摊库存 |
| `unit_cost` / `total_cost` | 单价与采购总成本 |
| `paid_amount` / `settlement_status` | 已付款与结算状态 |
| `received_at` | 收货时间 |
| `order_status` / `cancelled_at` | 采购单状态与取消时间 |
| `share_token` | 单笔采购分享令牌 |

### `supplier_payment_records`

采购补录付款记录。

| 关键字段 | 说明 |
| --- | --- |
| `purchase_record_id` | 关联采购单 |
| `amount` / `payment_method` | 付款金额与方式 |
| `paid_at` / `note` | 付款时间与说明 |

### `transaction_purchase_allocations`

销售单与采购库存之间的成本分摊明细。

| 关键字段 | 说明 |
| --- | --- |
| `transaction_id` | 关联销售单 |
| `purchase_record_id` | 关联采购库存 |
| `weight` / `unit_cost` / `total_cost` | 分摊重量、单位成本与总成本 |

### `other_costs`

人工、包装等其他成本。

| 关键字段 | 说明 |
| --- | --- |
| `merchant_id` | 所属商户 |
| `cost_type` / `amount` | 成本类型与金额 |
| `cost_date` / `remark` | 成本日期与备注 |

## 公共字段

Sequelize 创建的模型表还包含：

| 字段 | 说明 |
| --- | --- |
| `id` | 自增主键 |
| `created_at` | 创建时间 |
| `updated_at` | 最后更新时间 |

## 常用只读查询

```sql
-- 最近创建的商户
SELECT id, shop_name, phone, created_at
FROM merchants
ORDER BY id DESC
LIMIT 20;

-- 最近销售单及买家
SELECT t.id, b.name AS buyer_name, t.lobster_size, t.weight,
       t.total_amount, t.paid_amount, t.transaction_time
FROM transactions t
LEFT JOIN buyers b ON b.id = t.buyer_id
ORDER BY t.transaction_time DESC
LIMIT 20;

-- 最近采购单及供应商、剩余库存
SELECT p.id, s.name AS supplier_name, p.lobster_size, p.net_weight,
       p.remaining_weight, p.total_cost, p.paid_amount, p.received_at
FROM purchase_records p
LEFT JOIN suppliers s ON s.id = p.supplier_id
ORDER BY p.received_at DESC
LIMIT 20;

-- 当前库存汇总
SELECT lobster_size, SUM(remaining_weight) AS remaining_weight
FROM purchase_records
WHERE order_status <> 1 AND remaining_weight > 0
GROUP BY lobster_size;
```
