#!/usr/bin/env python3
"""
DevBridge 백엔드: 레이어드 → 도메인 기반 패키지 구조 마이그레이션 스크립트
실행: python migrate_to_domain.py [--dry-run]
  --dry-run : 실제로 파일을 이동하지 않고 결과만 출력
"""

import os
import re
import shutil
import sys
from pathlib import Path

BASE = Path(r"c:\Team2_AlphaHelix\backend\src\main\java\com\DevBridge\devbridge")
B = "com.DevBridge.devbridge"

DRY_RUN = "--dry-run" in sys.argv

# ──────────────────────────────────────────────────────────────────────────────
# FILE_MAP: 옛 상대경로 → (새 서브디렉터리, 새 패키지)
# ──────────────────────────────────────────────────────────────────────────────
FILE_MAP = {
    # ── global/config ──
    "config/StreamChatConfig.java":     ("global/config", f"{B}.global.config"),
    "config/WebConfig.java":            ("global/config", f"{B}.global.config"),
    "config/AiRateLimitFilter.java":    ("global/config", f"{B}.global.config"),
    # ── global/seed ──
    "config/DataSeeder.java":           ("global/seed", f"{B}.global.seed"),
    "config/AiModelCatalogSeeder.java": ("global/seed", f"{B}.global.seed"),
    "service/DataCleanupService.java":  ("global/seed", f"{B}.global.seed"),
    # ── global/security ──
    "security/AuthContext.java":             ("global/security", f"{B}.global.security"),
    "security/JwtAuthenticationFilter.java": ("global/security", f"{B}.global.security"),
    "security/JwtUtil.java":                 ("global/security", f"{B}.global.security"),
    # ── global/util ──
    "util/EnumMapper.java": ("global/util", f"{B}.global.util"),

    # ══════════════════════════════════════════════════════════
    # ENTITIES
    # ══════════════════════════════════════════════════════════
    # user
    "entity/User.java":              ("domain/user/entity", f"{B}.domain.user.entity"),
    "entity/UserProfileDetail.java": ("domain/user/entity", f"{B}.domain.user.entity"),
    "entity/UserSkillDetail.java":   ("domain/user/entity", f"{B}.domain.user.entity"),
    "entity/UserCareer.java":        ("domain/user/entity", f"{B}.domain.user.entity"),
    "entity/UserEducation.java":     ("domain/user/entity", f"{B}.domain.user.entity"),
    "entity/UserCertification.java": ("domain/user/entity", f"{B}.domain.user.entity"),
    "entity/UserAward.java":         ("domain/user/entity", f"{B}.domain.user.entity"),
    # interest
    "entity/UserInterestPartner.java": ("domain/interest/entity", f"{B}.domain.interest.entity"),
    "entity/UserInterestProject.java": ("domain/interest/entity", f"{B}.domain.interest.entity"),
    # partner
    "entity/PartnerProfile.java":      ("domain/partner/entity", f"{B}.domain.partner.entity"),
    "entity/PartnerProfileStats.java": ("domain/partner/entity", f"{B}.domain.partner.entity"),
    "entity/PartnerSkill.java":        ("domain/partner/entity", f"{B}.domain.partner.entity"),
    "entity/PartnerPortfolio.java":    ("domain/partner/entity", f"{B}.domain.partner.entity"),
    # client
    "entity/ClientProfile.java":        ("domain/client/entity", f"{B}.domain.client.entity"),
    "entity/ClientProfileStats.java":   ("domain/client/entity", f"{B}.domain.client.entity"),
    "entity/ClientPreferredSkill.java": ("domain/client/entity", f"{B}.domain.client.entity"),
    # project
    "entity/Project.java":             ("domain/project/entity", f"{B}.domain.project.entity"),
    "entity/ProjectTag.java":          ("domain/project/entity", f"{B}.domain.project.entity"),
    "entity/ProjectSkillMapping.java": ("domain/project/entity", f"{B}.domain.project.entity"),
    "entity/ProjectFieldMaster.java":  ("domain/project/entity", f"{B}.domain.project.entity"),
    "entity/SkillMaster.java":         ("domain/project/entity", f"{B}.domain.project.entity"),
    "entity/ProjectApplication.java":  ("domain/project/entity", f"{B}.domain.project.entity"),
    "entity/ProjectAttachment.java":   ("domain/project/entity", f"{B}.domain.project.entity"),
    "entity/ProjectEscrow.java":       ("domain/project/entity", f"{B}.domain.project.entity"),
    "entity/ProjectMeeting.java":      ("domain/project/entity", f"{B}.domain.project.entity"),
    "entity/ProjectMilestone.java":    ("domain/project/entity", f"{B}.domain.project.entity"),
    "entity/ProjectModule.java":       ("domain/project/entity", f"{B}.domain.project.entity"),
    # chat
    "entity/ChatRoom.java": ("domain/chat/entity", f"{B}.domain.chat.entity"),
    # review
    "entity/PartnerReview.java": ("domain/review/entity", f"{B}.domain.review.entity"),
    "entity/ClientReview.java":  ("domain/review/entity", f"{B}.domain.review.entity"),
    # notification
    "entity/Notification.java": ("domain/notification/entity", f"{B}.domain.notification.entity"),
    # payment
    "entity/PaymentMethod.java": ("domain/payment/entity", f"{B}.domain.payment.entity"),
    # strategy
    "entity/Strategy.java":                     ("domain/strategy/entity", f"{B}.domain.strategy.entity"),
    "entity/StrategyBacktestSummary.java":       ("domain/strategy/entity", f"{B}.domain.strategy.entity"),
    "entity/StrategyState.java":                 ("domain/strategy/entity", f"{B}.domain.strategy.entity"),
    "entity/StrategyTrade.java":                 ("domain/strategy/entity", f"{B}.domain.strategy.entity"),
    "entity/DailySignal.java":                   ("domain/strategy/entity", f"{B}.domain.strategy.entity"),
    "entity/MarketOhlcDaily.java":               ("domain/strategy/entity", f"{B}.domain.strategy.entity"),
    "entity/BrokerAccount.java":                 ("domain/strategy/entity", f"{B}.domain.strategy.entity"),
    "entity/OrderProposal.java":                 ("domain/strategy/entity", f"{B}.domain.strategy.entity"),
    "entity/Subscription.java":                  ("domain/strategy/entity", f"{B}.domain.strategy.entity"),
    "entity/InfiniteBuyingSubscription.java":    ("domain/strategy/entity", f"{B}.domain.strategy.entity"),
    # ai
    "entity/AiModelCatalog.java":   ("domain/ai/entity", f"{B}.domain.ai.entity"),
    "entity/AiUsageLog.java":       ("domain/ai/entity", f"{B}.domain.ai.entity"),
    "entity/AlphaChatMessage.java": ("domain/ai/entity", f"{B}.domain.ai.entity"),
    "entity/AlphaDecisionLog.java": ("domain/ai/entity", f"{B}.domain.ai.entity"),
    "entity/AlphaWorkspace.java":   ("domain/ai/entity", f"{B}.domain.ai.entity"),

    # ══════════════════════════════════════════════════════════
    # REPOSITORIES
    # ══════════════════════════════════════════════════════════
    # user
    "repository/UserRepository.java":              ("domain/user/repository", f"{B}.domain.user.repository"),
    "repository/UserProfileDetailRepository.java": ("domain/user/repository", f"{B}.domain.user.repository"),
    "repository/UserSkillDetailRepository.java":   ("domain/user/repository", f"{B}.domain.user.repository"),
    "repository/UserCareerRepository.java":        ("domain/user/repository", f"{B}.domain.user.repository"),
    "repository/UserEducationRepository.java":     ("domain/user/repository", f"{B}.domain.user.repository"),
    "repository/UserCertificationRepository.java": ("domain/user/repository", f"{B}.domain.user.repository"),
    "repository/UserAwardRepository.java":         ("domain/user/repository", f"{B}.domain.user.repository"),
    # interest
    "repository/UserInterestPartnerRepository.java": ("domain/interest/repository", f"{B}.domain.interest.repository"),
    "repository/UserInterestProjectRepository.java": ("domain/interest/repository", f"{B}.domain.interest.repository"),
    # partner
    "repository/PartnerProfileRepository.java":      ("domain/partner/repository", f"{B}.domain.partner.repository"),
    "repository/PartnerProfileStatsRepository.java": ("domain/partner/repository", f"{B}.domain.partner.repository"),
    "repository/PartnerSkillRepository.java":        ("domain/partner/repository", f"{B}.domain.partner.repository"),
    "repository/PartnerPortfolioRepository.java":    ("domain/partner/repository", f"{B}.domain.partner.repository"),
    # client
    "repository/ClientProfileRepository.java":        ("domain/client/repository", f"{B}.domain.client.repository"),
    "repository/ClientProfileStatsRepository.java":   ("domain/client/repository", f"{B}.domain.client.repository"),
    "repository/ClientPreferredSkillRepository.java": ("domain/client/repository", f"{B}.domain.client.repository"),
    # project
    "repository/ProjectRepository.java":             ("domain/project/repository", f"{B}.domain.project.repository"),
    "repository/ProjectTagRepository.java":          ("domain/project/repository", f"{B}.domain.project.repository"),
    "repository/ProjectSkillMappingRepository.java": ("domain/project/repository", f"{B}.domain.project.repository"),
    "repository/ProjectFieldMasterRepository.java":  ("domain/project/repository", f"{B}.domain.project.repository"),
    "repository/SkillMasterRepository.java":         ("domain/project/repository", f"{B}.domain.project.repository"),
    "repository/ProjectApplicationRepository.java":  ("domain/project/repository", f"{B}.domain.project.repository"),
    "repository/ProjectAttachmentRepository.java":   ("domain/project/repository", f"{B}.domain.project.repository"),
    "repository/ProjectEscrowRepository.java":       ("domain/project/repository", f"{B}.domain.project.repository"),
    "repository/ProjectMeetingRepository.java":      ("domain/project/repository", f"{B}.domain.project.repository"),
    "repository/ProjectMilestoneRepository.java":    ("domain/project/repository", f"{B}.domain.project.repository"),
    "repository/ProjectModuleRepository.java":       ("domain/project/repository", f"{B}.domain.project.repository"),
    # chat
    "repository/ChatRoomRepository.java": ("domain/chat/repository", f"{B}.domain.chat.repository"),
    # review
    "repository/PartnerReviewRepository.java": ("domain/review/repository", f"{B}.domain.review.repository"),
    "repository/ClientReviewRepository.java":  ("domain/review/repository", f"{B}.domain.review.repository"),
    # notification
    "repository/NotificationRepository.java": ("domain/notification/repository", f"{B}.domain.notification.repository"),
    # payment
    "repository/PaymentMethodRepository.java": ("domain/payment/repository", f"{B}.domain.payment.repository"),
    # strategy
    "repository/StrategyRepository.java":                    ("domain/strategy/repository", f"{B}.domain.strategy.repository"),
    "repository/StrategyBacktestSummaryRepository.java":     ("domain/strategy/repository", f"{B}.domain.strategy.repository"),
    "repository/StrategyStateRepository.java":               ("domain/strategy/repository", f"{B}.domain.strategy.repository"),
    "repository/StrategyTradeRepository.java":               ("domain/strategy/repository", f"{B}.domain.strategy.repository"),
    "repository/DailySignalRepository.java":                 ("domain/strategy/repository", f"{B}.domain.strategy.repository"),
    "repository/MarketOhlcDailyRepository.java":             ("domain/strategy/repository", f"{B}.domain.strategy.repository"),
    "repository/BrokerAccountRepository.java":               ("domain/strategy/repository", f"{B}.domain.strategy.repository"),
    "repository/OrderProposalRepository.java":               ("domain/strategy/repository", f"{B}.domain.strategy.repository"),
    "repository/SubscriptionRepository.java":                ("domain/strategy/repository", f"{B}.domain.strategy.repository"),
    "repository/InfiniteBuyingSubscriptionRepository.java":  ("domain/strategy/repository", f"{B}.domain.strategy.repository"),
    # ai
    "repository/AiModelCatalogRepository.java":   ("domain/ai/repository", f"{B}.domain.ai.repository"),
    "repository/AiUsageLogRepository.java":       ("domain/ai/repository", f"{B}.domain.ai.repository"),
    "repository/AlphaChatMessageRepository.java": ("domain/ai/repository", f"{B}.domain.ai.repository"),
    "repository/AlphaDecisionLogRepository.java": ("domain/ai/repository", f"{B}.domain.ai.repository"),
    "repository/AlphaWorkspaceRepository.java":   ("domain/ai/repository", f"{B}.domain.ai.repository"),

    # ══════════════════════════════════════════════════════════
    # SERVICES
    # ══════════════════════════════════════════════════════════
    # user
    "service/AuthService.java":              ("domain/user/service", f"{B}.domain.user.service"),
    "service/ProfileService.java":           ("domain/user/service", f"{B}.domain.user.service"),
    "service/EmailVerificationService.java": ("domain/user/service", f"{B}.domain.user.service"),
    "service/BankVerificationService.java":  ("domain/user/service", f"{B}.domain.user.service"),
    # partner
    "service/PartnerService.java":  ("domain/partner/service", f"{B}.domain.partner.service"),
    "service/PortfolioService.java": ("domain/partner/service", f"{B}.domain.partner.service"),
    # client
    "service/ClientService.java": ("domain/client/service", f"{B}.domain.client.service"),
    # project
    "service/ProjectService.java":            ("domain/project/service", f"{B}.domain.project.service"),
    "service/ProjectApplicationService.java": ("domain/project/service", f"{B}.domain.project.service"),
    "service/ProjectModuleService.java":      ("domain/project/service", f"{B}.domain.project.service"),
    "service/ContractModuleSeeder.java":      ("domain/project/service", f"{B}.domain.project.service"),
    "service/ProgressDashboardService.java":  ("domain/project/service", f"{B}.domain.project.service"),
    "service/MilestoneSeedingService.java":   ("domain/project/service", f"{B}.domain.project.service"),
    # chat
    "service/StreamChatService.java": ("domain/chat/service", f"{B}.domain.chat.service"),
    # review
    "service/PartnerReviewService.java": ("domain/review/service", f"{B}.domain.review.service"),
    "service/ClientReviewService.java":  ("domain/review/service", f"{B}.domain.review.service"),
    "service/EvaluationService.java":    ("domain/review/service", f"{B}.domain.review.service"),
    # match
    "service/MatchService.java": ("domain/match/service", f"{B}.domain.match.service"),
    # notification
    "service/EmailAlertService.java": ("domain/notification/service", f"{B}.domain.notification.service"),
    # payment
    "service/PaymentMethodService.java": ("domain/payment/service", f"{B}.domain.payment.service"),
    "service/TossPaymentsService.java":  ("domain/payment/service", f"{B}.domain.payment.service"),
    "service/CryptoService.java":        ("domain/payment/service", f"{B}.domain.payment.service"),
    # strategy
    "service/BacktestService.java":      ("domain/strategy/service", f"{B}.domain.strategy.service"),
    "service/MarketDataService.java":    ("domain/strategy/service", f"{B}.domain.strategy.service"),
    "service/DailySignalGenerator.java": ("domain/strategy/service", f"{B}.domain.strategy.service"),
    "service/AnalyticsClient.java":      ("domain/strategy/service", f"{B}.domain.strategy.service"),
    "service/broker/KisApiClient.java":          ("domain/strategy/service/broker", f"{B}.domain.strategy.service.broker"),
    "service/broker/PromotionGateService.java":  ("domain/strategy/service/broker", f"{B}.domain.strategy.service.broker"),
    "service/broker/BinanceApiClient.java":      ("domain/strategy/service/broker", f"{B}.domain.strategy.service.broker"),
    "service/broker/InfiniteBuyingJob.java":     ("domain/strategy/service/broker", f"{B}.domain.strategy.service.broker"),
    "service/broker/OrderProposalExpiryJob.java":("domain/strategy/service/broker", f"{B}.domain.strategy.service.broker"),
    # ai
    "service/AlphaHelixService.java":           ("domain/ai/service",          f"{B}.domain.ai.service"),
    "service/GeminiService.java":               ("domain/ai/service",          f"{B}.domain.ai.service"),
    "service/ai/AiGatewayService.java":         ("domain/ai/service/gateway",  f"{B}.domain.ai.service.gateway"),
    "service/ai/AiProvider.java":               ("domain/ai/service/gateway",  f"{B}.domain.ai.service.gateway"),
    "service/ai/AnthropicProvider.java":        ("domain/ai/service/gateway",  f"{B}.domain.ai.service.gateway"),
    "service/ai/GeminiProvider.java":           ("domain/ai/service/gateway",  f"{B}.domain.ai.service.gateway"),
    "service/ai/OpenAiProvider.java":           ("domain/ai/service/gateway",  f"{B}.domain.ai.service.gateway"),
    "service/ai/PerplexityProvider.java":       ("domain/ai/service/gateway",  f"{B}.domain.ai.service.gateway"),
    "service/ai/SubscriptionService.java":      ("domain/ai/service/gateway",  f"{B}.domain.ai.service.gateway"),
    "service/llm/LlmProvider.java":             ("domain/ai/service/llm",      f"{B}.domain.ai.service.llm"),
    "service/llm/LlmRouter.java":               ("domain/ai/service/llm",      f"{B}.domain.ai.service.llm"),
    "service/llm/AnthropicProvider.java":       ("domain/ai/service/llm",      f"{B}.domain.ai.service.llm"),
    "service/llm/GeminiLlmProvider.java":       ("domain/ai/service/llm",      f"{B}.domain.ai.service.llm"),
    "service/llm/OpenAiProvider.java":          ("domain/ai/service/llm",      f"{B}.domain.ai.service.llm"),
    "service/llm/PerplexityProvider.java":      ("domain/ai/service/llm",      f"{B}.domain.ai.service.llm"),

    # ══════════════════════════════════════════════════════════
    # CONTROLLERS
    # ══════════════════════════════════════════════════════════
    # user
    "controller/AuthController.java":              ("domain/user/controller", f"{B}.domain.user.controller"),
    "controller/UserController.java":              ("domain/user/controller", f"{B}.domain.user.controller"),
    "controller/ProfileController.java":           ("domain/user/controller", f"{B}.domain.user.controller"),
    "controller/EmailVerificationController.java": ("domain/user/controller", f"{B}.domain.user.controller"),
    "controller/BankVerificationController.java":  ("domain/user/controller", f"{B}.domain.user.controller"),
    # partner
    "controller/PartnerController.java":   ("domain/partner/controller", f"{B}.domain.partner.controller"),
    "controller/PortfolioController.java": ("domain/partner/controller", f"{B}.domain.partner.controller"),
    # client
    "controller/ClientController.java": ("domain/client/controller", f"{B}.domain.client.controller"),
    # project
    "controller/ProjectController.java":            ("domain/project/controller", f"{B}.domain.project.controller"),
    "controller/ProjectApplicationController.java": ("domain/project/controller", f"{B}.domain.project.controller"),
    "controller/ProjectModuleController.java":      ("domain/project/controller", f"{B}.domain.project.controller"),
    "controller/ProgressDashboardController.java":  ("domain/project/controller", f"{B}.domain.project.controller"),
    "controller/MasterController.java":             ("domain/project/controller", f"{B}.domain.project.controller"),
    # chat
    "controller/ChatController.java": ("domain/chat/controller", f"{B}.domain.chat.controller"),
    # review
    "controller/PartnerReviewController.java": ("domain/review/controller", f"{B}.domain.review.controller"),
    "controller/ClientReviewController.java":  ("domain/review/controller", f"{B}.domain.review.controller"),
    "controller/EvaluationController.java":    ("domain/review/controller", f"{B}.domain.review.controller"),
    # match
    "controller/MatchController.java": ("domain/match/controller", f"{B}.domain.match.controller"),
    # notification
    "controller/NotificationController.java": ("domain/notification/controller", f"{B}.domain.notification.controller"),
    # interest
    "controller/InterestController.java": ("domain/interest/controller", f"{B}.domain.interest.controller"),
    # payment
    "controller/PaymentMethodController.java": ("domain/payment/controller", f"{B}.domain.payment.controller"),
    "controller/TossWebhookController.java":   ("domain/payment/controller", f"{B}.domain.payment.controller"),
    "controller/LedgerController.java":        ("domain/payment/controller", f"{B}.domain.payment.controller"),
    # strategy
    "controller/StrategyController.java":      ("domain/strategy/controller", f"{B}.domain.strategy.controller"),
    "controller/AnalyticsController.java":     ("domain/strategy/controller", f"{B}.domain.strategy.controller"),
    "controller/BrokerAccountController.java": ("domain/strategy/controller", f"{B}.domain.strategy.controller"),
    "controller/BrokerOrderController.java":   ("domain/strategy/controller", f"{B}.domain.strategy.controller"),
    "controller/SubscriptionController.java":  ("domain/strategy/controller", f"{B}.domain.strategy.controller"),
    "controller/OrderProposalController.java": ("domain/strategy/controller", f"{B}.domain.strategy.controller"),
    "controller/InfiniteBuyingController.java":("domain/strategy/controller", f"{B}.domain.strategy.controller"),
    # ai
    "controller/AiController.java":              ("domain/ai/controller", f"{B}.domain.ai.controller"),
    "controller/LlmController.java":             ("domain/ai/controller", f"{B}.domain.ai.controller"),
    "controller/AlphaAnalyticsController.java":  ("domain/ai/controller", f"{B}.domain.ai.controller"),
    "controller/AlphaStrategyController.java":   ("domain/ai/controller", f"{B}.domain.ai.controller"),
    "controller/AlphaWorkspaceController.java":  ("domain/ai/controller", f"{B}.domain.ai.controller"),

    # ══════════════════════════════════════════════════════════
    # DTOs
    # ══════════════════════════════════════════════════════════
    # ai
    "dto/AiChatRequest.java":  ("domain/ai/dto", f"{B}.domain.ai.dto"),
    "dto/AiChatResponse.java": ("domain/ai/dto", f"{B}.domain.ai.dto"),
    # project
    "dto/AttachmentCreateRequest.java":         ("domain/project/dto", f"{B}.domain.project.dto"),
    "dto/AttachmentResponse.java":              ("domain/project/dto", f"{B}.domain.project.dto"),
    "dto/EscrowPayMockRequest.java":            ("domain/project/dto", f"{B}.domain.project.dto"),
    "dto/EscrowResponse.java":                  ("domain/project/dto", f"{B}.domain.project.dto"),
    "dto/MeetingResponse.java":                 ("domain/project/dto", f"{B}.domain.project.dto"),
    "dto/MeetingUpsertRequest.java":            ("domain/project/dto", f"{B}.domain.project.dto"),
    "dto/MilestoneCreateRequest.java":          ("domain/project/dto", f"{B}.domain.project.dto"),
    "dto/MilestoneResponse.java":               ("domain/project/dto", f"{B}.domain.project.dto"),
    "dto/MilestoneSubmitRequest.java":          ("domain/project/dto", f"{B}.domain.project.dto"),
    "dto/ProjectApplicationCreateRequest.java": ("domain/project/dto", f"{B}.domain.project.dto"),
    "dto/ProjectApplicationResponse.java":      ("domain/project/dto", f"{B}.domain.project.dto"),
    "dto/ProjectCreateRequest.java":            ("domain/project/dto", f"{B}.domain.project.dto"),
    "dto/ProjectModuleResponse.java":           ("domain/project/dto", f"{B}.domain.project.dto"),
    "dto/ProjectModuleUpsertRequest.java":      ("domain/project/dto", f"{B}.domain.project.dto"),
    "dto/ProjectSummaryResponse.java":          ("domain/project/dto", f"{B}.domain.project.dto"),
    # user
    "dto/AuthResponse.java":               ("domain/user/dto", f"{B}.domain.user.dto"),
    "dto/LoginRequest.java":               ("domain/user/dto", f"{B}.domain.user.dto"),
    "dto/SignupRequest.java":              ("domain/user/dto", f"{B}.domain.user.dto"),
    "dto/UpdateUserBasicInfoRequest.java": ("domain/user/dto", f"{B}.domain.user.dto"),
    "dto/UserProfileDetailRequest.java":   ("domain/user/dto", f"{B}.domain.user.dto"),
    "dto/UserProfileDetailResponse.java":  ("domain/user/dto", f"{B}.domain.user.dto"),
    # strategy
    "dto/BrokerAccountDto.java":           ("domain/strategy/dto", f"{B}.domain.strategy.dto"),
    "dto/BrokerAccountUpsertReq.java":     ("domain/strategy/dto", f"{B}.domain.strategy.dto"),
    "dto/DailySignalDto.java":             ("domain/strategy/dto", f"{B}.domain.strategy.dto"),
    "dto/StrategyBacktestSummaryDto.java": ("domain/strategy/dto", f"{B}.domain.strategy.dto"),
    "dto/StrategyDto.java":                ("domain/strategy/dto", f"{B}.domain.strategy.dto"),
    "dto/StrategyUpsertReq.java":          ("domain/strategy/dto", f"{B}.domain.strategy.dto"),
    # chat
    "dto/ChatRoomResponse.java":             ("domain/chat/dto", f"{B}.domain.chat.dto"),
    "dto/ChatTokenResponse.java":            ("domain/chat/dto", f"{B}.domain.chat.dto"),
    "dto/CreateDmRoomRequest.java":          ("domain/chat/dto", f"{B}.domain.chat.dto"),
    "dto/CreateNegotiationRoomRequest.java": ("domain/chat/dto", f"{B}.domain.chat.dto"),
    # review
    "dto/ClientReviewCreateRequest.java":  ("domain/review/dto", f"{B}.domain.review.dto"),
    "dto/EvaluationItemDto.java":          ("domain/review/dto", f"{B}.domain.review.dto"),
    "dto/PartnerReviewCreateRequest.java": ("domain/review/dto", f"{B}.domain.review.dto"),
    "dto/PartnerReviewResponse.java":      ("domain/review/dto", f"{B}.domain.review.dto"),
    # client
    "dto/ClientSummaryResponse.java": ("domain/client/dto", f"{B}.domain.client.dto"),
    # match
    "dto/MatchRequest.java": ("domain/match/dto", f"{B}.domain.match.dto"),
    "dto/MatchScore.java":   ("domain/match/dto", f"{B}.domain.match.dto"),
    # notification
    "dto/NotificationResponse.java": ("domain/notification/dto", f"{B}.domain.notification.dto"),
    # partner
    "dto/PartnerSummaryResponse.java": ("domain/partner/dto", f"{B}.domain.partner.dto"),
    "dto/PortfolioItemRequest.java":   ("domain/partner/dto", f"{B}.domain.partner.dto"),
    "dto/PortfolioItemResponse.java":  ("domain/partner/dto", f"{B}.domain.partner.dto"),
    # payment
    "dto/PaymentMethodCreateRequest.java": ("domain/payment/dto", f"{B}.domain.payment.dto"),
    "dto/PaymentMethodResponse.java":      ("domain/payment/dto", f"{B}.domain.payment.dto"),
}

# ──────────────────────────────────────────────────────────────────────────────
# 와일드카드 import 치환
# ──────────────────────────────────────────────────────────────────────────────
DOMAINS = ["user", "interest", "partner", "client", "project", "chat",
           "review", "notification", "payment", "strategy", "ai", "match"]

def domain_wildcards(layer: str) -> str:
    lines = [f"import {B}.domain.{d}.{layer}.*;" for d in DOMAINS]
    if layer == "service":
        lines.append(f"import {B}.global.seed.*;")
    return "\n".join(lines)

WILDCARD_EXPANSIONS = {
    f"import {B}.entity.*;":     domain_wildcards("entity"),
    f"import {B}.repository.*;": domain_wildcards("repository"),
    f"import {B}.service.*;":    domain_wildcards("service"),
    f"import {B}.dto.*;":        domain_wildcards("dto"),
    f"import {B}.controller.*;": domain_wildcards("controller"),
}

# ──────────────────────────────────────────────────────────────────────────────
# FQN 치환 맵 자동 생성
# ──────────────────────────────────────────────────────────────────────────────
def build_fqn_map() -> dict:
    fqn_map = {}
    for old_rel, (new_dir, new_pkg) in FILE_MAP.items():
        class_name = Path(old_rel).stem
        parent_parts = Path(old_rel).parent.parts
        if parent_parts:
            old_pkg = B + "." + ".".join(parent_parts)
        else:
            old_pkg = B
        old_fqn = f"{old_pkg}.{class_name}"
        new_fqn = f"{new_pkg}.{class_name}"
        if old_fqn != new_fqn:
            fqn_map[old_fqn] = new_fqn
    return fqn_map

# ──────────────────────────────────────────────────────────────────────────────
# 파일 내용 변환
# ──────────────────────────────────────────────────────────────────────────────
def process_content(content: str, new_package: str, fqn_map: dict) -> str:
    # 1. package 선언 교체
    content = re.sub(
        r'^package\s+com\.DevBridge\.devbridge[^;]*;',
        f"package {new_package};",
        content,
        count=1,
        flags=re.MULTILINE,
    )

    # 2. 와일드카드 import 교체
    for old_wc, new_wc in WILDCARD_EXPANSIONS.items():
        content = content.replace(old_wc, new_wc)

    # 3. FQN 치환 (긴 것부터 처리해 짧은 패턴이 잘못 매칭되는 것 방지)
    for old_fqn in sorted(fqn_map.keys(), key=len, reverse=True):
        if old_fqn in content:
            content = content.replace(old_fqn, fqn_map[old_fqn])

    return content

# ──────────────────────────────────────────────────────────────────────────────
# 메인
# ──────────────────────────────────────────────────────────────────────────────
def main():
    fqn_map = build_fqn_map()
    migrated, skipped = 0, 0

    print(f"{'[DRY-RUN] ' if DRY_RUN else ''}마이그레이션 시작 - BASE: {BASE}\n")

    for old_rel, (new_dir, new_pkg) in FILE_MAP.items():
        src = BASE / old_rel
        if not src.exists():
            print(f"  SKIP (없음): {old_rel}")
            skipped += 1
            continue

        content = src.read_text(encoding="utf-8")
        new_content = process_content(content, new_pkg, fqn_map)

        dst_dir = BASE / new_dir
        dst = dst_dir / Path(old_rel).name

        print(f"  {'(dry) ' if DRY_RUN else ''}이동: {old_rel}  →  {new_dir}/{Path(old_rel).name}")

        if not DRY_RUN:
            dst_dir.mkdir(parents=True, exist_ok=True)
            dst.write_text(new_content, encoding="utf-8")
            src.unlink()

        migrated += 1

    if not DRY_RUN:
        # 빈 구 디렉터리 삭제
        for old_top in ["config", "controller", "dto", "entity",
                        "repository", "security", "service", "util"]:
            old_path = BASE / old_top
            if old_path.exists():
                try:
                    shutil.rmtree(old_path)
                    print(f"\n  삭제: {old_top}/")
                except Exception as e:
                    print(f"\n  삭제 실패 {old_top}/: {e}")

    print(f"\n{'[DRY-RUN] ' if DRY_RUN else ''}완료!  이동: {migrated}개,  스킵: {skipped}개")

if __name__ == "__main__":
    main()
