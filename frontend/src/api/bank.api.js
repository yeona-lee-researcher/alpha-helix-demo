import api from './axios';

export const bankApi = {
  sendCode: () =>
    api.post('/bank/send-code').then(r => r.data),

  verifyCode: (code, bankName, accountNumber, accountHolder) =>
    api.post('/bank/verify-code', { code, bankName, accountNumber, accountHolder }).then(r => r.data),

  getAccount: () =>
    api.get('/bank/account').then(r => r.data),
};
