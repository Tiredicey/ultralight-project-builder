#!/usr/bin/env bash
set -u
cd "$(dirname "$0")/.."
B=http://localhost:3000/api
J='content-type: application/json'
T=$(mktemp -d)
pass=0; fail=0
ok() { if [ "$2" = "1" ]; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1  ($3)"; fail=$((fail+1)); fi; }
has() { case "$1" in *"$2"*) echo 1;; *) echo 0;; esac; }
DBQ() { npx wrangler d1 execute ultralight-builder-production --local --json --command "$1" 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['results'][0]['v'])"; }
serve() { pm2 delete all >/dev/null 2>&1; fuser -k 3000/tcp >/dev/null 2>&1; sleep 1; pm2 start npx --name quota-e2e -- wrangler pages dev dist --local --ip 0.0.0.0 --port 3000 $1 >/dev/null; for i in $(seq 1 60); do curl -s -o /dev/null localhost:3000/api/health && return; sleep 0.5; done; }

serve ""
E="quota$RANDOM@example.com"
curl -s -c $T/o -H "$J" -d "{\"email\":\"$E\",\"name\":\"Owner\",\"password\":\"OwnerPass123!\"}" $B/auth/register >/dev/null
curl -s -c $T/o -H "$J" -d "{\"email\":\"$E\",\"password\":\"OwnerPass123!\"}" $B/auth/login >/dev/null
OWN=$(DBQ "SELECT role v FROM users WHERE email='$E'")
[ "$OWN" = owner ] || { O2=$(DBQ "SELECT email v FROM users WHERE role='owner'"); echo "note: owner is $O2; e2e needs a fresh local DB (rm -rf .wrangler/state)"; }
curl -s -b $T/o -H "$J" -d '{"sapUser":"LEARN-640, LEARN-641"}' $B/admin/accounts >/dev/null
tok=$(curl -s -b $T/o -H "$J" -d '{"name":"quota"}' $B/admin/runners | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
R() { curl -s -H "$J" -H "authorization: Bearer $tok" -H "x-runner-version: ${RV:-1.3.5}" -d "$2" $B/runner$1; }

R /hello '{"info":{"version":"1.3.5","sap":{"ok":true,"ms":312}}}' >/dev/null
s1=$(DBQ "SELECT last_seen v FROM runners WHERE name='quota'")
for i in 1 2 3 4 5; do R /claim '{"accounts":["LEARN-640"]}' >/dev/null; done
s2=$(DBQ "SELECT last_seen v FROM runners WHERE name='quota'")
ok "heartbeat stored at most every 30 s (5 polls, no extra write)" $([ "$s1" = "$s2" ] && echo 1 || echo 0) "$s1 vs $s2"
i1=$(DBQ "SELECT updated_at v FROM runner_info")
R /hello '{"info":{"version":"1.3.5","sap":{"ok":true,"ms":402}}}' >/dev/null
i2=$(DBQ "SELECT updated_at v FROM runner_info")
ok "unchanged runner self-report not rewritten (SAP ping 312 vs 402 ms)" $([ "$i1" = "$i2" ] && echo 1 || echo 0) "$i1 vs $i2"

jid=$(curl -s -b $T/o -H "$J" -d '{"sapUser":"LEARN-640","tasks":[12],"mode":"observe","password":"x"}' $B/jobs | python3 -c "import sys,json;print(json.load(sys.stdin)['id'])")
r=$(R /claim '{"accounts":[]}'); ok "runner claims the job" $(has "$r" "\"id\":$jid") "${r:0:120}"
R /jobs/$jid/state '{"status":"running","stepIdx":0,"ack":[]}' >/dev/null
e1=$(DBQ "SELECT COUNT(*) v FROM events WHERE job_id=$jid")
for i in 1 2 3; do r=$(R /jobs/$jid/state '{"status":"running","stepIdx":0,"ack":[]}'); done
e2=$(DBQ "SELECT COUNT(*) v FROM events WHERE job_id=$jid")
ok "idle sync answers stored:true" $(has "$r" '"stored":true') "$r"
ok "idle sync writes no rows" $([ "$e1" = "$e2" ] && echo 1 || echo 0) "$e1 vs $e2"
r=$(R /jobs/$jid/frame '{"seq":1,"image":"QUJD","width":10,"height":10}')
ok "frame skipped while nobody has the canvas open" $(has "$r" '"stored":false') "$r"
curl -s -o /dev/null -b $T/o "$B/jobs/$jid/frame?since=-1"
r=$(R /jobs/$jid/frame '{"seq":2,"image":"QUJD","width":10,"height":10}')
ok "frame stored once someone opens the canvas" $(has "$r" '"stored":true') "$r"
curl -s -o /dev/null -b $T/o -H "$J" -d '{"type":"pause"}' $B/jobs/$jid/commands
r=$(R /jobs/$jid/state '{"status":"running","stepIdx":0,"ack":[]}')
cid=$(echo "$r" | python3 -c "import sys,json;print(json.load(sys.stdin)['commands'][0]['id'])" 2>/dev/null)
r2=$(R /jobs/$jid/state '{"status":"running","stepIdx":0,"ack":[]}')
ok "command redelivered until the runner acknowledges it" $(has "$r2" "\"id\":$cid") "$r2"
r3=$(R /jobs/$jid/state "{\"status\":\"running\",\"stepIdx\":0,\"ack\":[$cid]}")
ok "acknowledged command is not delivered again" $(has "$r3" '"commands":[]') "$r3"

serve "--binding SIMULATE_D1_WRITE_LIMIT=1"
r=$(curl -s -D $T/h -c $T/f -H "$J" -d "{\"email\":\"$E\",\"password\":\"OwnerPass123!\"}" $B/auth/login)
ok "sign-in works at the write limit (backup session)" $(has "$r" '"session":"fallback"') "${r:0:240}"
ok "backup cookie is HttpOnly" $(grep -i '^set-cookie' $T/h | grep -qi httponly && echo 1 || echo 0) "$(cat $T/h)"
r=$(curl -s -b $T/f $B/auth/me); ok "backup session recognised" $(has "$r" "$E") "$r"
r=$(curl -s -b $T/f "$B/jobs?all=1"); ok "runs readable at the limit" $(has "$r" '"jobs"') "${r:0:160}"
r=$(curl -s -b $T/f $B/admin/overview); ok "owner console readable at the limit" $(has "$r" '"users"') "${r:0:160}"
r=$(curl -s -b $T/f "$B/jobs/$jid/frame?since=-1"); ok "live frame readable at the limit" $(has "$r" '"seq"') "${r:0:160}"
r=$(curl -s -D $T/h2 -b $T/f -H "$J" -d '{"sapUser":"LEARN-641","tasks":[1]}' $B/jobs)
ok "new run refused with code D1_WRITE_LIMIT" $(has "$r" 'D1_WRITE_LIMIT') "$r"
ok "refusal is HTTP 503 with Retry-After" $(head -1 $T/h2 | grep -q 503 && grep -qi '^retry-after: [0-9]' $T/h2 && echo 1 || echo 0) "$(head -3 $T/h2)"
ok "retryAt is the next 00:00 UTC" $(echo "$r" | python3 -c "
import sys,json,datetime as D
t=json.load(sys.stdin)['retryAt']/1000; d=D.datetime.fromtimestamp(t,D.timezone.utc); n=D.datetime.now(D.timezone.utc)
print(1 if (d.hour,d.minute,d.second)==(0,0,0) and 0<(d-n).total_seconds()<=86400 else 0)") "$r"
r=$(R /claim '{"accounts":[]}'); ok "runner poll answers normally at the limit" $(has "$r" '"job"') "$r"
r=$(R /jobs/$jid/state '{"status":"running","stepIdx":3,"ack":[],"events":[{"level":"ok","message":"x"}]}')
ok "runner 1.3.5 sync gets stored:false plus retryAt" $([ "$(has "$r" '"stored":false')$(has "$r" retryAt)" = 11 ] && echo 1 || echo 0) "$r"
r=$(RV=1.3.4 curl -s -o /dev/null -w '%{http_code}' -H "$J" -H "authorization: Bearer $tok" -d '{"status":"running","stepIdx":3,"events":[{"level":"ok","message":"x"}]}' $B/runner/jobs/$jid/state)
ok "runner 1.3.4 (no ack field) gets 503 so it keeps its log lines" $([ "$r" = 503 ] && echo 1 || echo 0) "$r"
r=$(curl -s $B/health); ok "health reports the limit window" $(has "$r" '"retryAt"') "$r"
r=$(curl -s -b "uc_session=f1.1.9999999999999.forged" $B/auth/me); ok "forged backup token rejected" $(has "$r" '"user":null') "$r"
r=$(curl -s -o /dev/null -w '%{http_code}' -b $T/f -X POST $B/auth/logout); ok "sign out works at the limit" $([ "$r" = 200 ] && echo 1 || echo 0) "$r"

serve ""
r=$(curl -s -b $T/f $B/auth/me); ok "backup session still valid after writes reopen" $(has "$r" "$E") "$r"
r=$(curl -s -b $T/f "$B/jobs/$jid"); ok "job unchanged by refused writes (step 0)" $(has "$r" '"step_idx":0') "${r:0:200}"
pm2 delete quota-e2e >/dev/null 2>&1
echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
