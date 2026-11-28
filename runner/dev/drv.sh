#!/usr/bin/env bash
curl -s --max-time ${T:-170} -X POST --data-binary @"$1" http://127.0.0.1:9333
