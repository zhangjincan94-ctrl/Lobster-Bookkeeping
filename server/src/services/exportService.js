// 账本导出：按时间范围取出账单与商品明细，生成 xlsx 并以 base64 返回。
// 使用 xlsx 的 mini 构建：云函数部署包体积更小，且只用到 xlsx 读写能力。
const XLSX = require('xlsx/dist/xlsx.mini.min.js');
const { sequelize, Sequelize, LedgerBill, LedgerBillItem, Customer } = require('../models');
const { isValidDate } = require('../utils/validate');

const { Op } = Sequelize;

const MAX_BILLS = 5000;
const HARD_MAX_BASE64 = 4 * 1024 * 1024;
const DEFAULT_MAX_BASE64 = 900 * 1000;
const MIN_MAX_BASE64 = 200 * 1000;

const DIRECTION_LABEL = {
  sale: '出货',
  purchase: '进货'
};

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundMoney = (value) => Math.round(value * 100) / 100;

const exportError = (message, status = 400) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const pad = (value) => (value < 10 ? '0' + value : String(value));

const formatDate = (date) => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());

const formatNow = () => {
  const now = new Date();
  return formatDate(now) + ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
};

// 按月平移并收敛到目标月份的最后一天，避免 31 号跨月溢出。
const shiftMonths = (date, months) => {
  const year = date.getFullYear();
  const month = date.getMonth() + months;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(date.getDate(), lastDay));
};

const defaultRange = () => {
  const now = new Date();
  return {
    start: formatDate(shiftMonths(now, -3)),
    end: formatDate(now)
  };
};

const normalizeRange = (startDate, endDate) => {
  const start = startDate ? String(startDate).trim() : '';
  const end = endDate ? String(endDate).trim() : '';
  if (!start && !end) return defaultRange();
  if (!start || !end) throw exportError('请同时提供开始日期和结束日期');
  if (!isValidDate(start)) throw exportError('开始日期格式无效，请使用 YYYY-MM-DD');
  if (!isValidDate(end)) throw exportError('结束日期格式无效，请使用 YYYY-MM-DD');
  if (start > end) throw exportError('开始日期不能晚于结束日期');
  return { start, end };
};

const normalizeMaxBytes = (value) => {
  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return HARD_MAX_BASE64;
  return Math.min(Math.max(parsed, MIN_MAX_BASE64), HARD_MAX_BASE64);
};

const billCode = (id) => 'B' + String(id).padStart(6, '0');

const applyMoneyFormat = (sheet, columns, fromRow) => {
  const range = XLSX.utils.decode_range(sheet['!ref']);
  columns.forEach((column) => {
    for (let row = fromRow; row <= range.e.r; row += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      const cell = sheet[address];
      if (cell && cell.t === 'n') cell.z = '0.00';
    }
  });
};

const buildWorkbook = ({ bills, itemMap, itemCount, start, end, includeItems }) => {
  const saleAmount = roundMoney(bills.reduce((sum, bill) => (
    bill.direction === 'sale' ? sum + toNumber(bill.total_amount) : sum
  ), 0));
  const purchaseAmount = roundMoney(bills.reduce((sum, bill) => (
    bill.direction === 'purchase' ? sum + toNumber(bill.total_amount) : sum
  ), 0));
  const netAmount = roundMoney(saleAmount - purchaseAmount);

  const overview = [
    ['龙虾记账 · 账本导出'],
    [],
    ['统计区间', start + ' 至 ' + end],
    ['导出时间', formatNow()],
    ['账单笔数', bills.length],
    ['出货合计', saleAmount],
    ['进货合计', -purchaseAmount],
    ['净额（出货 - 进货）', netAmount],
    ['商品明细行数', itemCount]
  ];

  const summary = [['账单编号', '日期', '往来对象', '方向', '商品数', '金额', '备注']];
  bills.forEach((bill) => {
    const items = itemMap[String(bill.id)] || [];
    const amount = roundMoney(toNumber(bill.total_amount));
    summary.push([
      billCode(bill.id),
      bill.bill_date,
      bill.customer ? bill.customer.name : '',
      DIRECTION_LABEL[bill.direction] || bill.direction,
      items.length,
      bill.direction === 'purchase' ? -amount : amount,
      bill.remark || ''
    ]);
  });
  summary.push(['合计', '', '', '', itemCount, netAmount, '']);

  const sheets = [];
  const overviewSheet = XLSX.utils.aoa_to_sheet(overview);
  overviewSheet['!cols'] = [{ wch: 22 }, { wch: 26 }];
  applyMoneyFormat(overviewSheet, [1], 5);
  sheets.push({ name: '概览', sheet: overviewSheet });

  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  summarySheet['!cols'] = [
    { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 30 }
  ];
  applyMoneyFormat(summarySheet, [5], 1);
  sheets.push({ name: '账单汇总', sheet: summarySheet });

  if (includeItems) {
    const detail = [['账单编号', '日期', '往来对象', '方向', '商品名称', '单位', '数量', '单价', '小计']];
    bills.forEach((bill) => {
      const items = itemMap[String(bill.id)] || [];
      const amount = roundMoney(toNumber(bill.total_amount));
      const sign = bill.direction === 'purchase' ? -1 : 1;
      if (!items.length) {
        detail.push([
          billCode(bill.id),
          bill.bill_date,
          bill.customer ? bill.customer.name : '',
          DIRECTION_LABEL[bill.direction] || bill.direction,
          '（无商品明细）', '', '', '', roundMoney(amount * sign)
        ]);
        return;
      }
      items.forEach((item) => {
        detail.push([
          billCode(bill.id),
          bill.bill_date,
          bill.customer ? bill.customer.name : '',
          DIRECTION_LABEL[bill.direction] || bill.direction,
          item.product_name,
          item.unit,
          toNumber(item.quantity),
          toNumber(item.unit_price),
          roundMoney(toNumber(item.subtotal) * sign)
        ]);
      });
    });
    const detailSheet = XLSX.utils.aoa_to_sheet(detail);
    detailSheet['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 8 }, { wch: 20 },
      { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 12 }
    ];
    applyMoneyFormat(detailSheet, [7, 8], 1);
    sheets.push({ name: '商品明细', sheet: detailSheet });
  }

  const workbook = XLSX.utils.book_new();
  sheets.forEach((item) => XLSX.utils.book_append_sheet(workbook, item.sheet, item.name));

  return { workbook, saleAmount, purchaseAmount, netAmount };
};

const exportBills = async (merchantId, options = {}) => {
  const includeItems = !(
    options.include_items === '0' ||
    options.include_items === 'false' ||
    options.include_items === false
  );
  // 失败日志上下文：日期范围、导出模式、数据量，随异常交给 errorHandler 输出。
  const context = {
    feature: '账单导出',
    merchantId,
    startDate: options.start_date || '',
    endDate: options.end_date || '',
    direction: options.direction || '',
    mode: includeItems ? '汇总+明细' : '仅汇总',
    billCount: 0,
    itemCount: 0,
    base64Length: 0
  };

  try {
    const { start, end } = normalizeRange(options.start_date, options.end_date);
    context.startDate = start;
    context.endDate = end;
    const maxBytes = normalizeMaxBytes(options.max_bytes);
    const direction = options.direction ? String(options.direction).trim() : '';

    const where = {
      merchant_id: merchantId,
      deleted_at: null,
      bill_date: { [Op.gte]: start, [Op.lte]: end }
    };
    if (direction) {
      if (direction !== 'sale' && direction !== 'purchase') throw exportError('账单方向参数无效');
      where.direction = direction;
    }
    const customerId = parseInt(options.customer_id, 10);
    if (Number.isFinite(customerId) && customerId > 0) where.customer_id = customerId;

    // 账单与明细必须在同一事务快照内读取，避免两次查询之间账单被改导致金额对不上。
    // MySQL / TiDB 默认隔离级别是 REPEATABLE READ，同一事务内多次查询共享同一快照。
    const snapshot = await sequelize.transaction(async (transaction) => {
      const bills = await LedgerBill.findAll({
        where,
        include: [{ model: Customer, as: 'customer', attributes: ['id', 'name'] }],
        order: [['bill_date', 'DESC'], ['id', 'DESC']],
        limit: MAX_BILLS + 1,
        transaction
      });
      if (bills.length > MAX_BILLS) {
        throw exportError('一次最多导出 ' + MAX_BILLS + ' 笔账单，请缩短时间范围', 413);
      }
      if (!bills.length) {
        throw exportError('所选时间范围内没有账单', 404);
      }
      context.billCount = bills.length;

      const billIds = bills.map((bill) => bill.id);
      const itemMap = {};
      let itemCount = 0;
      if (includeItems) {
        const rows = await LedgerBillItem.findAll({
          where: { ledger_bill_id: { [Op.in]: billIds } },
          attributes: ['ledger_bill_id', 'product_name', 'unit', 'quantity', 'unit_price', 'subtotal'],
          order: [['id', 'ASC']],
          raw: true,
          transaction
        });
        rows.forEach((row) => {
          const key = String(row.ledger_bill_id);
          if (!itemMap[key]) itemMap[key] = [];
          itemMap[key].push(row);
        });
        itemCount = rows.length;
      } else {
        const countRows = await LedgerBillItem.findAll({
          where: { ledger_bill_id: { [Op.in]: billIds } },
          attributes: ['ledger_bill_id', [sequelize.fn('COUNT', sequelize.col('id')), 'item_count']],
          group: ['ledger_bill_id'],
          raw: true,
          transaction
        });
        countRows.forEach((row) => {
          const count = parseInt(row.item_count, 10) || 0;
          itemMap[String(row.ledger_bill_id)] = new Array(count).fill(null);
          itemCount += count;
        });
      }
      context.itemCount = itemCount;
      return { bills, itemMap, itemCount };
    });

    const { workbook, saleAmount, purchaseAmount, netAmount } = buildWorkbook({
      bills: snapshot.bills,
      itemMap: snapshot.itemMap,
      itemCount: snapshot.itemCount,
      start,
      end,
      includeItems
    });

    const content = Buffer.from(XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'buffer',
      compression: true
    })).toString('base64');
    context.base64Length = content.length;

    if (content.length > maxBytes) {
      throw exportError('导出数据较大，请缩短时间范围或仅导出账单汇总', 413);
    }

    return {
      file_name: 'bills_' + start + '_' + end + '.xlsx',
      display_name: '龙虾记账账单_' + start + '_' + end + '.xlsx',
      content,
      start_date: start,
      end_date: end,
      include_items: includeItems,
      bill_count: snapshot.bills.length,
      item_count: snapshot.itemCount,
      sale_amount: saleAmount,
      purchase_amount: purchaseAmount,
      net_amount: netAmount
    };
  } catch (err) {
    if (err && typeof err === 'object') {
      err.context = Object.assign({}, context, err.context || {});
    }
    throw err;
  }
};

module.exports = {
  exportBills
};
