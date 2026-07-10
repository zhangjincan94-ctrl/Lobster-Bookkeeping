const toPositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizePagination = (query, defaultPageSize = 10) => {
  return {
    page: toPositiveInt(query.page, 1),
    pageSize: Math.min(toPositiveInt(query.pageSize || query.page_size, defaultPageSize), 100)
  };
};

module.exports = { normalizePagination };
