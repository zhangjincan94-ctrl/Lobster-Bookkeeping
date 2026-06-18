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
    created_at: record.created_at,
    updated_at: record.updated_at
  };
};

const serializePurchaseListItem = (record, supplier) => {
  const result = serializePurchaseCore(record);
  const relationSupplier = supplier || record.Supplier;

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

const serializePurchaseDetail = (record) => {
  const result = serializePurchaseCore(record);

  return {
    ...result,
    supplier: serializeSupplierBrief(record.Supplier),
    payment_records: (record.SupplierPaymentRecords || []).map(serializeSupplierPaymentRecord)
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
