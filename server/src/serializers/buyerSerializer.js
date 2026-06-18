const serializeBuyer = (buyer, options = {}) => {
  if (!buyer) return null;

  const { stats, includeTransactionCount = false } = options;
  const result = {
    id: buyer.id,
    name: buyer.name,
    phone: buyer.phone,
    share_token: buyer.share_token,
    created_at: buyer.created_at,
    updated_at: buyer.updated_at
  };

  if (stats) {
    result.total_spent = stats.total_spent;
    result.total_debt = stats.total_debt;

    if (includeTransactionCount) {
      result.transaction_count = stats.transaction_count;
    }
  }

  return result;
};

const serializePublicBuyer = (buyer) => {
  if (!buyer) return null;

  return {
    name: buyer.name,
    phone: buyer.phone
  };
};

module.exports = {
  serializeBuyer,
  serializePublicBuyer
};
