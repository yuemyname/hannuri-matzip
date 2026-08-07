// 카테고리 목록의 단일 소스 (CLAUDE.md › 도메인 규칙 › 데이터).
// DB의 restaurants.category check 제약, 필터칩, 등록 폼 셀렉트가 전부 여기서 파생된다.
// 값을 추가·변경할 때는 supabase/migrations 의 마이그레이션과 이 파일을 같은 커밋에서 바꾼다.
// 갈라지면 등록 폼에는 보이는데 저장이 실패하는 상태가 된다.

export const CATEGORIES = [
  "한식",
  "중식",
  "일식",
  "양식",
  "분식",
  "카페",
  "기타",
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}
