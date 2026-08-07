# supabase/tests — 검증용 하네스

`supabase db reset` 을 못 돌리는 환경에서 마이그레이션을 검증하기 위한 것들이다.
**애플리케이션 스키마가 아니다.** `supabase/migrations/` 밖에 두는 이유가 그것이다.

| 파일 | 역할 |
|---|---|
| `shim.sql` | 로컬 Postgres 에 `auth` 스키마, `anon`/`authenticated` 롤, `auth.uid()`/`auth.role()` 을 만들어 Supabase 를 흉내낸다 |
| `schema.test.sql` | 객체 개수·인덱스·제약·집계 뷰를 검사한다. 실패하면 exception |

## 실행

```bash
pnpm db:verify
```

Postgres 16 + PostGIS 3 이 필요하다. 유닉스 소켓 peer 인증만 열린 머신에서는:

```bash
sudo -u postgres bash scripts/verify-schema.sh
```

## 이게 대신하지 못하는 것

Postgres 안에서 끝나는 것만 본다. **`supabase db reset` 의 대체품이 아니다.**

- GoTrue(익명 세션 발급, `profiles` 자동 생성 트리거 동작)
- Storage(`review-photos` 버킷과 그 정책)
- PostgREST 가 실제로 JWT 를 파싱해 넘기는 경로

`shim.sql` 의 `auth.uid()`/`auth.role()` 은 실물과 **비슷할 뿐 같지 않다.**
여기서 통과했다고 Supabase 에서 통과한다는 보장은 없다.
Supabase 를 띄울 수 있게 되면 `pnpm supabase db reset` 으로 한 번 확인할 것.

## ⚠️ 실제 Supabase 에 적용하지 말 것

`shim.sql` 을 실물 DB(로컬 스택·클라우드)에 돌리면 진짜 `auth.uid()` 를
가짜로 덮어써서 RLS 가 전부 무력화된다. `pnpm db:verify` 는 버리는 DB 를
새로 만들어서만 동작하므로, 그 경로로만 쓴다.
