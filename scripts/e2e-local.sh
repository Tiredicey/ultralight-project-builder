#!/usr/bin/env bash
set -u
B=${BASE:-http://localhost:3000}/api
J='content-type: application/json'
T=$(mktemp -d)
pass=0; fail=0
ok() { if [ "$2" = "1" ]; then echo "PASS  $1"; pass=$((pass+1)); else echo "FAIL  $1  ($3)"; fail=$((fail+1)); fi; }
has() { case "$1" in *"$2"*) echo 1;; *) echo 0;; esac; }

r=$(curl -s $B/health); ok "health" $(has "$r" '"ok":true') "$r"
r=$(curl -s -c $T/o -H "$J" -d '{"email":"owner@example.com","name":"Owner","password":"OwnerPass123!"}' $B/auth/register); ok "first account becomes owner" $(has "$r" owner) "$r"
r=$(curl -s -c $T/p -H "$J" -d '{"email":"pending@example.com","name":"Pend","password":"PendPass1234!"}' $B/auth/register); ok "second account is pending" $(has "$r" pending) "$r"
c=$(curl -s -o /dev/null -w '%{http_code}' -b $T/p $B/jobs); ok "pending user blocked from jobs" $([ "$c" = 403 ] && echo 1 || echo 0) "$c"
c=$(curl -s -o /dev/null -w '%{http_code}' -b $T/p $B/admin/overview); ok "pending user blocked from admin" $([ "$c" = 403 ] && echo 1 || echo 0) "$c"
r=$(curl -s -b $T/o -H "$J" -d '{"sapUser":"LEARN-626","label":"lab"}' $B/admin/accounts); ok "owner adds LEARN-626" $(has "$r" '"ok":true') "$r"
r=$(curl -s -b $T/o -H "$J" -d '{"sapUser":"BAD-1"}' $B/admin/accounts); ok "malformed SAP user rejected" $(has "$r" error) "$r"
tok=$(curl -s -b $T/o -H "$J" -d '{"name":"sandbox","accounts":["LEARN-626"]}' $B/admin/runners | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
ok "runner token issued" $([ -n "$tok" ] && echo 1 || echo 0) "empty"
r=$(curl -s $B/me/plan/LEARN-626 -b $T/o); ok "plan contains recipe steps" $(has "$r" relationsPred) "${r:0:120}"
r=$(curl -s -b $T/o -H "$J" -d '{"sapUser":"LEARN-626","tasks":[12],"mode":"observe"}' $B/jobs); ok "observe job created" $(has "$r" '"id"') "$r"
jid=$(echo "$r" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('id') or d.get('job',{}).get('id',''))")
r=$(curl -s -b $T/o -H "$J" -d '{"sapUser":"LEARN-626","tasks":[8]}' $B/jobs); ok "second job on same SAP user refused" $(has "$r" 'already active') "$r"
r=$(curl -s -H "$J" -H "authorization: Bearer $tok" -d '{"accounts":["LEARN-626"]}' $B/runner/claim); ok "runner claims the job" $(has "$r" '"job"') "${r:0:160}"
c=$(curl -s -o /dev/null -w '%{http_code}' -H "$J" -H "authorization: Bearer ucr_wrong" -d '{}' $B/runner/claim); ok "bad runner token refused" $([ "$c" = 401 ] || [ "$c" = 403 ] && echo 1 || echo 0) "$c"
echo "$tok" > $T/token; echo "$jid" > $T/job
echo "TOKEN_FILE=$T/token JOB=$jid"
echo "$pass passed, $fail failed"
