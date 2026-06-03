/**
 * 토스페이먼츠 v2 결제위젯 SDK 로더.
 *
 * v1 (https://js.tosspayments.com/v1/payment) 의 requestPayment(method, options) 와 달리,
 * v2 위젯은 토스가 결제수단 UI(카드/토스페이/삼성페이/계좌이체/PayPal/가상계좌 등) 를 직접 그려준다.
 * 가맹점에서 활성화된 결제수단만 자동 노출되므로 우리 코드에서 수단별 분기 불필요.
 *
 * 사용:
 *   const tp = await loadTossPayments();
 *   const widgets = tp.widgets({ customerKey });   // customerKey: 우리 user.id
 *   await widgets.setAmount({ currency: "KRW", value: 50000 });
 *   await widgets.renderPaymentMethods({ selector: "#payment-method", variantKey: "DEFAULT" });
 *   await widgets.renderAgreement({ selector: "#agreement", variantKey: "AGREEMENT" });
 *   await widgets.requestPayment({ orderId, orderName, successUrl, failUrl, customerEmail, customerName });
 *
 * 환경변수:
 *   VITE_TOSS_CLIENT_KEY — 본인 가맹 클라이언트 키 (없으면 PayPal 활성화된 docs 키 사용)
 */

const TOSS_SDK_URL = "https://js.tosspayments.com/v2/standard";
// PayPal 활성화 docs 키 (https://docs.tosspayments.com/guides/v2/payment-window/integration-paypal).
// 본인 가맹 키는 PayPal 미신청 상태일 수 있어 fallback 으로 docs 키 사용.
const DEFAULT_CLIENT_KEY = "test_gck_docs_Ovk5rk1EwkEbP0W43n07xlzm";

let sdkPromise = null;

function loadSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.TossPayments) {
      resolve(window.TossPayments);
      return;
    }
    const script = document.createElement("script");
    script.src = TOSS_SDK_URL;
    script.async = true;
    script.onload = () => {
      if (window.TossPayments) resolve(window.TossPayments);
      else reject(new Error("TossPayments v2 SDK 로드 실패"));
    };
    script.onerror = () => reject(new Error("TossPayments v2 SDK 스크립트 로드 실패"));
    document.head.appendChild(script);
  });
  return sdkPromise;
}

export async function loadTossPayments() {
  const TossPayments = await loadSdk();
  const clientKey = import.meta.env?.VITE_TOSS_CLIENT_KEY || DEFAULT_CLIENT_KEY;
  return TossPayments(clientKey);
}

/**
 * 짧은 orderId 생성 (영숫자, 6~64자 토스 요구사항 충족).
 * 에스크로 1건당 고유. 재결제 시 새 orderId 생성.
 */
export function makeOrderId(escrowId) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `ESCROW-${escrowId}-${ts}-${rand}`.toUpperCase();
}

/**
 * customerKey 생성. 우리 user.id 를 기반으로 한 고유 문자열 (이메일/전화는 비권장).
 * 비회원은 TossPayments.ANONYMOUS 상수를 직접 전달.
 */
export function makeCustomerKey(userId) {
  if (!userId) return null;
  // 토스 customerKey 는 영숫자/특수기호 가능, 50자 이내. 우리 user id 그대로 prefix 붙여 사용.
  return `USER-${userId}`;
}
