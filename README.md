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
