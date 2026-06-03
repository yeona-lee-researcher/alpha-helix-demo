package com.DevBridge.devbridge.domain.notification.service;

import com.DevBridge.devbridge.domain.strategy.entity.DailySignal;
import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.strategy.repository.DailySignalRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

/**
 * 사용자별로 미발송 시그널들을 묶어서 한 통의 이메일로 보냄.
 * 비동기로 처리해서 스케줄러를 막지 않음.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EmailAlertService {

    private final JavaMailSender mailSender;
    private final DailySignalRepository signalRepo;

    @Value("${spring.mail.username:}")
    private String fromAddress;

    @Async
    @Transactional
    public void sendDigest(User user, List<DailySignal> signals) {
        if (user == null || signals == null || signals.isEmpty()) return;
        String to = user.getEmail();
        if (to == null || to.isBlank()) {
            log.warn("[Email] user {} has no email — skip", user.getId());
            return;
        }
        if (fromAddress == null || fromAddress.isBlank()) {
            log.warn("[Email] spring.mail.username not set — skip send for {}", to);
            return;
        }

        String subject = "[Alpha-Helix] " + signals.get(0).getAsOfDate() + " 오늘의 매매 신호 ("
                + signals.size() + "건)";
        String body = buildBody(user, signals);

        try {
            SimpleMailMessage msg = new SimpleMailMessage();
            msg.setFrom(fromAddress);
            msg.setTo(to);
            msg.setSubject(subject);
            msg.setText(body);
            mailSender.send(msg);

            LocalDateTime now = LocalDateTime.now();
            signals.forEach(s -> s.setDeliveredAt(now));
            signalRepo.saveAll(signals);
            log.info("[Email] sent digest to {} ({} signals)", to, signals.size());
        } catch (Exception e) {
            log.error("[Email] send failed to {}: {}", to, e.getMessage());
        }
    }

    private String buildBody(User user, List<DailySignal> signals) {
        StringBuilder sb = new StringBuilder();
        sb.append("안녕하세요 ").append(user.getUsername()).append("님,\n\n");
        sb.append("오늘의 Alpha-Helix 매매 시그널입니다.\n");
        sb.append("─────────────────────────────────────\n\n");
        for (var s : signals) {
            sb.append("[").append(s.getSignal()).append("] ").append(s.getStrategy().getCode())
                    .append(" — ").append(s.getStrategy().getTicker()).append("\n");
            sb.append("· 제목: ").append(safe(s.getTitle())).append("\n");
            sb.append("· 분석: ").append(safe(s.getSummary())).append("\n");
            sb.append("· 액션: ").append(safe(s.getAction())).append("\n\n");
        }
        sb.append("─────────────────────────────────────\n");
        sb.append("※ 본 메일은 자동 발송된 분석 정보이며 투자 권유가 아닙니다.\n");
        sb.append("Alpha-Helix · DevBridge\n");
        return sb.toString();
    }

    private String safe(String v) { return v == null ? "" : v; }

    /** 미발송 시그널을 user별로 묶어서 일괄 발송. */
    @Transactional
    public int dispatchPending(java.time.LocalDate asOfDate) {
        var pending = signalRepo.findByAsOfDateAndDeliveredAtIsNull(asOfDate);
        if (pending.isEmpty()) return 0;
        var byUser = pending.stream().collect(Collectors.groupingBy(s -> s.getStrategy().getUser()));
        byUser.forEach(this::sendDigest);
        return pending.size();
    }
}
