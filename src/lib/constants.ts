// Global constants for the school feeding system
export const REQUIRED_AMOUNT_PER_SEMESTER = 24000; // RWF
export const CURRENCY = 'RWF';

export const formatCurrency = (amount: number) =>
  `${CURRENCY} ${Number(amount).toLocaleString()}`;

export const getPaymentStatus = (totalPaid: number, required = REQUIRED_AMOUNT_PER_SEMESTER) => {
  const pct = required === 0 ? 100 : (totalPaid / required) * 100;
  if (totalPaid >= required) return 'PAID';
  if (totalPaid >= required / 2) return 'PARTIAL';
  return 'BELOW HALF';
};

export const getPercentage = (totalPaid: number, required = REQUIRED_AMOUNT_PER_SEMESTER) =>
  required === 0 ? 100 : (totalPaid / required) * 100;
