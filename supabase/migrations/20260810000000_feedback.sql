-- 피드백 (2026-08-10 요청).
--
-- [+] 메뉴에서 한 줄 적어 보내는 통이다. 답장은 없다 — 이 앱에는 신원이 없어서
-- (SPEC §2.4) 누구에게 답할지를 물어볼 데가 없다. 읽고 고치는 건 사람이 한다.
--
-- **누가 썼는지 안 남긴다.** `user_id` 를 두면 익명 세션 id 가 붙는데, 그건
-- 답장에 쓸 수도 없으면서 "누가 이런 말 했나" 를 들여다볼 수는 있게 만든다.
-- 사내 툴에서 그건 안 쓰느니만 못하다. 대신 내용에 길이 제한을 둔다.

create table if not exists feedback (
  id         uuid primary key default gen_random_uuid(),
  body       text not null,
  -- 관리자가 "봤다" 를 표시한다. 지우는 것과 다르다 — 지우면 같은 말이 또 온다.
  resolved   boolean not null default false,
  created_at timestamptz not null default now()
);

-- 빈 글·장문 붙여넣기를 막는다. 화면의 maxLength 와 같은 뜻이어야 한다.
alter table feedback drop constraint if exists feedback_body_len;
alter table feedback add constraint feedback_body_len check (
  char_length(btrim(body)) between 1 and 1000
);

-- 관리자 화면이 최근 순으로 읽는다.
create index if not exists feedback_created_idx on feedback (created_at desc);

alter table feedback enable row level security;

-- **쓰기만 열고 읽기는 안 연다.** 정책이 없는 동작은 거부된다 (SPEC §2.3).
-- 그래서 남이 쓴 피드백은 아무도 못 읽고, 읽는 건 service_role 을 쓰는
-- 관리자 라우트뿐이다. 내가 쓴 것도 못 읽는데, `user_id` 가 없으니 "내 것" 을
-- 가려낼 방법 자체가 없다 — 익명으로 두기로 한 대가다.
drop policy if exists feedback_insert on feedback;
create policy feedback_insert on feedback
  for insert to authenticated with check (true);
