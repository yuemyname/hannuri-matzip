"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 검색이 도는 동안 **상자 높이를 붙잡는다.**
 *
 * 모달은 내용 높이를 따라가는 하단 시트라, 결과가 사라지면 시트가 내려앉았다
 * 새 결과가 오면 다시 올라온다. 글자를 읽던 눈이 매번 따라 움직여서 어지럽다.
 * 리스트는 그대로 비우되(지난 결과를 남기면 새 검색어의 답인 줄 안다) 자리는 지킨다.
 *
 * 재는 건 **검색이 끝난 상태**이고, 쓰는 건 **다음 검색이 도는 동안**이다.
 * 도는 중에 재면 방금 비운 높이를 붙잡게 되어 아무 소용이 없다.
 *
 * `useLayoutEffect` 가 아닌 이유: 이 값은 다음 검색에서 쓰이므로 같은 프레임에
 * 반영될 필요가 없고, 풀페이지 fallback 은 서버에서도 렌더돼 layout 훅이 경고를 낸다.
 */
export function useHoldHeight(busy: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (busy) return;
    const el = ref.current;
    if (el) setHeight(el.offsetHeight);
  });

  return {
    ref,
    // 토큰이 아니라 방금 잰 값이다. 디자인 결정이 아니라 데이터라서 인라인이다.
    style: busy && height > 0 ? { minHeight: height } : undefined,
  };
}
