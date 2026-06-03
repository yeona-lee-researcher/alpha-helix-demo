# insert_test_data.sql 실행 방법

## 문제 해결 완료 ✅

**FK 제약 조건 에러** 해결: `user_interest_partners`를 `partner_profile` 삭제 전에 먼저 삭제하도록 순서 수정

## MySQL Workbench에서 실행하기 (권장)

1. **MySQL Workbench 실행**
2. **devbridge_db 연결**
3. **File → Open SQL Script** 선택
4. `C:\Team2_DevBridge\backend\docs\insert_test_data.sql` 파일 선택
5. **번개 아이콘(Execute) 클릭**

## 실행 후 추가되는 데이터

### 완료된 프로젝트 3개 (client=client_hylee, partner=hyleeyou)
1. **Festory** - 축제 정보 통합 플랫폼
   - 기간: 2024.03 - 2024.09 (6개월)
   - 역할: Full-stack Developer & Tech Lead
   - status: `COMPLETED`

2. **Alpha-Helix** - AI 단백질 구조 분석
   - 기간: 2024.06 - 2024.10 (4개월)
   - 역할: AI/ML Engineer & Backend Developer
   - status: `COMPLETED`

3. **DevBridge Platform** - 개발자 매칭 플랫폼
   - 기간: 2024.09 - 2025.02 (5개월)
   - 역할: Full-stack Developer & Product Owner
   - status: `COMPLETED`

### 추가되는 데이터 상세

#### ✅ projects 테이블
- 3개 완료 프로젝트 + 3개 진행중 프로젝트
- client_hylee가 의뢰자

#### ✅ project_application 테이블
- hyleeyou가 파트너로 참여
- status: `COMPLETED` (완료된 3개)
- status: `ACCEPTED` (진행중 1개)

#### ✅ partner_portfolios 테이블
- hyleeyou의 포트폴리오 3개
- 상세한 작업 내용, 기술 스택, 도전 과제, 해결 방법 포함

#### ✅ partner_review / client_review
- 각 완료 프로젝트별 상호 평가
- 총 4개 프로젝트 (완료 3개 + 진행중 1개)에 대한 리뷰

#### ✅ partner_profile_stats
- completed_projects: 12
- rating: 4.91

#### ✅ client_profile_stats
- completed_projects: 8
- rating: 4.91

## 실행 확인

실행 후 다음 메시지가 표시되면 성공:
```
Portfolio projects inserted successfully!
```

## 파트너의 완료한 프로젝트 조회 방법

```sql
-- hyleeyou가 참여한 완료 프로젝트 조회
SELECT p.id, p.title, p.status, pa.status as app_status
FROM projects p
JOIN project_application pa ON p.id = pa.project_id
WHERE pa.partner_user_id = (SELECT id FROM users WHERE username = 'hyleeyou')
  AND p.status = 'COMPLETED'
  AND pa.status = 'COMPLETED';
```

이 쿼리로 **Festory, Alpha-Helix, DevBridge** 3개가 조회되어야 합니다.
