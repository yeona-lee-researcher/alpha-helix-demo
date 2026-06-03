package com.DevBridge.devbridge.domain.strategy.controller;

import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.strategy.entity.Strategy;
import com.DevBridge.devbridge.domain.strategy.dto.DailySignalDto;
import com.DevBridge.devbridge.domain.strategy.dto.StrategyBacktestSummaryDto;
import com.DevBridge.devbridge.domain.strategy.dto.StrategyDto;
import com.DevBridge.devbridge.domain.strategy.dto.StrategyUpsertReq;
import com.DevBridge.devbridge.domain.user.entity.*;
import com.DevBridge.devbridge.domain.client.entity.*;
import com.DevBridge.devbridge.domain.project.entity.*;
import com.DevBridge.devbridge.domain.chat.entity.*;
import com.DevBridge.devbridge.domain.notification.entity.*;
import com.DevBridge.devbridge.domain.payment.entity.*;
import com.DevBridge.devbridge.domain.strategy.entity.*;
import com.DevBridge.devbridge.domain.ai.entity.*;
import com.DevBridge.devbridge.domain.user.repository.*;
import com.DevBridge.devbridge.domain.client.repository.*;
import com.DevBridge.devbridge.domain.project.repository.*;
import com.DevBridge.devbridge.domain.chat.repository.*;
import com.DevBridge.devbridge.domain.notification.repository.*;
import com.DevBridge.devbridge.domain.payment.repository.*;
import com.DevBridge.devbridge.domain.strategy.repository.*;
import com.DevBridge.devbridge.domain.ai.repository.*;
import com.DevBridge.devbridge.global.security.AuthContext;
import com.DevBridge.devbridge.domain.strategy.service.BacktestService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * Alpha-Helix 전략 CRUD + 사용자별 격리.
 * - 모든 엔드포인트 JWT 필수.
 * - "원금 분리" 규칙은 DB 레벨로 보장 (각 strategy.principal_krw 독립).
 */
@Slf4j
@RestController
@RequestMapping("/api/strategies")
@RequiredArgsConstructor
public class StrategyController {

    private static final long DEFAULT_TQQQ_PRINCIPAL_KRW = 200_000_000L;
    private static final long DEFAULT_SOXL_PRINCIPAL_KRW = 50_000_000L;
    private static final long DEFAULT_QLD_PRINCIPAL_KRW = 150_000_000L;
    private static final LocalDate DEFAULT_START = LocalDate.of(2024, 1, 2);

    private final StrategyRepository strategyRepository;
    private final StrategyTradeRepository tradeRepository;
    private final StrategyStateRepository stateRepository;
    private final DailySignalRepository signalRepository;
    private final StrategyBacktestSummaryRepository summaryRepository;
    private final UserRepository userRepository;
    private final BacktestService backtestService;

    // ────────────────────────────────────────────────────── 조회

    @GetMapping
    public ResponseEntity<?> list() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        return ResponseEntity.ok(
                strategyRepository.findByUserIdOrderByCreatedAtAsc(uid).stream()
                        .map(StrategyDto::from).toList()
        );
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> detail(@PathVariable Long id) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        return strategyRepository.findById(id)
                .filter(s -> s.getUser().getId().equals(uid))
                .<ResponseEntity<?>>map(s -> ResponseEntity.ok(StrategyDto.from(s)))
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/trades")
    public ResponseEntity<?> trades(@PathVariable Long id,
                                    @RequestParam(required = false, defaultValue = "BACKTEST") String source) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        var s = strategyRepository.findById(id).orElse(null);
        if (s == null || !s.getUser().getId().equals(uid)) return ResponseEntity.notFound().build();
        StrategyTrade.Source src;
        try { src = StrategyTrade.Source.valueOf(source); }
        catch (IllegalArgumentException e) { return ResponseEntity.badRequest().body(Map.of("error", "invalid source")); }
        return ResponseEntity.ok(tradeRepository.findByStrategyIdAndSourceOrderByTradeDateAscIdAsc(id, src));
    }

    @GetMapping("/{id}/states")
    public ResponseEntity<?> states(@PathVariable Long id) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        var s = strategyRepository.findById(id).orElse(null);
        if (s == null || !s.getUser().getId().equals(uid)) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(stateRepository.findByStrategyIdOrderByAsOfDateAsc(id));
    }

    @GetMapping("/{id}/signals")
    @Transactional(readOnly = true)
    public ResponseEntity<?> signals(@PathVariable Long id) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        var s = strategyRepository.findById(id).orElse(null);
        if (s == null || !s.getUser().getId().equals(uid)) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(
                signalRepository.findByStrategyIdOrderByAsOfDateDesc(id).stream()
                        .map(DailySignalDto::from).toList()
        );
    }

    @GetMapping("/{id}/summary")
    @Transactional(readOnly = true)
    public ResponseEntity<?> summary(@PathVariable Long id) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        var s = strategyRepository.findById(id).orElse(null);
        if (s == null || !s.getUser().getId().equals(uid)) return ResponseEntity.notFound().build();
        return summaryRepository.findByStrategyId(id)
                .<ResponseEntity<?>>map(x -> ResponseEntity.ok(StrategyBacktestSummaryDto.from(x)))
                .orElse(ResponseEntity.noContent().build());
    }

    /** Client_Home: 내 모든 전략의 최신 시그널 1건씩 */
    @GetMapping("/me/latest-signals")
    @Transactional(readOnly = true)
    public ResponseEntity<?> latestSignals() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        return ResponseEntity.ok(
                signalRepository.findLatestPerStrategyByUser(uid).stream()
                        .map(DailySignalDto::from).toList()
        );
    }

    /** Client_Home: 내 모든 전략의 백테스트 요약 */
    @GetMapping("/me/summaries")
    @Transactional(readOnly = true)
    public ResponseEntity<?> mySummaries() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        return ResponseEntity.ok(
                summaryRepository.findAllByUserId(uid).stream()
                        .map(StrategyBacktestSummaryDto::from).toList()
        );
    }

    // ────────────────────────────────────────────────────── CUD

    @PostMapping
    @Transactional
    public ResponseEntity<?> create(@RequestBody StrategyUpsertReq req) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        if (req.code() == null || req.code().isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "code 필수"));
        if (req.ticker() == null || req.ticker().isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "ticker 필수"));
        if (req.method() == null) return ResponseEntity.badRequest().body(Map.of("error", "method 필수"));
        if (req.principalKrw() == null || req.principalKrw() <= 0) return ResponseEntity.badRequest().body(Map.of("error", "principalKrw 양수 필수"));
        if (strategyRepository.existsByUserIdAndCode(uid, req.code())) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "이미 존재하는 code"));
        }
        User u = userRepository.findById(uid).orElseThrow();
        Strategy s = Strategy.builder()
                .user(u)
                .code(req.code())
                .name(req.name())
                .method(req.method())
                .ticker(req.ticker().toUpperCase())
                .benchmark(req.benchmark())
                .principalKrw(req.principalKrw())
                .startDate(req.startDate() != null ? req.startDate() : DEFAULT_START)
                .regime(req.regime())
                .goal(req.goal())
                .paramsJson(req.paramsJson() != null ? req.paramsJson() : "{}")
                .active(req.active() == null ? true : req.active())
                .build();
        strategyRepository.save(s);
        return ResponseEntity.status(HttpStatus.CREATED).body(StrategyDto.from(s));
    }

    @PutMapping("/{id}")
    @Transactional
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody StrategyUpsertReq req) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        Strategy s = strategyRepository.findById(id).orElse(null);
        if (s == null || !s.getUser().getId().equals(uid)) return ResponseEntity.notFound().build();
        if (req.name() != null) s.setName(req.name());
        if (req.regime() != null) s.setRegime(req.regime());
        if (req.goal() != null) s.setGoal(req.goal());
        if (req.paramsJson() != null) s.setParamsJson(req.paramsJson());
        if (req.principalKrw() != null && req.principalKrw() > 0) s.setPrincipalKrw(req.principalKrw());
        if (req.startDate() != null) s.setStartDate(req.startDate());
        if (req.benchmark() != null) s.setBenchmark(req.benchmark());
        if (req.active() != null) s.setActive(req.active());
        // ticker/code/method는 운영 중 변경 위험 → 변경 금지
        return ResponseEntity.ok(StrategyDto.from(s));
    }

    @DeleteMapping("/{id}")
    @Transactional
    public ResponseEntity<?> remove(@PathVariable Long id) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        Strategy s = strategyRepository.findById(id).orElse(null);
        if (s == null || !s.getUser().getId().equals(uid)) return ResponseEntity.notFound().build();
        // 자식 정리
        tradeRepository.deleteByStrategyIdAndSource(id, StrategyTrade.Source.BACKTEST);
        tradeRepository.deleteByStrategyIdAndSource(id, StrategyTrade.Source.LIVE);
        tradeRepository.deleteByStrategyIdAndSource(id, StrategyTrade.Source.MANUAL);
        signalRepository.deleteAll(signalRepository.findByStrategyIdOrderByAsOfDateDesc(id));
        stateRepository.deleteAll(stateRepository.findByStrategyIdOrderByAsOfDateAsc(id));
        summaryRepository.findByStrategyId(id).ifPresent(summaryRepository::delete);
        strategyRepository.delete(s);
        return ResponseEntity.noContent().build();
    }

    // ────────────────────────────────────────────────────── 시드

    /**
     * 사용자가 처음 들어왔을 때 TQQQ/SOXL/QLD 3종을 한 번에 생성.
     * 이미 동일 code가 있으면 skip.
     */
    @PostMapping("/seed")
    @Transactional
    public ResponseEntity<?> seedDefaults() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        User u = userRepository.findById(uid).orElseThrow();
        int created = 0;
        created += seedOne(u, "STR-TQQQ-INF", "TQQQ 무한매수법", Strategy.Method.INFINITE_BUY, "TQQQ", "QQQ",
                DEFAULT_TQQQ_PRINCIPAL_KRW, "LEVERAGED · NDX 3X",
                "나스닥100 3X 레버리지를 40분할 LOC 정액매수로 변동성 흡수, +10% 익절 후 자동 리셋",
                "{\"splits\":40,\"sellTargetPct\":10,\"locUpperPct\":12,\"firstBuyShares\":1}");
        created += seedOne(u, "STR-SOXL-INF", "SOXL 무한매수법", Strategy.Method.INFINITE_BUY, "SOXL", "SOXX",
                DEFAULT_SOXL_PRINCIPAL_KRW, "LEVERAGED · SEMIS 3X",
                "미국 반도체 3X 레버리지를 40분할 LOC 정액매수로 운영, 사이클 변동성 분산",
                "{\"splits\":40,\"sellTargetPct\":10,\"locUpperPct\":13,\"firstBuyShares\":1}");
        created += seedOne(u, "STR-QLD-VR", "QLD 밸류 리밸런싱(VR)", Strategy.Method.VALUE_REBALANCING, "QLD", "QQQ",
                DEFAULT_QLD_PRINCIPAL_KRW, "LEVERAGED · NDX 2X",
                "QLD(나스닥100 2X)를 2주 단위 V값 기준 ±20% 범위 매매로 감정매매 차단",
                "{\"rebalanceDays\":10,\"expectedReturn\":0.02,\"bandPct\":0.20,\"poolTargetPct\":0.50,\"biweeklyContribKrw\":0,\"initialPoolPct\":0.50}");
        return ResponseEntity.ok(Map.of("created", created, "total", strategyRepository.findByUserIdOrderByCreatedAtAsc(uid).size()));
    }

    /**
     * 미국 3X 레버리지 ETF 14종을 무한매수법으로 한 번에 시드.
     * 이미 코드가 있는 종목(TQQQ/SOXL)은 skip. 기본 원금 ₩3천만 — 사용자가 추후 조정 가능.
     * (DFEN/FAS/FNGU/LABU/MIDU/NAIL/RETL/SOXL/TECL/TNA/TPOR/TQQQ/UPRO/WANT/WEBL)
     */
    @PostMapping("/seed-leveraged")
    @Transactional
    public ResponseEntity<?> seedLeveragedUniverse() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        User u = userRepository.findById(uid).orElseThrow();
        long defaultPrincipal = 30_000_000L;
        // {ticker, benchmark, regime, sector설명}
        Object[][] universe = new Object[][] {
            {"DFEN", "ITA",  "LEVERAGED · DEFENSE 3X",   "미국 항공·방산 3X (보잉·록히드마틴 등)"},
            {"FAS",  "XLF",  "LEVERAGED · FINANCIALS 3X","미국 금융 3X (BoA·JP모건 등)"},
            {"FNGU", "QQQ",  "LEVERAGED · MEGA TECH 3X ETN","미국+중국 대형 10개사 3X ETN"},
            {"LABU", "XBI",  "LEVERAGED · BIOTECH 3X",   "미국 바이오 섹터 3X"},
            {"MIDU", "MDY",  "LEVERAGED · MID CAP 3X",   "미국 중형주 3X"},
            {"NAIL", "ITB",  "LEVERAGED · HOMEBUILDER 3X","미국 주택건설 3X (D.R.Horton·Lennar 등)"},
            {"RETL", "XRT",  "LEVERAGED · RETAIL 3X",    "미국 소매/유통 3X"},
            {"SOXL", "SOXX", "LEVERAGED · SEMIS 3X",     "미국 반도체 3X (NVDA·INTC·AVGO 등)"},
            {"TECL", "XLK",  "LEVERAGED · TECH 3X",      "미국 빅테크 3X (AAPL·MSFT 등)"},
            {"TNA",  "IWM",  "LEVERAGED · SMALL CAP 3X", "러셀2000 소형주 3X"},
            {"TPOR", "IYT",  "LEVERAGED · TRANSPORT 3X", "다우존스 운송 3X"},
            {"TQQQ", "QQQ",  "LEVERAGED · NDX 3X",       "나스닥100 3X"},
            {"UPRO", "SPY",  "LEVERAGED · S&P500 3X",    "S&P500 3X"},
            {"WANT", "XLY",  "LEVERAGED · CONSUMER 3X",  "미국 소비재/소비테마 3X"},
            {"WEBL", "FDN",  "LEVERAGED · INTERNET 3X",  "다우존스 인터넷 3X"},
        };
        int created = 0;
        for (Object[] row : universe) {
            String t = (String) row[0];
            created += seedOne(u, "STR-" + t + "-INF", t + " 무한매수법",
                    Strategy.Method.INFINITE_BUY, t, (String) row[1],
                    defaultPrincipal, (String) row[2],
                    (String) row[3] + " — 40분할 LOC 정액매수, +10% 익절 자동 리셋",
                    "{\"splits\":40,\"sellTargetPct\":10,\"locUpperPct\":12,\"firstBuyShares\":1}");
        }
        return ResponseEntity.ok(Map.of(
                "created", created,
                "skipped", universe.length - created,
                "total", strategyRepository.findByUserIdOrderByCreatedAtAsc(uid).size()
        ));
    }

    private int seedOne(User u, String code, String name, Strategy.Method method, String ticker, String bench,
                        long principalKrw, String regime, String goal, String paramsJson) {
        if (strategyRepository.existsByUserIdAndCode(u.getId(), code)) return 0;
        strategyRepository.save(Strategy.builder()
                .user(u).code(code).name(name).method(method).ticker(ticker).benchmark(bench)
                .principalKrw(principalKrw).startDate(DEFAULT_START).regime(regime).goal(goal)
                .paramsJson(paramsJson).active(true).build());
        return 1;
    }

    // ────────────────────────────────────────────────────── 백테스트 수동 트리거

    /** 단일 전략 재실행. 시장 데이터 신선화도 같이 일어남. */
    @PostMapping("/{id}/backtest")
    public ResponseEntity<?> runBacktest(@PathVariable Long id) {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        Strategy s = strategyRepository.findById(id).orElse(null);
        if (s == null || !s.getUser().getId().equals(uid)) return ResponseEntity.notFound().build();
        try {
            var summary = backtestService.runFor(s);
            if (summary == null) return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                    .body(Map.of("error", "insufficient market data"));
            return ResponseEntity.ok(StrategyBacktestSummaryDto.from(summary));
        } catch (Exception e) {
            log.error("backtest failed strategyId={}", id, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage() != null ? e.getMessage() : "백테스트 실행 중 오류가 발생했습니다."));
        }
    }

    /** 내 모든 활성 전략 일괄 재실행. */
    @PostMapping("/me/backtest-all")
    public ResponseEntity<?> backtestAll() {
        Long uid = AuthContext.currentUserId();
        if (uid == null) return unauthorized();
        var all = strategyRepository.findByUserIdOrderByCreatedAtAsc(uid);
        int ok = 0, fail = 0;
        for (var s : all) {
            try {
                if (backtestService.runFor(s) != null) ok++; else fail++;
            } catch (Exception e) { fail++; }
        }
        return ResponseEntity.ok(Map.of("ran", all.size(), "success", ok, "failed", fail));
    }

    private static ResponseEntity<?> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "인증이 필요합니다."));
    }
}
