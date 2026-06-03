-- 주문 체결타입(LIMIT/LOC/MARKET) — 무한매수법 LOC평단 매수를 KIS 장마감지정가(ORD_DVSN=34)로 내기 위함.
-- 기존 행은 모두 일반 지정가였으므로 LIMIT 로 채운다.
ALTER TABLE order_proposal
    ADD COLUMN order_type VARCHAR(8) NOT NULL DEFAULT 'LIMIT' AFTER limit_price;
