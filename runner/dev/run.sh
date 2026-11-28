#!/usr/bin/env bash
( echo "const TASKS = $1;"; cat "$(dirname "$0")/plan.js" ) > /tmp/cur.js
curl -s --max-time ${T:-1200} -X POST --data-binary @/tmp/cur.js http://127.0.0.1:9333
