const serializeSupplierBrief = (supplier) => {
  if (!supplier) return null;

  return {
    id: supplier.id,
    name: supplier.name,
    phone: supplier.phone
  };
};

const serializePurchaseCore = (record) => {
  return {
    id: record.id,
    supplier_id: record.supplier_id,
    lobster_size: record.lobster_size,
    gross_weight: record.gross_weight,
    tare_weight: record.tare_weight,
    deduct_weight: record.deduct_weight,
    net_weight: record.net_weight,
    remaining_weight: record.remaining_weight,
    unit_cost: record.unit_cost,
    total_cost: record.total_cost,
    settlement_status: record.settlement_status,
    paid_amount: record.paid_amount,
    received_at: record.received_at,
    order_status: record.order_status,
    cancelled_at: record.cancelled_at,
    remark: record.remark,
    share_token: record.share_token,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
};

const serializePurchaseListItem = (record, supplier) => {
  const result = serializePurchaseCore(record);
  const relationSupplier = supplier || record.supplier || record.Supplier;

  return {
    ...result,
    supplier_name: relationSupplier ? relationSupplier.name : null
  };
};

const serializeSupplierPaymentRecord = (record) => {
  return {
    id: record.id,
    purchase_record_id: record.purchase_record_id,
    amount: record.amount,
    payment_method: record.payment_method,
    paid_at: record.paid_at,
    note: record.note,
    created_at: record.created_at,
    updated_at: record.updated_at
  };
};

const serializeTransactionAllocation = (allocation) => {
  const transaction = allocation.transaction || allocation.Transaction;
  const buyer = transaction && (transaction.buyer || transaction.Buyer);

  return {
    id: allocation.id,
    transaction_id: allocation.transaction_id,
    weight: allocation.weight,
    unit_cost: allocation.unit_cost,
    total_cost: allocation.total_cost,
    buyer_name: buyer ? buyer.name : null,
    transaction_time: transaction ? transaction.transaction_time : null
  };
};

const serializePurchaseDetail = (record) => {
  const result = serializePurchaseCore(record);

  return {
    ...result,
    supplier: serializeSupplierBrief(record.supplier || record.Supplier),
    payment_records: (record.SupplierPaymentRecords || []).map(serializeSupplierPaymentRecord),
    transaction_allocations: (record.TransactionAllocations || []).map(serializeTransactionAllocation)
  };
};

const serializeSupplierPaymentResult = (paymentRecord, purchaseRecord, paidAmount, settlementStatus) => {
  return {
    payment_record: serializeSupplierPaymentRecord(paymentRecord),
    purchase_record: {
      id: purchaseRecord.id,
      paid_amount: paidAmount,
      settlement_status: settlementStatus
    }
  };
};

module.exports = {
  serializePurchaseListItem,
  serializePurchaseDetail,
  serializeSupplierPaymentResult
};
