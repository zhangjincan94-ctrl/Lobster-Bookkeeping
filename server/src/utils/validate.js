const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/;
const MAX_AMOUNT = 1e9;

const invalid = (message) => {
  const err = new Error(message);
  err.status = 400;
  return err;
};

// YYYY-MM-DD 且日期真实存在，例如 2026-02-30 判为非法。
const isValidDate = (value) => {
  const str = String(value || '').trim();
  if (!DATE_PATTERN.test(str)) return false;
  const year = Number(str.slice(0, 4));
  const month = Number(str.slice(5, 7));
  const day = Number(str.slice(8, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
};

// 支持 YYYY-MM-DD 与 YYYY-MM-DD HH:mm(:ss)。
const isValidDateTime = (value) => {
  const str = String(value || '').trim();
  if (DATE_PATTERN.test(str)) return isValidDate(str);
  if (!DATE_TIME_PATTERN.test(str)) return false;
  if (!isValidDate(str.slice(0, 10))) return false;
  const parsed = new Date(str.replace('T', ' '));
  return !Number.isNaN(parsed.getTime());
};

const assertDate = (value, label = '日期') => {
  if (!isValidDate(value)) throw invalid(`${label}格式无效，请使用 YYYY-MM-DD`);
  return String(value).trim();
};

const assertDateTime = (value, label = '时间') => {
  if (!isValidDateTime(value)) throw invalid(`${label}格式无效，请使用 YYYY-MM-DD HH:mm:ss`);
  return String(value).trim();
};

const assertAmount = (value, label = '金额', { allowZero = true } = {}) => {
  if (value === null || value === undefined || value === '') {
    throw invalid(`${label}不能为空`);
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw invalid(`${label}必须是数字`);
  if (amount < 0) throw invalid(`${label}不能小于 0`);
  if (!allowZero && amount === 0) throw invalid(`${label}必须大于 0`);
  if (amount > MAX_AMOUNT) throw invalid(`${label}超出允许范围`);
  return amount;
};

const assertStringLength = (value, max, label = '内容', { required = false } = {}) => {
  const str = value === null || value === undefined ? '' : String(value).trim();
  if (!str) {
    if (required) throw invalid(`${label}不能为空`);
    return str;
  }
  if (str.length > max) throw invalid(`${label}长度不能超过 ${max} 个字符`);
  return str;
};

const assertArrayLength = (value, max, label = '列表') => {
  if (!Array.isArray(value)) throw invalid(`${label}格式无效`);
  if (value.length > max) throw invalid(`${label}最多 ${max} 条`);
  return value;
};

module.exports = {
  MAX_AMOUNT,
  isValidDate,
  isValidDateTime,
  assertDate,
  assertDateTime,
  assertAmount,
  assertStringLength,
  assertArrayLength
};
