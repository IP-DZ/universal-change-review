Review the current repository changes using the Universal Change Review MCP tools.

Call `changes_summary`, then inspect every behaviorally relevant or risky file with `changes_diff`. If a task snapshot id is available, call `changes_since` and separate task changes from pre-existing work. Report actionable findings first, ordered P0 through P3, with file and line evidence. Then summarize changed behavior, validation actually performed, and remaining risks. Do not edit files unless I explicitly ask you to fix a finding.
