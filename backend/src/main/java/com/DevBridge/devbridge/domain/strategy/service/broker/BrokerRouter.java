package com.DevBridge.devbridge.domain.strategy.service.broker;

import com.DevBridge.devbridge.domain.strategy.entity.BrokerAccount;
import org.springframework.stereotype.Service;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * BrokerAccount.brokerType → 해당 {@link Broker} 구현 선택. 주문/체결/잔고의 단일 분기점.
 *
 * <p>등록된 모든 {@link Broker} 빈을 type 별로 매핑한다(KIS/BINANCE). null type 은 하위호환으로 KIS.
 */
@Service
public class BrokerRouter {

    private final Map<BrokerAccount.BrokerType, Broker> registry =
            new EnumMap<>(BrokerAccount.BrokerType.class);

    public BrokerRouter(List<Broker> brokers) {
        for (Broker b : brokers) registry.put(b.type(), b);
    }

    public Broker forAccount(BrokerAccount account) {
        return forType(account == null ? null : account.getBrokerType());
    }

    public Broker forType(BrokerAccount.BrokerType type) {
        Broker b = registry.get(type == null ? BrokerAccount.BrokerType.KIS : type);
        if (b == null) throw new IllegalStateException("지원하지 않는 브로커: " + type);
        return b;
    }
}
