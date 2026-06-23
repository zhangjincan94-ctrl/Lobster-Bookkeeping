const serializeSupplier = (supplier, stats = {}) => {
  if (!supplier) return null;

  return {
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone,
    remark: supplier.remark,
    share_token: supplier.share_token,
    total_weight: stats.total_weight || 0,
    total_cost: stats.total_cost || 0,
    total_debt: stats.total_debt || 0,
    purchase_count: stats.purchase_count || 0,
    created_at: supplier.created_at,
    updated_at: supplier.updated_at
  };
};

module.exports = {
  serializeSupplier
};
