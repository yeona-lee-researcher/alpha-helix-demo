import api from "../api/axios";

// Workspace
export const listWorkspaces      = () => api.get("/alpha/workspaces").then(r => r.data);
export const createWorkspace     = (name) => api.post("/alpha/workspaces", { name }).then(r => r.data);
export const getWorkspace        = (id) => api.get(`/alpha/workspaces/${id}`).then(r => r.data);
export const deleteWorkspace     = (id) => api.delete(`/alpha/workspaces/${id}`);
export const updateWorkspaceName = (id, name) => api.patch(`/alpha/workspaces/${id}`, { name }).then(r => r.data);
export const updateWorkspaceStatus = (id, status) => api.patch(`/alpha/workspaces/${id}/status`, { status }).then(r => r.data);
export const updateGoalProfile   = (id, patch) => api.patch(`/alpha/workspaces/${id}/goal-profile`, patch).then(r => r.data);

/** brokerAccountId: number | null */
export const linkWorkspaceBroker = (id, brokerAccountId) =>
  api.patch(`/alpha/workspaces/${id}/broker-account`, { brokerAccountId }).then(r => r.data);

// Chat
export const fetchChat           = (id) => api.get(`/alpha/workspaces/${id}/chat`).then(r => r.data);
export const sendChat            = (id, text) => api.post(`/alpha/workspaces/${id}/chat`, { text }).then(r => r.data);

// Pipeline
export const formalize           = (id) => api.post(`/alpha/workspaces/${id}/formalize`).then(r => r.data);
export const selectStrategyCandidate = (id, candidateId) =>
  api.patch(`/alpha/workspaces/${id}/strategy-config/select`, { candidateId }).then(r => r.data);
export const runBacktest         = (id, period, customParams, start, end) => {
  const body = {};
  if (period) body.period = period;
  if (customParams && Object.keys(customParams).length > 0) body.customParams = customParams;
  if (start) body.start = start;   // 직접 지정(달력) 기간 — 시드계산기와 공유
  if (end) body.end = end;
  return api.post(`/alpha/workspaces/${id}/backtest`, body).then(r => r.data);
};
// P3: 전략 개선 제안서 — 진단 + 선택지(기존/안정형/공격형) + 각 선택지 전후 백테스트 비교
export const runImproveProposal  = (id, customParams, period) =>
  api.post(`/alpha/workspaces/${id}/improve-proposal`, { customParams: customParams || {}, period: period || "5y" }, { timeout: 150000 }).then(r => r.data);
// P4: Claude 패치(또는 임의 전후) 효과 측정 — before/after 파라미터로 각각 실측 백테스트
export const runCompareBacktest  = (id, before, after, period) =>
  api.post(`/alpha/workspaces/${id}/compare-backtest`, { before: before || {}, after: after || {}, period: period || "5y" }, { timeout: 120000 }).then(r => r.data);
export const runRegime           = (id, options) => api.post(`/alpha/workspaces/${id}/regime`, options || {}, { timeout: 120000 }).then(r => r.data);
export const runTrust            = (id, options) => api.post(`/alpha/workspaces/${id}/trust`, options || {}, { timeout: 120000 }).then(r => r.data);
export const runBriefing         = (id) => api.post(`/alpha/workspaces/${id}/briefing`).then(r => r.data);
export const runAutoPipeline     = (id) => api.post(`/alpha/workspaces/${id}/auto-run`).then(r => r.data);
export const saveCode            = (id, codeJson) =>
  api.patch(`/alpha/workspaces/${id}/code`, { codeJson }).then(r => r.data);
export const queueOrders         = (id) =>
  api.post(`/alpha/workspaces/${id}/queue-orders`).then(r => r.data);

// Developer Studio 데이터셋 — 실제 수집 현황(polygon/binance/...) + OHLCV 미리보기
export const getDataStatus  = () => api.get("/analytics/data-status").then(r => r.data);
export const getDataPreview = (symbol, tf = "1d", source, limit = 30) =>
  api.get("/analytics/data-ohlcv", { params: { symbol, tf, source, limit } }).then(r => r.data);

// QuantConnect Lean 백테스트 (vectorbt 와 병행 · Docker 필요 · 첫 실행 매우 느림).
// body: { strategyId, symbols:[..], startDate:"YYYY-MM-DD", endDate, market:"us"|"krx", paramOverrides }
// app.lean.enabled=false 면 503 (error+hint) 반환 → 호출부에서 안내.
export const leanBacktest       = (body) => api.post("/lean/backtest", body, { timeout: 600000 }).then(r => r.data);
export const leanListStrategies = () => api.get("/lean/strategies").then(r => r.data); // { strategies:[{id,name,params}] }
// 비동기 잡: start → { job_id } 즉시, status 를 since 커서로 폴링(진행 로그 + 완료 결과)
export const leanBacktestStart  = (body) => api.post("/lean/backtest/start", body).then(r => r.data);
export const leanBacktestStatus = (jobId, since = 0) =>
  api.get(`/lean/backtest/status/${jobId}`, { params: { since } }).then(r => r.data);
export const getLeanHealth      = () => api.get("/lean/health").then(r => r.data); // { enabled, docker, lean_cli, image, ready }

// Claude Code 에이전트 — 헤드리스 claude CLI 로 워크스페이스 코드 편집 → ChangeSet(PENDING) + 내레이션
export const runClaudeAgent = (wsId, request) =>
  api.post(`/alpha/workspaces/${wsId}/claude-agent`, { request }, { timeout: 240000 }).then(r => r.data);
// A2: 스트리밍 잡 — start → { jobId } 즉시, status 를 since 커서로 폴링(단계별 진행 + 완료 결과+diff)
export const runClaudeAgentStart  = (wsId, request) =>
  api.post(`/alpha/workspaces/${wsId}/claude-agent/start`, { request }).then(r => r.data);
export const runClaudeAgentStatus = (wsId, jobId, since = 0) =>
  api.get(`/alpha/workspaces/${wsId}/claude-agent/status/${jobId}`, { params: { since } }).then(r => r.data);
// 새 대화 — 워크스페이스의 Claude 멀티세션 맥락 초기화(다음 요청은 새 세션)
export const resetClaudeSession = (wsId) =>
  api.post(`/alpha/workspaces/${wsId}/claude-agent/reset`).then(r => r.data);

// BYOK(본인 Claude 키 연동) + Developer Studio 접근 게이팅
export const getDeveloperAccess = () => api.get("/user/access").then(r => r.data);          // { developer, reason, userType, requiredPlan }
export const listApiKeys        = () => api.get("/user/api-keys").then(r => r.data);         // [{ provider, hint, connected }]
export const saveApiKey         = (provider, key) => api.put(`/user/api-keys/${provider}`, { key }).then(r => r.data);
export const deleteApiKey       = (provider) => api.delete(`/user/api-keys/${provider}`).then(r => r.data);

// Decision Log
export const fetchDecisionLog    = (id) => api.get(`/alpha/workspaces/${id}/log`).then(r => r.data);

// Alpha Ezer Live Patch (ChangeSet)
export const applyPatch          = (id, title, ops) =>
  api.post(`/alpha/workspaces/${id}/changesets`, { title, ops }).then(r => r.data);
export const keepPatch           = (id, csId) =>
  api.post(`/alpha/workspaces/${id}/changesets/${csId}/keep`).then(r => r.data);
export const undoPatch           = (id, csId) =>
  api.post(`/alpha/workspaces/${id}/changesets/${csId}/undo`).then(r => r.data);
export const listChangeSets      = (id, status) =>
  api.get(`/alpha/workspaces/${id}/changesets`, status ? { params: { status } } : {}).then(r => r.data);

// LLM Multi-Provider Router (Claude / OpenAI / Perplexity / Gemini)
export const listLlmProviders    = () => api.get("/llm/providers").then(r => r.data);
export const llmChat             = ({ provider, model, system, prompt }) =>
  api.post("/llm/chat", { provider, model, system, prompt }).then(r => r.data);

// Broker (한국투자증권 KIS) — env: "MOCK" | "REAL" 필수
export const listBrokerAccounts  = () => api.get("/broker/account").then(r => r.data); // [BrokerAccountDto]
export const upsertBrokerAccount = (body) => api.post("/broker/account", body).then(r => r.data); // body.env 포함
export const deleteBrokerAccount = (env, brokerType = "KIS") => api.delete("/broker/account", { params: { env, brokerType } });
export const testBrokerAccount   = (env) => api.post("/broker/account/test", null, { params: { env } }).then(r => r.data);
export const setBrokerTrading    = (env, enabled, brokerType) => api.patch("/broker/account/trading-enabled", { enabled }, { params: { env, ...(brokerType ? { brokerType } : {}) } }).then(r => r.data);
/** 자동 체결 ON/OFF. REAL 은 MOCK 졸업 게이트(2주+20회) 통과 필요 — 미충족 시 412 + summary 반환. */
export const setBrokerAutoExecute = (env, enabled, brokerType = "KIS") => api.patch("/broker/account/auto-execute", { enabled }, { params: { env, brokerType } }).then(r => r.data);
/** 한도(maxOrderUsd / dailyOrderUsd) 만 부분 수정. body 예: { maxOrderUsd: 200000 }.
 *  brokerType(optional): "KIS"(기본) | "BINANCE" — 미지정 시 백엔드가 KIS 로 라우팅(다중브로커 시 Binance 는 반드시 명시). */
export const patchBrokerLimits   = (env, body, brokerType) => api.patch("/broker/account/limits", body, { params: { env, ...(brokerType ? { brokerType } : {}) } }).then(r => r.data);
export const getPromotionGate    = (env) => api.get("/broker/account/promotion-gate", { params: { env } }).then(r => r.data);

// Binance 전용
export const testBinanceAccount  = (env, mode = "SPOT") => api.post("/broker/account/binance/test", null, { params: { env, mode } }).then(r => r.data);
export const getBinanceBalance   = (env, mode = "SPOT") => api.get("/broker/account/binance/balance", { params: { env, mode } }).then(r => r.data);

// brokerType(optional): "KIS"(기본) | "BINANCE" — 지정 시 해당 브로커로 라우팅(미지정은 KIS 하위호환).
export const getBrokerBalance     = (env, brokerType) => api.get("/broker/balance", { params: { env, ...(brokerType ? { brokerType } : {}) } }).then(r => r.data);
export const previewBrokerOrder   = (env, body, brokerType) => api.post("/broker/orders/preview", body, { params: { env, ...(brokerType ? { brokerType } : {}) } }).then(r => r.data);
export const placeBrokerOrder     = (env, body, brokerType) => api.post("/broker/orders/place", body, { params: { env, ...(brokerType ? { brokerType } : {}) } }).then(r => r.data);
export const getBrokerOrdersToday = (env, brokerType) => api.get("/broker/orders/today", { params: { env, ...(brokerType ? { brokerType } : {}) } }).then(r => r.data);
export const getBrokerQuote       = (env, ticker, brokerType) => api.get("/broker/quote", { params: { env, ticker, ...(brokerType ? { brokerType } : {}) } }).then(r => r.data);
export const getBrokerWsKey       = (env) => api.post("/broker/ws-key", null, { params: { env } }).then(r => r.data);

// OrderProposal — 자동주문 승인 큐
export const listProposals       = (status) => api.get("/proposals", { params: status ? { status } : {} }).then(r => r.data);
export const getPendingCount     = () => api.get("/proposals/pending-count").then(r => r.data);
export const createProposal      = (body) => api.post("/proposals", body).then(r => r.data);
export const approveProposal     = (id) => api.post(`/proposals/${id}/approve`).then(r => r.data);
export const rejectProposal      = (id, reason) => api.post(`/proposals/${id}/reject`, { reason }).then(r => r.data);

// Developer Studio Git 연동
export const getGitStatus            = () => api.get("/alpha/git/status").then(r => r.data);
export const connectGit              = (token) => api.post("/alpha/git/connect", { token }).then(r => r.data);
export const disconnectGit           = () => api.delete("/alpha/git/connect").then(r => r.data);
export const listGitRepos            = () => api.get("/alpha/git/repos").then(r => r.data);
export const getWorkspaceGitStatus   = (id) => api.get(`/alpha/workspaces/${id}/git/status`).then(r => r.data);
export const linkWorkspaceRepo       = (id, repoFullName, branch) =>
  api.post(`/alpha/workspaces/${id}/git/link`, { repoFullName, branch }).then(r => r.data);
export const unlinkWorkspaceRepo     = (id) => api.delete(`/alpha/workspaces/${id}/git/link`).then(r => r.data);
export const listWorkspaceCommits    = (id, branch, perPage = 30) =>
  api.get(`/alpha/workspaces/${id}/git/commits`, { params: { branch, perPage } }).then(r => r.data);
export const getWorkspaceCommit      = (id, sha) =>
  api.get(`/alpha/workspaces/${id}/git/commits/${sha}`).then(r => r.data);
export const compareWorkspaceRefs    = (id, base, head) =>
  api.get(`/alpha/workspaces/${id}/git/compare`, { params: { base, head } }).then(r => r.data);
export const pushWorkspaceFiles      = (id, body) =>
  api.post(`/alpha/workspaces/${id}/git/push`, body).then(r => r.data);
export const pullWorkspaceFile       = (id, path = "main.py") =>
  api.get(`/alpha/workspaces/${id}/git/file`, { params: { path } }).then(r => r.data);
export const deleteWorkspaceFile     = (id, path, message) =>
  api.delete(`/alpha/workspaces/${id}/git/file`, { params: { path, message } }).then(r => r.data);
export const getWorkspaceFileTree    = (id, branch) =>
  api.get(`/alpha/workspaces/${id}/git/tree`, branch ? { params: { branch } } : {}).then(r => r.data);
export const createWorkspacePr       = (id, body) =>
  api.post(`/alpha/workspaces/${id}/git/pr`, body).then(r => r.data);

// 무한매수법 (InfiniteBuying) 구독 관리
export const listInfiniteBuying      = () => api.get("/broker/infinite-buying").then(r => r.data);
export const createInfiniteBuying    = (body) => api.post("/broker/infinite-buying", body).then(r => r.data);
export const setInfiniteBuyingActive = (id, active) => api.patch(`/broker/infinite-buying/${id}/active`, { active }).then(r => r.data);
export const resetInfiniteBuying     = (id) => api.patch(`/broker/infinite-buying/${id}/reset`).then(r => r.data);
export const deleteInfiniteBuying    = (id) => api.delete(`/broker/infinite-buying/${id}`);
export const runNowInfiniteBuying    = (id) => api.post(`/broker/infinite-buying/${id}/run-now`).then(r => r.data);
// 시드 역산 계산기: "월 N원 벌려면 종목별 시드 얼마?" — body: { tickers?, period?, variant?, targetMonthlyKrw, fx? }
export const infiniteBuyingSizing    = (body) => api.post("/broker/infinite-buying/sizing", body).then(r => r.data);
