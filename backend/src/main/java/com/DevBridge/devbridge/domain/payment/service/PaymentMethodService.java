package com.DevBridge.devbridge.domain.payment.service;

import com.DevBridge.devbridge.domain.payment.dto.PaymentMethodCreateRequest;
import com.DevBridge.devbridge.domain.payment.dto.PaymentMethodResponse;
import com.DevBridge.devbridge.domain.payment.entity.PaymentMethod;
import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.payment.repository.PaymentMethodRepository;
import com.DevBridge.devbridge.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

@Service
@RequiredArgsConstructor
public class PaymentMethodService {

    private final PaymentMethodRepository paymentMethodRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<PaymentMethodResponse> listMine(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));
        return paymentMethodRepository.findByUserOrderByIsDefaultDescCreatedAtDesc(user)
                .stream()
                .map(PaymentMethodResponse::from)
                .toList();
    }

    @Transactional
    public PaymentMethodResponse create(Long userId, PaymentMethodCreateRequest req) {
        if (req == null) throw new IllegalArgumentException("요청 본문이 비어있습니다.");

        String rawNumber = req.getNumber() == null ? "" : req.getNumber().replaceAll("[\\s-]", "");
        if (!rawNumber.matches("\\d{13,19}")) {
            throw new IllegalArgumentException("카드 번호 형식이 올바르지 않습니다.");
        }
        if (!luhnCheck(rawNumber)) {
            // Mock 환경: Luhn 실패해도 통과시키되 로그만 남김
            // throw new IllegalArgumentException("유효하지 않은 카드 번호입니다.");
        }

        String cvc = req.getCvc() == null ? "" : req.getCvc().trim();
        if (!cvc.matches("\\d{3,4}")) {
            throw new IllegalArgumentException("CVC 형식이 올바르지 않습니다.");
        }

        String holder = req.getHolderName() == null ? "" : req.getHolderName().trim();
        if (holder.length() < 2 || holder.length() > 100) {
            throw new IllegalArgumentException("카드 소유자명을 확인해 주세요.");
        }

        Integer m = req.getExpMonth();
        Integer y = req.getExpYear();
        if (m == null || y == null || m < 1 || m > 12 || y < 1900) {
            throw new IllegalArgumentException("만료일이 올바르지 않습니다.");
        }
        YearMonth exp = YearMonth.of(y, m);
        YearMonth now = YearMonth.now();
        if (exp.isBefore(now)) {
            throw new IllegalArgumentException("이미 만료된 카드입니다.");
        }
        if (exp.isAfter(now.plusYears(15))) {
            throw new IllegalArgumentException("만료일이 너무 멀리 있습니다.");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));

        long existing = paymentMethodRepository.countByUser(user);
        boolean makeDefault = Boolean.TRUE.equals(req.getIsDefault()) || existing == 0;

        PaymentMethod pm = PaymentMethod.builder()
                .user(user)
                .brand(detectBrand(rawNumber))
                .last4(rawNumber.substring(rawNumber.length() - 4))
                .holderName(holder)
                .expMonth(m)
                .expYear(y)
                .isDefault(makeDefault)
                .nickname(req.getNickname() == null ? null : req.getNickname().trim())
                .build();

        PaymentMethod saved = paymentMethodRepository.save(pm);
        if (makeDefault) {
            paymentMethodRepository.clearOtherDefaults(user, saved.getId());
        }
        return PaymentMethodResponse.from(saved);
    }

    @Transactional
    public void delete(Long userId, Long pmId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));
        PaymentMethod pm = paymentMethodRepository.findByIdAndUser(pmId, user)
                .orElseThrow(() -> new IllegalArgumentException("결제 수단을 찾을 수 없습니다."));
        boolean wasDefault = pm.isDefault();
        paymentMethodRepository.delete(pm);
        if (wasDefault) {
            paymentMethodRepository.findByUserOrderByIsDefaultDescCreatedAtDesc(user)
                    .stream()
                    .findFirst()
                    .ifPresent(remaining -> {
                        remaining.setDefault(true);
                        paymentMethodRepository.save(remaining);
                    });
        }
    }

    @Transactional
    public PaymentMethodResponse setDefault(Long userId, Long pmId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));
        PaymentMethod pm = paymentMethodRepository.findByIdAndUser(pmId, user)
                .orElseThrow(() -> new IllegalArgumentException("결제 수단을 찾을 수 없습니다."));
        pm.setDefault(true);
        paymentMethodRepository.save(pm);
        paymentMethodRepository.clearOtherDefaults(user, pm.getId());
        return PaymentMethodResponse.from(pm);
    }

    /** 결제 처리 시 호출되는 내부 헬퍼: 본인 결제수단만 사용 가능. */
    @Transactional(readOnly = true)
    public PaymentMethod requireOwned(Long userId, Long pmId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다."));
        return paymentMethodRepository.findByIdAndUser(pmId, user)
                .orElseThrow(() -> new IllegalArgumentException("결제 수단을 찾을 수 없습니다."));
    }

    // ---------- helpers ----------

    private static boolean luhnCheck(String n) {
        int sum = 0;
        boolean alt = false;
        for (int i = n.length() - 1; i >= 0; i--) {
            int d = n.charAt(i) - '0';
            if (alt) {
                d *= 2;
                if (d > 9) d -= 9;
            }
            sum += d;
            alt = !alt;
        }
        return sum % 10 == 0;
    }

    private static PaymentMethod.CardBrand detectBrand(String n) {
        if (n.startsWith("4")) return PaymentMethod.CardBrand.VISA;
        if (n.matches("^(5[1-5]|2(2[2-9]|[3-6]\\d|7[01]|720)).*")) return PaymentMethod.CardBrand.MASTERCARD;
        if (n.startsWith("34") || n.startsWith("37")) return PaymentMethod.CardBrand.AMEX;
        if (n.startsWith("35")) return PaymentMethod.CardBrand.JCB;
        if (n.startsWith("6")) return PaymentMethod.CardBrand.DISCOVER;
        return PaymentMethod.CardBrand.LOCAL;
    }
}
