package com.DevBridge.devbridge.domain.ai.repository;

import com.DevBridge.devbridge.domain.ai.entity.AiModelCatalog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AiModelCatalogRepository extends JpaRepository<AiModelCatalog, String> {
    List<AiModelCatalog> findByEnabledTrueOrderBySortOrderAsc();
}
