package com.DevBridge.devbridge.domain.project.dto;

import com.DevBridge.devbridge.domain.payment.entity.PaymentMethod;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EscrowPayMockRequest {
    /** 등록된 PaymentMethod id */
    private Long paymentMethodId;
    /** 강제 실패 시뮬레이션 */
    private Boolean simulateFail;
}
