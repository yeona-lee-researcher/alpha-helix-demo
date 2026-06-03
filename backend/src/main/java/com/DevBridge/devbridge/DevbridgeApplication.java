package com.DevBridge.devbridge;

import io.github.cdimascio.dotenv.Dotenv;
import io.github.cdimascio.dotenv.DotenvEntry;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.io.File;
import java.io.InputStream;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;

@SpringBootApplication
@EnableJpaAuditing
@EnableScheduling
@EnableAsync
public class DevbridgeApplication {
	public static void main(String[] args) {
		// === .env 로딩 ===
		// cwd 에 의존하지 않도록 절대경로 후보를 직접 탐색하고, 결과를 로그로 남긴다.
		// 후보 우선순위: backend/.env → 프로젝트 루트(.env) → cwd 기준 fallback
		Map<String, String> envProps = loadDotenv();

		// .env 값을 JVM system property 로 강제 등록 (이미 있어도 덮어씀).
		// → OS 환경변수에 박힌 만료/잘못된 키가 application-{profile}.properties 의
		//   ${ENV:} placeholder 를 통해 새어 들어오는 사고를 차단한다.
		envProps.forEach((k, v) -> {
			if (v != null) {
				System.setProperty(k, v);
			}
		});

		// .env 의 *_API_KEY 등 표준 키를 Spring property 명으로도 직접 등록.
		// → application-{profile}.properties 의 ${GEMINI_API_KEY:} placeholder 해석 단계를
		//   아예 건너뛰고 spring property 가 .env 값으로 고정되게 한다.
		Map<String, String> envToSpring = new HashMap<>();
		envToSpring.put("GEMINI_API_KEY", "gemini.api.key");
		envToSpring.put("OPENAI_API_KEY", "openai.api.key");
		envToSpring.put("ANTHROPIC_API_KEY", "anthropic.api.key");
		envToSpring.put("PERPLEXITY_API_KEY", "perplexity.api.key");
		envToSpring.put("STREAM_CHAT_API_KEY", "stream.chat.api-key");
		envToSpring.put("STREAM_CHAT_API_SECRET", "stream.chat.api-secret");
		envToSpring.put("MAIL_USERNAME", "spring.mail.username");
		envToSpring.put("MAIL_PASSWORD", "spring.mail.password");
		envToSpring.forEach((envKey, springKey) -> {
			String v = envProps.get(envKey);
			if (v != null && !v.isBlank()) {
				System.setProperty(springKey, v);
			}
		});

		// application-local.properties 의 정적 값(즉, ${ENV:} 형태가 아닌 값)을 JVM system property 로 등록.
		// Spring property 우선순위: System property(#8) > OS env(#9) > application-{profile}.properties(#11).
		// → application-local 자체에 박힌 값은 OS env 덮어쓰기와 무관하게 우선되어야 한다.
		try (InputStream in = DevbridgeApplication.class.getResourceAsStream("/application-local.properties")) {
			if (in != null) {
				Properties localProps = new Properties();
				localProps.load(in);
				localProps.forEach((k, v) -> {
					String key = String.valueOf(k);
					String val = String.valueOf(v);
					if (!val.isBlank() && !val.startsWith("${") && System.getProperty(key) == null) {
						System.setProperty(key, val);
					}
				});
			}
		} catch (Exception ignored) { /* 로컬 파일 없으면 skip */ }

		SpringApplication app = new SpringApplication(DevbridgeApplication.class);
		Map<String, Object> defaults = new HashMap<>();
		envProps.forEach(defaults::put);
		app.setDefaultProperties(defaults);
		app.run(args);
	}

	/**
	 * .env 로딩 전용 헬퍼.
	 * - 명시적 후보 디렉토리 순서로 탐색 (cwd 비의존)
	 * - 모든 라인의 trailing CR(\r) 제거 (Windows CRLF 사고 방지)
	 * - 어떤 파일을 읽었는지 / 몇 개 키를 읽었는지 stdout 에 출력 (Spring 기동 전이라 logger 사용 X)
	 */
	private static Map<String, String> loadDotenv() {
		Map<String, String> result = new LinkedHashMap<>();
		String[] candidateDirs = new String[] {
				// 1) backend 모듈 디렉토리 (가장 일반적인 케이스)
				new File("").getAbsoluteFile().getPath(),
				// 2) 프로젝트 루트 (cwd 가 repo root 인 경우)
				new File("..").getAbsoluteFile().getPath(),
				// 3) backend 하위에서 띄웠을 때 모듈 디렉토리 명시
				new File("backend").getAbsoluteFile().getPath(),
		};

		String loadedFrom = null;
		for (String dir : candidateDirs) {
			File f = new File(dir, ".env");
			if (!f.isFile()) continue;
			try {
				Dotenv dot = Dotenv.configure().directory(dir).ignoreIfMissing().load();
				for (DotenvEntry e : dot.entries()) {
					// dotenv-java 일부 버전에서 trailing CR 이 값에 포함되는 사고 방지
					String v = e.getValue() == null ? null : e.getValue().replace("\r", "").trim();
					if (e.getKey() != null && !e.getKey().isBlank()) {
						result.put(e.getKey().trim(), v);
					}
				}
				loadedFrom = f.getCanonicalPath();
				break; // 첫 번째 발견 파일에서 로드 종료
			} catch (Exception ex) {
				System.err.println("[.env] 로드 실패: " + f.getPath() + " - " + ex.getMessage());
			}
		}

		if (loadedFrom != null) {
			System.out.println("[.env] loaded " + result.size() + " keys from " + loadedFrom);
		} else {
			System.err.println("[.env] NOT FOUND. OS 환경변수에만 의존합니다 - cwd=" +
					new File("").getAbsoluteFile().getPath());
		}
		return result;
	}
}