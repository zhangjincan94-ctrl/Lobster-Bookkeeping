const success = (data, message = '操作成功') => {
  return {
    code: 0,
    message,
    data
  };
};

const error = (message = '操作失败', code = -1) => {
  return {
    code,
    message,
    data: null
  };
};

const paginate = (list, total, page, pageSize) => {
  return {
    code: 0,
    message: '操作成功',
    data: {
      list,
      total,
      page: Number(page),
      pageSize: Number(pageSize),
      totalPages: Math.ceil(total / pageSize)
    }
  };
};

module.exports = { success, error, paginate };
