const serializeBuyerBrief = (buyer) => {
  if (!buyer) return null;

  return {
    id: buyer.id,
    name: buyer.name,
    phone: buyer.phone,
    share_token: buyer.share_token
  };
};

const serializeTransactionCore = (transaction) => {
  return {
    id: transaction.id,
    buyer_id: transaction.buyer_id,
    lobster_size: transaction.lobster_size,
    weight: transaction.weight,
    unit_price: transaction.unit_price,
    total_amount: transaction.total_amount,
    payment_status: transaction.payment_status,
    paid_amount: transaction.paid_amount,
    delivery_address: transaction.delivery_address,
    delivery_status: transaction.delivery_status,
    delivery_time: transaction.delivery_time,
    order_status: transaction.order_status,
    cancelled_at: transaction.cancelled_at,
    remark: transaction.remark,
    transaction_time: transaction.transaction_time,
    created_at: transaction.created_at,
    updated_at: transaction.updated_at
  };
};

const serializeTransactionListItem = (transaction, buyer) => {
  const result = serializeTransactionCore(transaction);
  const relationBuyer = buyer || transaction.Buyer;

  return {
    id: result.id,
    buyer_id: result.buyer_id,
    buyer_name: relationBuyer ? relationBuyer.name : null,
    lobster_size: result.lobster_size,
    weight: result.weight,
    unit_price: result.unit_price,
    total_amount: result.total_amount,
    payment_status: result.payment_status,
    paid_amount: result.paid_amount,
    delivery_address: result.delivery_address,
    delivery_status: result.delivery_status,
    delivery_time: result.delivery_time,
    order_status: result.order_status,
    cancelled_at: result.cancelled_at,
    remark: result.remark,
    transaction_time: result.transaction_time,
    created_at: result.created_at,
    updated_at: result.updated_at
  };
};

const serializePaymentRecord = (record) => {
  return {
    id: record.id,
    transaction_id: record.transaction_id,
    amount: record.amount,
    payment_method: record.payment_method,
    paid_at: record.paid_at,
    note: record.note,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
};

const serializePaymentRecordResult = (record) => {
  return {
    id: record.id,
    transaction_id: record.transaction_id,
    amount: record.amount,
    payment_method: record.payment_method,
    paid_at: record.paid_at,
    note: record.note,
    created_at: record.created_at
  };
};

const serializePurchaseAllocation = (allocation) => {
  const purchase = allocation.PurchaseRecord;
  const supplier = purchase && purchase.Supplier;

  return {
    id: allocation.id,
    transaction_id: allocation.transaction_id,
    purchase_record_id: allocation.purchase_record_id,
    weight: allocation.weight,
    unit_cost: allocation.unit_cost,
    total_cost: allocation.total_cost,
    purchase_record: purchase ? {
      id: purchase.id,
      supplier_id: purchase.supplier_id,
      supplier_name: supplier ? supplier.name : null,
      lobster_size: purchase.lobster_size,
      received_at: purchase.received_at,
      remaining_weight: purchase.remaining_weight
    } : null
  };
};

const serializeTransactionDetail = (transaction) => {
  const result = serializeTransactionCore(transaction);

  return {
    id: result.id,
    buyer_id: result.buyer_id,
    buyer: serializeBuyerBrief(transaction.Buyer),
    lobster_size: result.lobster_size,
    weight: result.weight,
    unit_price: result.unit_price,
    total_amount: result.total_amount,
    payment_status: result.payment_status,
    paid_amount: result.paid_amount,
    delivery_address: result.delivery_address,
    delivery_status: result.delivery_status,
    delivery_time: result.delivery_time,
    order_status: result.order_status,
    cancelled_at: result.cancelled_at,
    remark: result.remark,
    transaction_time: result.transaction_time,
    payment_records: (transaction.PaymentRecords || []).map(serializePaymentRecord),
    source_allocations: (transaction.PurchaseAllocations || []).map(serializePurchaseAllocation),
    created_at: result.created_at,
    updated_at: result.updated_at
  };
};

const serializePaymentResult = (paymentRecord, transaction, paidAmount, paymentStatus) => {
  return {
    payment_record: serializePaymentRecordResult(paymentRecord),
    transaction: {
      id: transaction.id,
      paid_amount: paidAmount,
      payment_status: paymentStatus
    }
  };
};

module.exports = {
  serializeTransactionListItem,
  serializeTransactionDetail,
  serializePaymentResult
};
