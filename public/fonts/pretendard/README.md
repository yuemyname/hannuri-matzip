# Pretendard Variable (dynamic subset) — woff2

npm `pretendard@1.3.9` 의 `dist/web/variable/woff2-dynamic-subset/` 를 그대로 복사했다.
SIL Open Font License 1.1 — https://github.com/orioncactus/pretendard

`@font-face` 선언은 여기 없고 `src/app/fonts.css` 에 있다.
Next 가 CSS 를 번들에서 관리하도록(수동 `<link>` 금지) 옮긴 것이고,
그 과정에서 `url()` 만 절대경로로 바꿨다. 갱신 방법은 그 파일 머리말에 적어뒀다.

## 왜 CDN 이 아니라 자체 호스팅인가

사내 툴이라 외부 CDN 에 런타임 의존을 걸지 않는다. jsdelivr 가 죽으면 폰트가 통째로 빠진다.

## 왜 전체 variable 이 아니라 dynamic subset 인가

전체 `PretendardVariable.woff2` 는 2.0MB 로 SPEC §6 의 "3G 3초" 예산을 혼자 다 쓴다.
dynamic subset 은 92개 조각(각 44KB 이하)이고 `unicode-range` 로 필요한 것만 받는다.
`/design` 기준 13개 333KB 가 내려갔다.
