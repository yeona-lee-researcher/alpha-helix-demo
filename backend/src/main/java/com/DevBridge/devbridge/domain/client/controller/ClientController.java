package com.DevBridge.devbridge.domain.client.controller;

import com.DevBridge.devbridge.domain.client.dto.ClientSummaryResponse;
import com.DevBridge.devbridge.domain.client.service.ClientService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/clients")
@RequiredArgsConstructor
public class ClientController {

    private final ClientService clientService;

    /**
     * 클라이언트 목록. SQL-level 페이지네이션 — limit/offset/sort 만큼만 DB 에서 조회.
     * 기본 최신순 20개. 전체 조회 시 ?limit=999.
     */
    @GetMapping
    public List<ClientSummaryResponse> list(
            @RequestParam(value = "limit",  defaultValue = "20") int limit,
            @RequestParam(value = "offset", defaultValue = "0")  int offset,
            @RequestParam(value = "sort",   defaultValue = "latest") String sort) {
        return clientService.findPage(limit, offset, sort);
    }

    @GetMapping("/{id}")
    public ResponseEntity<ClientSummaryResponse> detail(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(clientService.findById(id));
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }
}

