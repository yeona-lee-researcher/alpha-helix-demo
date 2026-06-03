package com.DevBridge.devbridge.domain.user.service;

import com.DevBridge.devbridge.domain.user.entity.User;
import com.DevBridge.devbridge.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@RequiredArgsConstructor
public class BankVerificationService {

    private final UserRepository userRepository;
    private final JavaMailSender mailSender;
    private final SecureRandom random = new SecureRandom();

    @Value("${spring.mail.username:}")
    private String fromAddress;

    @Value("${app.bank.code-ttl-minutes:5}")
    private int ttlMinutes;

    @Value("${app.bank.max-attempts:5}")
    private int maxAttempts;

    private static final class CodeEntry {
        final String code;
        final long expiresAt;
        int attempts;
        CodeEntry(String code, long expiresAt) {
            this.code = code;
            this.expiresAt = expiresAt;
            this.attempts = 0;
        }
    }

    private final Map<Long, CodeEntry> codeStore = new ConcurrentHashMap<>();

    public String sendCode(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다."));
        String code = String.format("%03d", random.nextInt(1000));
        long expiresAt = Instant.now().getEpochSecond() + ttlMinutes * 60L;
        codeStore.put(userId, new CodeEntry(code, expiresAt));

        String to = (user.getContactEmail() != null && !user.getContactEmail().isBlank())
                ? user.getContactEmail() : user.getEmail();

        if (to != null && !to.isBlank() && fromAddress != null && !fromAddress.isBlank()) {
            try {
                SimpleMailMessage msg = new SimpleMailMessage();
                msg.setFrom(fromAddress);
                msg.setTo(to);
                msg.setSubject("[DevBridge] 계좌 인증 입금자명 코드");
                msg.setText(
                    "안녕하세요, " + (user.getUsername() != null ? user.getUsername() : "DevBridge 사용자") + "님.\n\n" +
                    "계좌 인증을 위해 입금자명에 표시될 3자리 코드를 알려드립니다.\n\n" +
                    "    코드: " + code + "\n\n" +
                    "이 코드는 " + ttlMinutes + "분 동안 유효하며, 최대 " + maxAttempts + "회까지 시도 가능합니다.\n" +
                    "DevBridge에서 계좌 등록 화면으로 돌아가 위 코드를 입력해 주세요.\n" +
                    "본 메일은 시연/목업 환경에서 발송된 메일입니다."
                );
                mailSender.send(msg);
                log.info("[BankVerification] 코드 메일 발송 성공: to={}", to);
            } catch (Exception e) {
                log.warn("[BankVerification] 코드 메일 발송 실패 ({}): {}", to, e.getMessage());
            }
        } else {
            log.warn("[BankVerification] 메일 발송 스킵 — to={}, from={}", to, fromAddress);
        }
        return code;
    }

    @Transactional
    public void verifyAndSave(Long userId, String code,
                              String bankName, String accountNumber, String accountHolder) {
        // compute() 로 락 안에서 검증·시도 카운트·만료/일치 처리 → 동일 user 동시요청 레이스 차단
        boolean[] matched = { false };
        codeStore.compute(userId, (k, entry) -> {
            if (entry == null) {
                throw new RuntimeException("인증번호를 먼저 요청해 주세요.");
            }
            if (Instant.now().getEpochSecond() > entry.expiresAt) {
                return null; // 만료 → 폐기
            }
            entry.attempts++;
            if (entry.attempts > maxAttempts) {
                return null; // 시도 초과 → 폐기
            }
            if (entry.code.equals(code)) {
                matched[0] = true;
                return null; // 성공 → 1회용 폐기
            }
            return entry;
        });

        if (!matched[0]) {
            CodeEntry post = codeStore.get(userId);
            if (post == null) {
                throw new RuntimeException("인증번호가 만료되었거나 시도 횟수를 초과했어요. 다시 요청해 주세요.");
            }
            throw new RuntimeException("인증번호가 일치하지 않습니다. (남은 시도: "
                    + Math.max(0, maxAttempts - post.attempts) + "회)");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다."));
        user.setBankName(bankName);
        user.setBankAccountNumber(accountNumber);
        user.setBankAccountHolderName(accountHolder);
        user.setBankVerified(true);
        userRepository.save(user);
    }

    public User getAccount(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("사용자를 찾을 수 없습니다."));
    }
}
