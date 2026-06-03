package com.DevBridge.devbridge.domain.payment.dto;

import com.DevBridge.devbridge.domain.payment.entity.PaymentMethod;
import lombok.*;

import java.time.LocalDateTime;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class PaymentMethodResponse {

    private Long id;
    private String brand;       // VISA / MASTERCARD ...
    private String last4;
    private String holderName;
    private Integer expMonth;
    private Integer expYear;
    private Boolean isDefault;
    private String nickname;
    private LocalDateTime createdAt;

    public static PaymentMethodResponse from(PaymentMethod pm) {
        return PaymentMethodResponse.builder()
                .id(pm.getId())
                .brand(pm.getBrand() == null ? null : pm.getBrand().name())
                .last4(pm.getLast4())
                .holderName(pm.getHolderName())
                .expMonth(pm.getExpMonth())
                .expYear(pm.getExpYear())
                .isDefault(pm.isDefault())
                .nickname(pm.getNickname())
                .createdAt(pm.getCreatedAt())
                .build();
    }
}
