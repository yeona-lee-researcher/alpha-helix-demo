package com.DevBridge.devbridge.domain.project.dto;

import com.DevBridge.devbridge.domain.project.entity.ProjectEscrow;
import lombok.*;

import java.time.LocalDateTime;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EscrowResponse {

    private Long id;
    private Long projectId;
    private Long milestoneId;
    private Long amount;
    private Long payerUserId;
    private Long payeeUserId;
    private String status;
    private String paymentMethod;
    private Long paymentMethodId;
    private String paymentTxId;
    private LocalDateTime depositedAt;
    private LocalDateTime releasedAt;
    private LocalDateTime refundedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public static EscrowResponse from(ProjectEscrow e) {
        return EscrowResponse.builder()
                .id(e.getId())
                .projectId(e.getProjectId())
                .milestoneId(e.getMilestoneId())
                .amount(e.getAmount())
                .payerUserId(e.getPayerUserId())
                .payeeUserId(e.getPayeeUserId())
                .status(e.getStatus() == null ? null : e.getStatus().name())
                .paymentMethod(e.getPaymentMethod())
                .paymentMethodId(e.getPaymentMethodId())
                .paymentTxId(e.getPaymentTxId())
                .depositedAt(e.getDepositedAt())
                .releasedAt(e.getReleasedAt())
                .refundedAt(e.getRefundedAt())
                .createdAt(e.getCreatedAt())
                .updatedAt(e.getUpdatedAt())
                .build();
    }
}
