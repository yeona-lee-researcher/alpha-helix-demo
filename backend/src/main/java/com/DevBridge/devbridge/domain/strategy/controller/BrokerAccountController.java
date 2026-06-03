package com.DevBridge.devbridge.domain.strategy.controller;

import com.DevBridge.devbridge.domain.strategy.dto.BrokerAccountDto;
import com.DevBridge.devbridge.domain.strategy.dto.BrokerAccountUpsertReq;
import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.strategy.repository.BrokerAccountRepository;
import com.DevBridge.devbridge.domain.strategy.repository.OrderProposalRepository;
import com.DevBridge.devbridge.domain.user.repository.UserRepository;
import com.DevBridge.devbridge.global.security.AuthContext;
import com.DevBridge.devbridge.domain.payment.service.CryptoService;
import com.DevBridge.devbridge.domain.strategy.service.broker.BinanceApiClient;
import com.DevBridge.devbridge.domain.strategy.service.broker.KisApiClient;
import com.DevBridge.devbridge.domain.strategy.service.broker.PromotionGateService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 사용자별 KIS API 자격증명 관리.
 * - POST/PUT: 키 등록/갱신 (appsecret은 즉시 암호화)
 * - GET: 마스킹된 정보 + 한도/스위치 상태
 * - DELETE: 등록 해제
 * - POST /test: KIS 토큰 발급으로 키 유효성 검증 (KisApiClient 구현 후 활성화)
 * - PATCH /trading-enabled: 매매 ON/OFF 토글
 */
@RestController
@RequestMapping("/api/broker/account")
@RequiredArgsConstructor
@Slf4j
public class BrokerAccountController {

    private final BrokerAccountRepository brokerRepo;
    private final OrderProposalRepository proposalRepo;
    private final PromotionGateService promotionGate;
    private final UserRepository userRepo;
    private final CryptoService crypto;
    private final KisApiClient kis;
    private final BinanceApiClient binance;

    /** REAL 자동체결 졸업 게이트 기준: MOCK 자동매매 최소 일수 / 최소 횟수. */
    private static final int AUTO_REAL_MIN_DAYS = 14;
    private static final int AUTO_REAL_MIN_TRADES = 20;

    /**
     * 실전(REAL) 계좌 한도 안전 상한. 등록(upsert)·수정(patchLimits) <b>양 경로에서 동일하게</b> 강제한다.
     * (이전엔 patchLimits 에만 캡이 있어 upsert 로는 무제한 큰 한도 등록이 가능한 비대칭이 있었다.)
     * KIS/Binance 모두 REAL 이면 적용 — 실수/버그로 실계좌 잔고가 한 번에 소진되는 것을 막는 마지막 방어선.
     */
    private static final long REAL_MAX_ORDER_USD_CAP   = 50_000L;
    private static final long REAL_DAILY_ORDER_USD_CAP = 200_000L;
    private static final long REAL_DAILY_BUY_KRW_CAP   = 100_000_000L;   // 약 USD 77k
    private static final long REAL_DAILY_SELL_KRW_CAP  = 500_000_000L;   // 약 USD 385k

    /** REAL 계좌 한도 상한 위반 검사. 위반 시 사용자 메시지, 통과 시 null. MOCK 은 항상 통과(상한 없음). */
    private static String realCapViolation(BrokerAccount.Env env, Long maxOrderUsd, Long dailyOrderUsd,
                                           Long dailyBuyKrw, Long dailySellKrw) {
        if (env != BrokerAccount.Env.REAL) return null;
        if (maxOrderUsd != null && maxOrderUsd > REAL_MAX_ORDER_USD_CAP)
            return "실전계좌 1건당 한도는 최대 USD " + REAL_MAX_ORDER_USD_CAP + " 까지 가능합니다";
        if (dailyOrderUsd != null && dailyOrderUsd > REAL_DAILY_ORDER_USD_CAP)
            return "실전계좌 일일 누적 한도는 최대 USD " + REAL_DAILY_ORDER_USD_CAP + " 까지 가능합니다";
        if (dailyBuyKrw != null && dailyBuyKrw > REAL_DAILY_BUY_KRW_CAP)
            return "실전계좌 매수 1일 한도는 최대 1억원 까지 가능합니다";
        if (dailySellKrw != null && dailySellKrw > REAL_DAILY_SELL_KRW_CAP)
            return "실전계좌 매도 1일 한도는 최대 5억원 까지 가능합니다";
        return null;
    }

    private static ResponseEntity<?> badReq(String msg) {
        return ResponseEntity.badRequest().body(Map.of("error", msg));
    }

    @GetMapping
    public ResponseEntity<?> getMine() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        var list = brokerRepo.findAllByUserIdOrderByEnvAsc(uid)
                .stream().map(BrokerAccountDto::from).toList();
        return ResponseEntity.ok(list);
    }

    @PostMapping
    @Transactional
    public ResponseEntity<?> upsert(@RequestBody BrokerAccountUpsertReq req) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();

        BrokerAccount.BrokerType brokerType = req.brokerType() != null ? req.brokerType() : BrokerAccount.BrokerType.KIS;
        BrokerAccount.Env env = req.env() != null ? req.env() : BrokerAccount.Env.MOCK;

        // 브로커 타입별 유효성 검증
        if (brokerType == BrokerAccount.BrokerType.KIS) {
            var bad = validateKis(req);
            if (bad != null) return bad;
        } else if (brokerType == BrokerAccount.BrokerType.BINANCE) {
            var bad = validateBinance(req);
            if (bad != null) return bad;
        }

        // 실전(REAL) 계좌 한도 안전 상한 — 등록 시점에도 강제(patchLimits 와 동일 정책). 실수로 무제한 큰 한도 등록 방지.
        String capViol = realCapViolation(env, req.maxOrderUsd(), req.dailyOrderUsd(), req.dailyBuyKrw(), req.dailySellKrw());
        if (capViol != null) return badReq(capViol);

        BrokerAccount b = brokerRepo.findByUserIdAndBrokerTypeAndEnv(uid, brokerType, env).orElseGet(() -> {
            User u = userRepo.findById(uid).orElseThrow();
            return BrokerAccount.builder().user(u).brokerType(brokerType).env(env).build();
        });
        b.setEnv(env);
        b.setBrokerType(brokerType);

        if (brokerType == BrokerAccount.BrokerType.KIS) {
            b.setAppKey(stripAllWhitespace(req.appKey()));
            b.setAppSecretEnc(crypto.encrypt(stripAllWhitespace(req.appSecret())));
            b.setCano(req.cano().trim());
            b.setAcntPrdtCd(req.acntPrdtCd().trim());
        } else {
            b.setBinanceApiKey(stripAllWhitespace(req.binanceApiKey()));
            b.setBinanceApiSecretEnc(crypto.encrypt(stripAllWhitespace(req.binanceApiSecret())));
            b.setBinanceMode(req.binanceMode() != null ? req.binanceMode() : BrokerAccount.BinanceMode.SPOT);
        }

        if (req.maxOrderUsd() != null && req.maxOrderUsd() >= 0) b.setMaxOrderUsd(req.maxOrderUsd());
        if (req.dailyOrderUsd() != null && req.dailyOrderUsd() >= 0) b.setDailyOrderUsd(req.dailyOrderUsd());
        if (req.dailyBuyKrw() != null && req.dailyBuyKrw() >= 0) b.setDailyBuyKrw(req.dailyBuyKrw());
        if (req.dailySellKrw() != null && req.dailySellKrw() >= 0) b.setDailySellKrw(req.dailySellKrw());
        b.setLastVerifiedAt(null);
        b.setTradingEnabled(env == BrokerAccount.Env.MOCK);
        brokerRepo.save(b);
        return ResponseEntity.ok(BrokerAccountDto.from(b));
    }

    @PatchMapping("/trading-enabled")
    @Transactional
    public ResponseEntity<?> setTradingEnabled(
            @RequestParam("env") BrokerAccount.Env env,
            @RequestParam(value = "brokerType", required = false) BrokerAccount.BrokerType brokerType,
            @RequestBody Map<String, Object> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        Boolean enabled = body.get("enabled") instanceof Boolean v ? v : null;
        if (enabled == null) return ResponseEntity.badRequest().body(Map.of("error", "enabled(boolean) 필수"));

        if (brokerType == null) brokerType = BrokerAccount.BrokerType.KIS; // 하위호환
        BrokerAccount b = brokerRepo.findByUserIdAndBrokerTypeAndEnv(uid, brokerType, env).orElse(null);
        if (b == null) return ResponseEntity.notFound().build();

        boolean isReal = env == BrokerAccount.Env.REAL;
        if (enabled && isReal && b.getLastVerifiedAt() == null) {
            return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED)
                    .body(Map.of("error", "먼저 /test로 키 유효성을 검증해야 합니다."));
        }
        // 실전 자동매매 시작 전 책임고지 1회 동의 필수 (needAck → 프론트가 동의 모달 표시 후 /ack-risk 호출).
        if (enabled && isReal && !Boolean.TRUE.equals(b.getRealRiskAcknowledged())) {
            return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED)
                    .body(Map.of(
                            "error", "실전 자동매매 시작 전 책임고지 동의가 필요합니다.",
                            "needAck", true
                    ));
        }
        if (enabled && isReal && b.getBrokerType() == BrokerAccount.BrokerType.KIS) {
            var gate = promotionGate.evaluate(uid, b);
            if (!gate.passed()) {
                return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED)
                        .body(Map.of(
                                "error", "승격 게이트 미충족",
                                "summary", gate.summary(),
                                "checks", gate.checks()
                        ));
            }
        }
        b.setTradingEnabled(enabled);
        return ResponseEntity.ok(BrokerAccountDto.from(b));
    }

    /**
     * 실전(REAL) 자동매매 책임고지 동의 (1회). 매매 ON 게이트의 needAck 응답을 해소한다.
     * 프론트는 "투자 책임 본인·자문 아님·레버리지 고위험" 고지에 동의 체크 후 이 엔드포인트를 호출한다.
     */
    @PatchMapping("/ack-risk")
    @Transactional
    public ResponseEntity<?> acknowledgeRealRisk(
            @RequestParam("env") BrokerAccount.Env env,
            @RequestParam(value = "brokerType", required = false) BrokerAccount.BrokerType brokerType) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        if (brokerType == null) brokerType = BrokerAccount.BrokerType.KIS;
        BrokerAccount b = brokerRepo.findByUserIdAndBrokerTypeAndEnv(uid, brokerType, env).orElse(null);
        if (b == null) return ResponseEntity.notFound().build();
        b.setRealRiskAcknowledged(true);
        return ResponseEntity.ok(BrokerAccountDto.from(b));
    }

    /**
     * 자동 체결(auto-execute) ON/OFF.
     * 전제: tradingEnabled=true.
     * REAL 계정은 추가로 "MOCK 졸업 게이트"를 통과해야 한다 —
     * 같은 KIS MOCK 계좌에서 자동매매(자동 체결)를 최소 {@value #AUTO_REAL_MIN_DAYS}일 동안
     * 최소 {@value #AUTO_REAL_MIN_TRADES}회 이상 수행한 이력이 있어야 실거래 자동체결을 켤 수 있다.
     */
    @PatchMapping("/auto-execute")
    @Transactional
    public ResponseEntity<?> setAutoExecute(
            @RequestParam("env") BrokerAccount.Env env,
            @RequestParam(value = "brokerType", required = false) BrokerAccount.BrokerType brokerType,
            @RequestBody Map<String, Object> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        Boolean enabled = body.get("enabled") instanceof Boolean v ? v : null;
        if (enabled == null) return ResponseEntity.badRequest().body(Map.of("error", "enabled(boolean) 필수"));

        if (brokerType == null) brokerType = BrokerAccount.BrokerType.KIS;
        BrokerAccount b = brokerRepo.findByUserIdAndBrokerTypeAndEnv(uid, brokerType, env).orElse(null);
        if (b == null) return ResponseEntity.notFound().build();

        if (enabled) {
            if (!Boolean.TRUE.equals(b.getTradingEnabled())) {
                return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED)
                        .body(Map.of("error", "먼저 tradingEnabled(자동매매 마스터 스위치)를 켜야 합니다."));
            }
            // REAL 졸업 게이트: MOCK 자동매매 이력(2주 + 20회)
            if (env == BrokerAccount.Env.REAL && brokerType == BrokerAccount.BrokerType.KIS) {
                var mock = brokerRepo.findByUserIdAndBrokerTypeAndEnv(uid, BrokerAccount.BrokerType.KIS, BrokerAccount.Env.MOCK).orElse(null);
                if (mock == null) {
                    return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED).body(Map.of(
                            "error", "REAL 자동체결을 켜려면 먼저 MOCK 계좌로 자동매매 이력이 필요합니다 (MOCK 계좌가 없음)."));
                }
                long trades = proposalRepo.countByBrokerAccountIdAndStatusAndAutoExecutedTrue(mock.getId(), "EXECUTED");
                java.time.LocalDateTime firstAt = proposalRepo.firstAutoExecutedAt(mock.getId());
                long days = firstAt == null ? 0
                        : java.time.Duration.between(firstAt, java.time.LocalDateTime.now()).toDays();
                boolean passed = trades >= AUTO_REAL_MIN_TRADES && firstAt != null && days >= AUTO_REAL_MIN_DAYS;
                if (!passed) {
                    return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED).body(Map.of(
                            "error", "REAL 자동체결 졸업 게이트 미충족",
                            "summary", String.format("MOCK 자동매매 %d일/%d회 진행 (필요: %d일 + %d회)",
                                    days, trades, AUTO_REAL_MIN_DAYS, AUTO_REAL_MIN_TRADES),
                            "mockAutoTrades", trades,
                            "mockAutoDays", days,
                            "requiredDays", AUTO_REAL_MIN_DAYS,
                            "requiredTrades", AUTO_REAL_MIN_TRADES));
                }
            }
        }

        b.setAutoExecute(enabled);
        return ResponseEntity.ok(BrokerAccountDto.from(b));
    }

    /**
     * 한도(maxOrderUsd / dailyOrderUsd) 만 부분 수정.
     * 주문 승인 모달에서 "1건당 한도 초과" 에러를 만났을 때, 키 재입력 없이 즉시 한도만 조정하기 위한 가벼운 PATCH.
     * body 예: { "maxOrderUsd": 200000, "dailyOrderUsd": 200000 } (둘 중 하나만 보내도 OK)
     */
    @PatchMapping("/limits")
    @Transactional
    public ResponseEntity<?> patchLimits(@RequestParam("env") BrokerAccount.Env env,
                                         @RequestParam(value = "brokerType", required = false) BrokerAccount.BrokerType brokerType,
                                         @RequestBody Map<String, Object> body) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        // 이전엔 KIS 로 하드코딩되어 Binance 계좌의 한도를 조정할 수 없었다(REAL Binance 빠른조정 모달이 KIS 계좌를 잘못 건드림).
        if (brokerType == null) brokerType = BrokerAccount.BrokerType.KIS; // 하위호환
        BrokerAccount b = brokerRepo.findByUserIdAndBrokerTypeAndEnv(uid, brokerType, env).orElse(null);
        if (b == null) return ResponseEntity.notFound().build();
        Long max = toLong(body.get("maxOrderUsd"));
        Long daily = toLong(body.get("dailyOrderUsd"));
        Long buyKrw = toLong(body.get("dailyBuyKrw"));
        Long sellKrw = toLong(body.get("dailySellKrw"));
        Long lossLimit = toLong(body.get("dailyLossLimitUsd"));
        if (max == null && daily == null && buyKrw == null && sellKrw == null && lossLimit == null) {
            return badReq("한도 필드 중 최소 1개 필요 (maxOrderUsd, dailyOrderUsd, dailyBuyKrw, dailySellKrw, dailyLossLimitUsd)");
        }
        // 음수 거부
        if (max != null && max < 0) return badReq("maxOrderUsd는 0 이상이어야 합니다");
        if (daily != null && daily < 0) return badReq("dailyOrderUsd는 0 이상이어야 합니다");
        if (buyKrw != null && buyKrw < 0) return badReq("dailyBuyKrw는 0 이상이어야 합니다");
        if (sellKrw != null && sellKrw < 0) return badReq("dailySellKrw는 0 이상이어야 합니다");
        if (lossLimit != null && lossLimit < 0) return badReq("dailyLossLimitUsd는 0 이상이어야 합니다");
        // REAL 안전 상한 — 등록(upsert) 경로와 동일 정책 재사용. 계좌의 실제 env 기준.
        String capViol = realCapViolation(b.getEnv(), max, daily, buyKrw, sellKrw);
        if (capViol != null) return badReq(capViol);

        if (lossLimit != null) b.setDailyLossLimitUsd(lossLimit == 0 ? null : lossLimit);
        if (max != null) b.setMaxOrderUsd(max);
        if (daily != null) b.setDailyOrderUsd(daily);
        if (buyKrw != null) b.setDailyBuyKrw(buyKrw);
        if (sellKrw != null) b.setDailySellKrw(sellKrw);
        brokerRepo.save(b);
        return ResponseEntity.ok(BrokerAccountDto.from(b));
    }

    private static Long toLong(Object v) {
        if (v == null) return null;
        if (v instanceof Number n) return n.longValue();
        try { return Long.parseLong(String.valueOf(v).trim()); } catch (Exception e) { return null; }
    }

    /** REAL 계정 승격 게이트 현황 조회 (UI 체크리스트용) */
    @GetMapping("/promotion-gate")
    public ResponseEntity<?> promotionGate(@RequestParam("env") BrokerAccount.Env env) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        BrokerAccount b = brokerRepo.findByUserIdAndBrokerTypeAndEnv(uid, BrokerAccount.BrokerType.KIS, env).orElse(null);
        if (b == null) return ResponseEntity.notFound().build();
        var gate = promotionGate.evaluate(uid, b);
        return ResponseEntity.ok(Map.of(
                "env", b.getEnv().name(),
                "passed", gate.passed(),
                "summary", gate.summary(),
                "checks", gate.checks()
        ));
    }

    @PostMapping("/test")
    @Transactional
    public ResponseEntity<?> testConnection(@RequestParam("env") BrokerAccount.Env env) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        BrokerAccount b = brokerRepo.findByUserIdAndBrokerTypeAndEnv(uid, BrokerAccount.BrokerType.KIS, env).orElse(null);
        if (b == null) return ResponseEntity.notFound().build();
        try {
            // 1차 검증: 토큰 발급만 성공해도 키/계좌 인증은 통과로 간주.
            //   - KIS 신규 고객 초당 호출 제한 강화 이후, 토큰 직후 잔고 4종을 연속 호출하면 EGW00002 빈발.
            //   - 잔고 조회는 best-effort 로 시도하되 실패해도 인증 자체는 성공 처리.
            kis.getAccessToken(b);
            b.setLastVerifiedAt(java.time.LocalDateTime.now());
            brokerRepo.save(b);

            Map<String, Object> bal;
            String balanceWarn = null;
            try {
                // KIS Gateway 초당 제한 회피용 대기 (토큰 발급 직후 4종 잔고 호출 → EGW00201 빈발).
                // 모의는 throttle 이 빡빡해서 1.5초 필요. KisApiClient.withRateLimitRetry 가 1회 더 재시도하지만
                // 토큰 직후 첫 호출에서 깨지면 그 한 번이 KRW 잔고를 0 으로 만들어버려서 사용자가 5억이 안 보임.
                Thread.sleep(1500);
                bal = kis.getOverseasBalance(b);
            } catch (Exception be) {
                balanceWarn = be.getMessage() == null ? "balance lookup failed" : be.getMessage();
                log.warn("[broker/test] auth OK but balance lookup failed user={} env={} : {}", uid, env, balanceWarn);
                bal = Map.of("cash_usd", 0.0, "cash_krw", 0.0, "positions", java.util.List.of());
            }

            Map<String, Object> body = new java.util.LinkedHashMap<>();
            body.put("ok", true);
            body.put("env", b.getEnv().name());
            body.put("cash_usd", bal.get("cash_usd"));
            body.put("cash_krw", bal.getOrDefault("cash_krw", 0.0));
            body.put("positions", bal.get("positions"));
            body.put("verified_at", b.getLastVerifiedAt());
            if (balanceWarn != null) {
                body.put("warn", "인증은 성공했지만 잔고 조회는 일시적으로 실패했습니다 (KIS 초당 호출 제한). 잠시 후 다시 시도해 주세요.");
            }
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            String msg = e.getMessage() == null ? "" : e.getMessage();
            // 키 불일치(서버 APP_CRYPTO_KEY 변경 등)는 KIS 문제가 아니라 재등록 필요 케이스
            if (msg.contains("decrypt failed") || msg.contains("key mismatch") || msg.contains("tampered")) {
                log.warn("[broker/test] DECRYPT FAIL user={} env={} — APP_CRYPTO_KEY mismatch", uid, env);
                return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                        "error", "저장된 키를 복호화할 수 없습니다 (서버 암호화 키 변경). 계좌를 삭제 후 다시 등록해 주세요.",
                        "code", "DECRYPT_FAILED",
                        "requireReregister", true
                ));
            }
            // KIS 측 인증 거부 → EGW00105 (유효하지 않은 AppSecret), EGW00104 (유효하지 않은 AppKey) 등
            String friendly = friendlyKisError(msg, env);
            log.warn("[broker/test] failed user={} env={} : {}", uid, env, msg);
            kis.invalidateToken(b);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of(
                            "error", friendly,
                            "raw", msg.length() > 400 ? msg.substring(0, 400) : msg
                    ));
        }
    }

    /** KIS 원본 에러 메시지를 사용자 친화 문구로 변환. */
    private static String friendlyKisError(String raw, BrokerAccount.Env env) {
        String envLabel = env == BrokerAccount.Env.REAL ? "실전" : "모의";
        String otherLabel = env == BrokerAccount.Env.REAL ? "모의" : "실전";
        // EGW00002 / EGW00133: 1분 내 토큰 재발급 시도 (KIS는 분당 1회 제한)
        // EGW00133이 정식 메시지지만, KIS 게이트웨이가 가끔 generic EGW00002로 응답하기도 함
        if (raw.contains("EGW00002") || raw.contains("EGW00133") || raw.contains("1분당 1회")) {
            return "[" + envLabel + "] KIS 토큰 발급 제한입니다. "
                    + "KIS는 같은 앱에 대해 1분에 1회만 토큰 발급을 허용합니다. "
                    + "약 1분 후 다시 '연결 테스트'를 눌러 주세요. "
                    + "(만약 1분 후에도 동일 오류라면 KIS 개발자센터에서 ① 앱 상태가 '사용중'인지, "
                    + "② 필요한 API 서비스를 구독했는지, ③ IP 보안 설정을 확인해 주세요.)";
        }
        // EGW00103: AppKey가 KIS 시스템에 존재하지 않음 (미등록 or 오입력)
        if (raw.contains("EGW00103")) {
            return "[EGW00103] " + envLabel + " AppKey가 KIS 서버에 등록되어 있지 않습니다. "
                    + "① KIS 개발자센터 → '나의 앱'에서 " + envLabel + "투자 앱이 존재하는지 확인, "
                    + "② " + envLabel + " 앱의 AppKey를 공백 없이 정확히 복사했는지 확인, "
                    + "③ " + otherLabel + " 앱 키를 잘못 입력하지 않았는지 확인해 주세요.";
        }
        // EGW00104: AppKey 형식/값 검증 실패
        if (raw.contains("EGW00104") || raw.contains("유효하지 않은 AppKey")) {
            return "[EGW00104] " + envLabel + " AppKey 형식이 올바르지 않습니다. "
                    + "KIS 개발자센터에서 " + envLabel + " 환경 AppKey를 정확히 복사했는지 확인해 주세요.";
        }
        // EGW00105: AppSecret 불일치
        if (raw.contains("EGW00105") || raw.contains("유효하지 않은 AppSecret")) {
            return "[EGW00105] " + envLabel + " AppSecret이 KIS 서버에서 거부되었습니다. "
                    + "① " + otherLabel + " 키를 잘못 넣지는 않았는지, "
                    + "② AppSecret 전체(180자+)를 한 번에 복사했는지, "
                    + "③ 재발급된 키인지 확인해 주세요.";
        }
        // EGW00121: 키 만료
        if (raw.contains("EGW00121") || raw.contains("기간이 만료된")) {
            return "[EGW00121] " + envLabel + " AppKey/AppSecret이 만료되었습니다. "
                    + "KIS 개발자센터에서 재발급 후 다시 등록해 주세요.";
        }
        // EGW00201: 호출 빈도 초과
        if (raw.contains("EGW00201") || raw.contains("초당")) {
            return "[EGW00201] KIS 호출 빈도 제한에 걸렸습니다. 잠시 후 다시 시도해 주세요.";
        }
        // 502 Bad Gateway: KIS 게이트웨이 장애 or 점검
        if (raw.contains("502") || raw.contains("Bad Gateway")) {
            return "[502] KIS 게이트웨이 일시 장애입니다. KIS 서버 점검 중이거나 네트워크 문제일 수 있습니다. "
                    + "잠시 후 다시 시도하거나 https://apiportal.koreainvestment.com 공지를 확인해 주세요.";
        }
        // 503: KIS 서버 점검
        if (raw.contains("503")) {
            return "[503] KIS 서버가 점검 중입니다. 잠시 후 다시 시도해 주세요.";
        }
        // 403 generic (위 EGW 코드로 분류 안 된 경우)
        if (raw.contains("403")) {
            return "[403] " + envLabel + " 키 인증이 거부되었습니다. "
                    + envLabel + " 앱 키(AppKey/AppSecret)가 올바른지 확인해 주세요. "
                    + "(원문: " + (raw.length() > 150 ? raw.substring(0, 150) + "..." : raw) + ")";
        }
        if (raw.contains("CANO") || raw.contains("계좌번호")) {
            return "종합계좌번호(CANO) 또는 상품코드가 올바르지 않습니다. KIS 계좌 정보를 다시 확인해 주세요.";
        }
        return "KIS 연결 실패 [" + (raw.length() > 200 ? raw.substring(0, 200) + "..." : raw) + "]";
    }

    @DeleteMapping
    @Transactional
    public ResponseEntity<?> remove(@RequestParam("env") BrokerAccount.Env env,
                                    @RequestParam(value = "brokerType", required = false) BrokerAccount.BrokerType brokerType) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        if (brokerType == null) brokerType = BrokerAccount.BrokerType.KIS; // 하위호환
        brokerRepo.findByUserIdAndBrokerTypeAndEnv(uid, brokerType, env).ifPresent(brokerRepo::delete);
        return ResponseEntity.noContent().build();
    }

    // ── Binance 전용 엔드포인트 ────────────────────────────────────────────────

    /**
     * Binance 연결 테스트: ping + 잔고 조회로 검증.
     */
    @PostMapping("/binance/test")
    @Transactional
    public ResponseEntity<?> testBinance(
            @RequestParam("env") BrokerAccount.Env env,
            @RequestParam(value = "mode", defaultValue = "SPOT") BrokerAccount.BinanceMode mode) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        BrokerAccount b = brokerRepo.findByUserIdAndBrokerTypeAndEnv(uid, BrokerAccount.BrokerType.BINANCE, env).orElse(null);
        if (b == null) return ResponseEntity.notFound().build();

        try {
            boolean pong = binance.ping(b);
            if (!pong) throw new RuntimeException("Binance server ping failed");

            Map<String, Object> balance;
            if (mode == BrokerAccount.BinanceMode.FUTURES) {
                balance = binance.getFuturesBalance(b);
            } else {
                balance = binance.getSpotBalance(b);
            }
            b.setLastVerifiedAt(java.time.LocalDateTime.now());
            brokerRepo.save(b);
            return ResponseEntity.ok(Map.of(
                "ok", true,
                "env", env.name(),
                "mode", mode.name(),
                "balance", balance,
                "verified_at", b.getLastVerifiedAt()
            ));
        } catch (Exception e) {
            String msg = e.getMessage() == null ? "" : e.getMessage();
            log.warn("[binance/test] failed user={} env={}: {}", uid, env, msg);
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", friendlyBinanceError(msg),
                                 "raw", msg.length() > 400 ? msg.substring(0, 400) : msg));
        }
    }

    /** Binance 잔고 조회 (인증된 계정만). */
    @GetMapping("/binance/balance")
    public ResponseEntity<?> binanceBalance(
            @RequestParam("env") BrokerAccount.Env env,
            @RequestParam(value = "mode", defaultValue = "SPOT") BrokerAccount.BinanceMode mode) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        BrokerAccount b = brokerRepo.findByUserIdAndBrokerTypeAndEnv(uid, BrokerAccount.BrokerType.BINANCE, env).orElse(null);
        if (b == null) return ResponseEntity.notFound().build();
        if (!Boolean.TRUE.equals(b.getTradingEnabled()) && b.getLastVerifiedAt() == null) {
            return ResponseEntity.status(HttpStatus.PRECONDITION_FAILED)
                    .body(Map.of("error", "Binance 계정을 먼저 /binance/test로 검증하세요."));
        }
        try {
            Map<String, Object> balance = (mode == BrokerAccount.BinanceMode.FUTURES)
                    ? binance.getFuturesBalance(b)
                    : binance.getSpotBalance(b);
            return ResponseEntity.ok(balance);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.BAD_GATEWAY)
                    .body(Map.of("error", friendlyBinanceError(e.getMessage())));
        }
    }

    private static String friendlyBinanceError(String raw) {
        // 에러 매핑 단일화: BinanceApiClient.friendlyError 로 위임.
        return BinanceApiClient.friendlyError(raw);
    }

    private static ResponseEntity<?> validateKis(BrokerAccountUpsertReq r) {
        if (isBlank(r.appKey())) return ResponseEntity.badRequest().body(Map.of("error", "appKey 필수"));
        if (isBlank(r.appSecret())) return ResponseEntity.badRequest().body(Map.of("error", "appSecret 필수"));
        if (isBlank(r.cano()) || !r.cano().matches("\\d{6,12}"))
            return ResponseEntity.badRequest().body(Map.of("error", "cano(종합계좌번호) 형식 오류"));
        if (isBlank(r.acntPrdtCd()) || !r.acntPrdtCd().matches("\\d{2,4}"))
            return ResponseEntity.badRequest().body(Map.of("error", "acntPrdtCd(상품코드) 형식 오류"));
        if (r.appKey().length() < 20 || r.appSecret().length() < 30)
            return ResponseEntity.badRequest().body(Map.of("error", "appKey/appSecret 길이가 비정상입니다. KIS 발급값을 다시 확인하세요."));
        return null;
    }

    private static ResponseEntity<?> validateBinance(BrokerAccountUpsertReq r) {
        if (isBlank(r.binanceApiKey())) return ResponseEntity.badRequest().body(Map.of("error", "binanceApiKey 필수"));
        if (isBlank(r.binanceApiSecret())) return ResponseEntity.badRequest().body(Map.of("error", "binanceApiSecret 필수"));
        if (r.binanceApiKey().length() < 20)
            return ResponseEntity.badRequest().body(Map.of("error", "Binance API Key 길이가 비정상입니다."));
        return null;
    }

    private static ResponseEntity<?> validate(BrokerAccountUpsertReq r) {
        return validateKis(r); // 하위호환 (기본 KIS)
    }

    private static boolean isBlank(String s) { return s == null || s.isBlank(); }

    /** 줄바꿈 / 탭 / 공백 / zero-width-space(U+200B) 등 모든 보이지 않는 문자 제거. */
    private static String stripAllWhitespace(String s) {
        if (s == null) return null;
        return s.replaceAll("[\\s\\u200B\\u00A0]", "");
    }

    private static ResponseEntity<?> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "인증이 필요합니다."));
    }
}
