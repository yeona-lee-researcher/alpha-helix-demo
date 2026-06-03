package com.DevBridge.devbridge.domain.project.dto;

import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProjectModuleUpsertRequest {
    /** 미확정 / 논의 중 / 제안됨 / 협의완료 */
    private String status;
    /** raw JSON string (모듈별 contents) */
    private String data;
}
