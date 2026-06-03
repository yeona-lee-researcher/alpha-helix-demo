package com.DevBridge.devbridge.domain.payment.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PaymentMethodCreateRequest {
    /** 카드 번호 (공백/하이픈 허용, 13~19자리). 서버에서 Luhn 검증 후 last4 만 저장. */
    private String number;
    /** 3 또는 4자리 CVC. 서버에서 형식만 검증, 절대 저장 안 함. */
    private String cvc;
    /** 영문 카드 소유자명. */
    private String holderName;
    /** 1~12 */
    private Integer expMonth;
    /** YYYY (4자리) */
    private Integer expYear;
    /** 기본 결제 수단 여부 */
    private Boolean isDefault;
    /** 사용자 별칭 (선택) */
    private String nickname;
}
