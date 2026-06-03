/**
 * 결제수단 API (등록된 신용카드 마스킹 정보).
 * 백엔드: PaymentMethodController (/api/payment-methods/**)
 */
import api from './axios';

export const paymentMethodsApi = {
  list: () => api.get('/payment-methods').then((r) => r.data),
  create: (payload) => api.post('/payment-methods', payload).then((r) => r.data),
  setDefault: (id) => api.patch(`/payment-methods/${id}/default`).then((r) => r.data),
  remove: (id) => api.delete(`/payment-methods/${id}`).then((r) => r.data),
};
