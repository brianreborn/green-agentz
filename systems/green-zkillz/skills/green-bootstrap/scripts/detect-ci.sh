#!/usr/bin/env bash
# REQ-SK01-02. Print CI posture. Never pause.
set -euo pipefail
ci=false
tags=()
for v in GITHUB_ACTIONS CI GITLAB_CI CIRCLECI BUILDKITE TRAVIS JENKINS_URL; do
  if [[ -n "${!v:-}" ]]; then
    ci=true
    tags+=("$v=${!v}")
  fi
done
if $ci; then
  echo "CI=true interactive=false log=stderr tags=${tags[*]}"
else
  echo "CI=false interactive=true log=stdout"
fi
