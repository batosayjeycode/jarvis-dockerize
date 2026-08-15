---
description: Prepare backend and frontend branches for a Jira task (checkout uat, pull latest, create users/andy/<JIRA_ID>-uat branch in both repos)
---

Prepare both repositories for implementation of the given Jira task.

**Input**: $ARGUMENTS — a Jira ticket ID or full URL (e.g. `DE-11201` or `https://new-sociolla.atlassian.net/browse/DE-11201`)

**Steps to follow:**

1. **Extract the Jira ID** from the input. If a full URL is given, parse the ticket ID from the last path segment (e.g. `DE-11201`). The branch name to create is `users/andy/<JIRA_ID>-uat`.

2. **Backend preparation** — run each command inside the `backend/` directory:
   - `git checkout uat`
   - `git pull origin uat`
   - If branch `users/andy/<JIRA_ID>-uat` already exists: `git checkout users/andy/<JIRA_ID>-uat`
   - Otherwise: `git checkout -b users/andy/<JIRA_ID>-uat`

3. **Frontend preparation** — run each command inside the `frontend/` directory:
   - `git checkout uat`
   - `git pull origin uat`
   - If branch `users/andy/<JIRA_ID>-uat` already exists: `git checkout users/andy/<JIRA_ID>-uat`
   - Otherwise: `git checkout -b users/andy/<JIRA_ID>-uat`

4. **Report** — after both repos are ready, print a short summary showing:
   - The active branch in `backend/` and `frontend/`
   - Confirmation that both repos are on `users/andy/<JIRA_ID>-uat` and ready for implementation

Do not start any implementation work until the user explicitly asks for it.
