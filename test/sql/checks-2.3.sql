-- aARgon3 2.3 checks: points and website custom-order requests. Runs after checks-2.1.sql.
\set ON_ERROR_STOP 1
do $$
declare a uuid := 'aaaaaaaa-0000-0000-0000-000000000001'; b uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
        x jsonb; board jsonb; r jsonb; n int;
begin
  insert into staff (user_id, email, name, role) values (a, 'pts-a@x.co', 'Ana', 'employee'), (b, 'pts-b@x.co', 'Ben', 'employee') on conflict do nothing;
  -- give, total, undo
  x := a3_points_give(a, 3, 'Covered a shift', 'manual', 'Riley', null);
  perform a3_points_give(a, -1, 'Late', 'late', 'aARgon3', null);
  perform a3_points_give(b, 5, 'Big sale', 'manual', 'Riley', null);
  board := a3_points_board(date_trunc('month', now()));
  select (e->>'total')::int into n from jsonb_array_elements(board) e where e->>'user_id' = a::text; assert n = 2, 'total after +3 -1: ' || n;
  assert (board->0->>'name') = 'Ben', 'Ben leads the board';
  perform a3_points_undo((x->>'id')::bigint, 'Lucas');
  select (e->>'total')::int into n from jsonb_array_elements(a3_points_board(date_trunc('month', now()))) e where e->>'user_id' = a::text; assert n = -1, 'undo removes the points: ' || n;
  assert (a3_points(a, 10)->0->>'reason') = 'Late', 'history newest first';
  assert jsonb_array_length(a3_points(a, 10)) = 2, 'undone entries stay in the history';
  begin perform a3_points_undo((x->>'id')::bigint, 'Lucas'); assert false, 'double undo'; exception when raise_exception then null; end;
  begin perform a3_points_give(a, 0, 'Nothing', 'manual', 'R', null); assert false, 'zero points'; exception when raise_exception then null; end;
  begin perform a3_points_give(a, 99, 'Too many', 'manual', 'R', null); assert false, '99 points'; exception when raise_exception then null; end;
  begin perform a3_points_give('cccccccc-0000-0000-0000-000000000003', 1, 'Who?', 'manual', 'R', null); assert false, 'not on team'; exception when raise_exception then null; end;
  -- points setting is allowed now
  perform a3_setting_set('points', '{"late": -1}', 'Lucas');
  assert (a3_settings()->'points'->>'late')::int = -1, 'points setting saved';
  -- website requests: land as requested, 3 a day per email
  r := a3_quote_request(jsonb_build_object('quote_no', 'Q-WEB001', 'plan', 'business', 'tier', 'pro', 'seats', 12, 'interval', 'year',
       'customer', jsonb_build_object('email', 'Pat@Co.com', 'company', 'Doe Labs'), 'request', jsonb_build_object('budget', 900)));
  assert r->>'quote_no' = 'Q-WEB001', 'request saved';
  assert (select status from quotes where quote_no = 'Q-WEB001') = 'requested', 'status requested';
  assert (select source from quotes where quote_no = 'Q-WEB001') = 'web', 'source web';
  assert (a3_quote('Q-WEB001')->'request'->>'budget')::int = 900, 'request kept';
  assert jsonb_array_length(a3_quotes('requested')) = 1, 'listed as requested';
  perform a3_quote_request(jsonb_build_object('quote_no', 'Q-WEB002', 'plan', 'personal', 'tier', 'pro', 'customer', jsonb_build_object('email', 'pat@co.com')));
  perform a3_quote_request(jsonb_build_object('quote_no', 'Q-WEB003', 'plan', 'personal', 'tier', 'pro', 'customer', jsonb_build_object('email', 'pat@co.com')));
  begin perform a3_quote_request(jsonb_build_object('quote_no', 'Q-WEB004', 'plan', 'personal', 'tier', 'pro', 'customer', jsonb_build_object('email', 'PAT@co.com')));
    assert false, '4th request in a day'; exception when raise_exception then null; end;
  begin perform a3_quote_request(jsonb_build_object('quote_no', 'Q-WEB005', 'plan', 'personal', 'tier', 'pro', 'customer', jsonb_build_object('email', 'nope')));
    assert false, 'bad email'; exception when raise_exception then null; end;
  -- staff saving a request turns it into a draft
  perform a3_quote_save(jsonb_build_object('quote_no', 'Q-WEB001', 'amount_cents', 145000, 'status', 'draft'));
  assert (select status from quotes where quote_no = 'Q-WEB001') = 'draft', 'request → draft';
end $$;

set role anon;
do $$ begin
  begin perform * from points; assert false, 'anon read points'; exception when insufficient_privilege then null; end;
  begin perform a3_quote_request('{}'); assert false, 'anon request'; exception when insufficient_privilege then null; end;
  begin perform a3_points_board(now()); assert false, 'anon board'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'ALL 2.3 CHECKS PASSED' as result;
