// frontend/src/lib/brokerApi.js
// 한국투자증권(KIS) 자격증명 등록/조회/삭제. 모든 호출은 쿠키 기반 인증.
import api from "../api/axios";

export async function fetchMyBroker() {
  try {
    const { data, status } = await api.get("/broker/account");
    if (status === 204) return null; // 미등록
    return data;
  } catch (e) {
    if (e?.response?.status === 401) throw new Error("로그인이 필요합니다.");
    throw e;
  }
}

export async function upsertBroker(payload) {
  const { data } = await api.post("/broker/account", payload);
  return data;
}

export async function testBroker() {
  // 다음 배포에서 KisApiClient 연결 후 200 응답
  const { data } = await api.post("/broker/account/test");
  return data;
}

export async function setTradingEnabled(enabled) {
  const { data } = await api.patch("/broker/account/trading-enabled", { enabled });
  return data;
}

export async function deleteBroker() {
  await api.delete("/broker/account");
}
