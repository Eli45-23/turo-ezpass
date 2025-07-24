#!/usr/bin/env bash
#
# Live-tail the last WINDOW ms of CloudWatch logs every 2s

export AWS_AUTO_PROMPT=off
export CLI_AUTO_PROMPT=off

WINDOW=5000
LOG_GROUP="/ecs/turo-ezpass"

while true; do
  # get current epoch ms minus WINDOW
  START_TIME=$(( $(date +%s)000 - WINDOW ))

  /opt/homebrew/opt/awscli@2/bin/aws logs filter-log-events \
    --log-group-name "$LOG_GROUP" \
    --start-time "$START_TIME" \
    --limit 50 \
    --query 'events[*].[timestamp,message]' \
    --output table

  sleep 2
done