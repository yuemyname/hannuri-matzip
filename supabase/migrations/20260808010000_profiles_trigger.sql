-- 익명 세션 뒷받침 — SPEC.md §2.4 / WBS 0.4
--
-- 1) auth.users 에 행이 생기면 profiles 를 자동으로 만든다.
-- 2) restaurant_stats 뷰가 호출자 권한으로 돌게 고친다.

-- ── 랜덤 닉네임 ──────────────────────────────────────────────────────
-- 형용사 + 명사 + 4자리 (SPEC §2.4). 20 × 20 × 10000 = 400만 조합이라
-- 사내 규모에서 충돌은 사실상 없다. unique 제약을 걸지 않는 이유가 이것이다 —
-- 걸면 충돌 시 회원가입(= 첫 진입)이 실패하는데, 그건 훨씬 나쁘다.
create or replace function public.random_display_name()
returns text
language sql
volatile
as $$
  select (array[
    '느긋한','배고픈','성실한','조용한','상냥한','부지런한','씩씩한','다정한',
    '엉뚱한','든든한','발랄한','침착한','솔직한','너그러운','재빠른','수줍은',
    '유쾌한','포근한','당당한','살뜰한'
  ])[floor(random() * 20 + 1)]
  || (array[
    '너구리','고양이','판다','수달','부엉이','다람쥐','고슴도치','알파카',
    '펭귄','여우','토끼','오리','거북이','햄스터','코알라','기린',
    '두더지','미어캣','바다표범','카피바라'
  ])[floor(random() * 20 + 1)]
  || lpad(floor(random() * 10000)::text, 4, '0');
$$;

-- ── profiles 자동 생성 ──────────────────────────────────────────────
-- security definer 다. 트리거가 도는 시점엔 auth.uid() 가 아직 없고,
-- profiles 에는 insert 정책도 없기 때문에 호출자 권한으로는 못 넣는다.
-- search_path 를 고정해 두지 않으면 definer 함수는 탈취 경로가 된다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, public.random_display_name())
  on conflict (id) do nothing;   -- 재실행·복구 상황에서 가입이 깨지지 않게
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── restaurant_stats 를 호출자 권한으로 ─────────────────────────────
-- 뷰는 기본적으로 소유자 권한으로 돈다. 그대로 두면 세션 없는 요청도
-- 평점·리뷰 수를 읽을 수 있어서 §2.3 의 "세션 없으면 0건" 과 어긋난다.
-- security_invoker 를 켜면 밑의 restaurants·reviews RLS 가 호출자 기준으로 걸린다.
alter view restaurant_stats set (security_invoker = on);
