# hannuri-matzip

사무실 맛집 지도. 사내 구성원용 Next.js 웹앱.

- 설계: `SPEC.md`
- 화면 구조: `SHELL.md`
- 작업 순서: `WBS.md`
- 작업 규칙: `CLAUDE.md`

## 개발

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build
pnpm lint
pnpm format
```

## 배포 (Vercel)

`main` 에 푸시하면 프로덕션이 따라간다.

**환경변수는 빌드 전에 넣어야 한다.** `NEXT_PUBLIC_*` 은 런타임에 읽는 값이 아니라
빌드 때 번들에 박히는 값이다. 나중에 추가하면 **재배포해야** 반영된다.
안 그러면 지도가 "지도 키가 없어요" 로 뜨고 `/me` 가 "아직 준비되지 않았어요" 로 뜬다.

Vercel Project Settings → Environment Variables 에 `.env.example` 의 항목을 전부 넣는다.

| 변수 | 노출 | 비고 |
|---|---|---|
| `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` | 브라우저 | NCP Web Dynamic Map |
| `NEXT_PUBLIC_FALLBACK_LAT` / `_LNG` | 브라우저 | GPS 거부 시 기준점 |
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | 브라우저 | RLS 로 보호되는 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | **서버만** | `NEXT_PUBLIC_` 붙이지 말 것 |
| `NAVER_SEARCH_CLIENT_ID` / `_SECRET` | **서버만** | 지역검색 프록시 전용 |

배포 후 두 가지를 더 해야 실제로 동작한다.

1. **NCP 콘솔 → Web Dynamic Map → 서비스 URL 에 배포 도메인 추가.**
   빠뜨리면 지도만 401 로 죽는다. `*.vercel.app` 프리뷰 도메인도 쓸 거면 같이 넣는다.
2. **Supabase → Authentication → 익명 로그인 허용** (`User Signups` 블록).
   꺼져 있으면 세션 발급이 422 로 실패한다.

GPS 는 **HTTPS 에서만** 동작한다. 실기기 확인은 배포 도메인으로 해야 하고,
`http://<사내망 IP>:3000` 으로는 위치 권한 자체가 안 뜬다.

## 디렉터리

```
src/
  app/
    @modal/       # 인터셉트 모달 슬롯 (SHELL.md §1)
  components/     # 공용 UI
  features/       # map, restaurants, reviews, pick, me
  lib/
    supabase/
    naver/
  types/
```

모달 경로는 인터셉트 라우트(`@modal/(.)…`)와 풀페이지 fallback을 쌍으로 둔다.
내용 컴포넌트는 `features/` 아래에 한 번만 쓰고 양쪽에서 가져다 쓴다.
