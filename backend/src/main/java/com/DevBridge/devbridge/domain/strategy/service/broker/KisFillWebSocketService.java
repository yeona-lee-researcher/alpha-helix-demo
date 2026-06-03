package com.DevBridge.devbridge.domain.strategy.service.broker;

import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * KIS 실시간 체결통보 WebSocket (B3-4) — 검증 가능한 기반(승인키 발급 + WS 연결).
 *
 * <p>전체 흐름: 승인키 → KIS WS 연결 → 해외주식 체결통보(tr) 구독 → 체결 푸시 수신 시 즉시 반영(OrderFillService).
 * <b>현재 구현/검증 범위: 승인키 발급 + WS 연결.</b> 구독(tr_key=HTS ID)과 메시지 파싱(REAL 은 AES 암호화)은
 * 실제 체결 통보가 오는 장중에 KIS 프로토콜로 정밀화해야 한다. 그 사이 B1 폴링이 체결확인을 담당한다.
 *
 * flag {@code app.kis.ws.enabled} (기본 off — 지속 연결이라 운영에서 명시 활성화).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class KisFillWebSocketService {

    private final KisApiClient kis;

    @Value("${app.kis.ws.enabled:false}")
    private boolean enabled;

    public boolean isEnabled() { return enabled; }

    private static String wsUrl(BrokerAccount b) {
        return b.getEnv() == BrokerAccount.Env.REAL
                ? "wss://ops.koreainvestment.com:21000"
                : "wss://ops.koreainvestment.com:31000";
    }

    /** 승인키 발급 + KIS WS 연결 검증. 구독/메시지 파싱은 장중 실제 통보로 정밀화. */
    public Map<String, Object> testConnection(BrokerAccount b) {
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            String key = kis.getWsApprovalKey(b);
            out.put("approvalKeyObtained", key != null && !key.isBlank());
        } catch (Exception e) {
            out.put("approvalKeyObtained", false);
            out.put("error", "승인키 발급 실패: " + e.getMessage());
            return out;
        }
        String url = wsUrl(b);
        out.put("wsUrl", url);
        WebSocket ws = null;
        try {
            ws = HttpClient.newHttpClient().newWebSocketBuilder()
                    .connectTimeout(Duration.ofSeconds(10))
                    .buildAsync(URI.create(url), new WebSocket.Listener() {})
                    .get(12, TimeUnit.SECONDS);
            out.put("wsConnected", true);
            log.info("[KIS-WS] 체결통보 WS 연결 검증 성공 {}", url);
        } catch (Exception e) {
            out.put("wsConnected", false);
            out.put("error", "WS 연결 실패: " + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()));
        } finally {
            if (ws != null) {
                try { ws.sendClose(WebSocket.NORMAL_CLOSURE, "test").get(3, TimeUnit.SECONDS); } catch (Exception ignore) {}
            }
        }
        out.put("note", "체결통보 구독(tr_key=HTS ID)+메시지 파싱(REAL AES)은 장중 실제 통보로 정밀화 필요. 그 사이 B1 폴링이 체결확인 담당.");
        return out;
    }
}
