package com.DevBridge.devbridge.domain.project.controller;

import com.DevBridge.devbridge.domain.project.entity.ProjectFieldMaster;
import com.DevBridge.devbridge.domain.project.entity.SkillMaster;
import com.DevBridge.devbridge.domain.project.repository.ProjectFieldMasterRepository;
import com.DevBridge.devbridge.domain.project.repository.SkillMasterRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Master 데이터(드롭다운 등 공통 코드) 조회용 컨트롤러.
 * - GET /api/master/skills           : 전체 스킬 목록
 * - GET /api/master/project-fields   : 프로젝트 분야 목록
 */
@RestController
@RequestMapping("/api/master")
@RequiredArgsConstructor
public class MasterController {

    private final SkillMasterRepository skillMasterRepository;
    private final ProjectFieldMasterRepository projectFieldMasterRepository;

    @GetMapping("/skills")
    public List<SkillMaster> listSkills() {
        return skillMasterRepository.findAll();
    }

    @GetMapping("/project-fields")
    public List<ProjectFieldMaster> listProjectFields(
            @RequestParam(name = "category", required = false) String category) {
        if (category == null || category.isBlank()) {
            return projectFieldMasterRepository.findAll();
        }
        return projectFieldMasterRepository.findByParentCategory(category);
    }
}

