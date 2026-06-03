package com.DevBridge.devbridge.domain.strategy.service.broker;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 전역 거래 차단(kill-switch)의 런타임 동적 제어 (B3).
 *
 * <p>기본값은 {@code app.trading.kill-switch} 설정. 운영 중 <b>재시작 없이</b> 긴급 ON/OFF 가능.
 * 모든 주문 경로(ProposalExecutionService·KisApiClient)가 이 서비스를 확인하므로,
 * 토글 즉시 전 주문이 차단/허용된다. (재시작 시 설정 기본값으로 복귀)
 */
@Service
@Slf4j
public class TradingControlService {

    @Value("${app.trading.kill-switch:false}")
    private boolean configKillSwitch;

    /** null = 설정값 사용, 아니면 런타임 오버라이드. */
    private volatile Boolean override = null;

    public boolean isKillSwitchOn() {
        return override != null ? override : configKillSwitch;
    }

    public void setKillSwitch(boolean on) {
        this.override = on;
        log.warn("[TradingControl] kill-switch 런타임 설정 → {}", on);
    }

    public void resetToConfig() {
        this.override = null;
    }

    public Map<String, Object> status() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("killSwitch", isKillSwitchOn());
        m.put("source", override != null ? "runtime-override" : "config");
        m.put("configDefault", configKillSwitch);
        return m;
    }
}
