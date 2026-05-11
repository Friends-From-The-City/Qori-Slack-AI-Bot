# Common Tasks

How to perform common administrative and development tasks for Qori.

---

## Configuration Tasks

### Adding a New Prompt

1. Create YAML file in `/config/prompts/`:

{% raw %}
```yaml
id: new_feature
label: "New Feature"
version: v1.0
description: |
  Description of what this feature does.

llm_config:
  model: "claude-sonnet-4-20250514"
  temperature: 0.3
  max_tokens: 2000

input_variables:
  - name: field_name
    type: text
    required: true
    placeholder: "Example input"

ai_generation_tasks:
  - task_id: "generate_output"
    prompt: |
      Your prompt here using {{field_name}}

output_template: |
  # Output Title

  {{ai_generated.generate_output}}

output_options:
  path: "folder/"
  filename: "output_{{current_date}}.md"
```
{% endraw %}

2. Update `/config/command-mapping.json`

3. Test via Slack

### Adding a New Modal

1. Create JSON file in `/config/modals/[category]/`:

```json
{
  "type": "modal",
  "title": {
    "type": "plain_text",
    "text": "Modal Title"
  },
  "submit": {
    "type": "plain_text",
    "text": "Submit"
  },
  "close": {
    "type": "plain_text",
    "text": "Cancel"
  },
  "blocks": [
    {
      "type": "input",
      "block_id": "field_name",
      "label": {
        "type": "plain_text",
        "text": "Field Label"
      },
      "element": {
        "type": "plain_text_input",
        "action_id": "field_name_input",
        "placeholder": {
          "type": "plain_text",
          "text": "Enter value..."
        }
      }
    }
  ]
}
```

2. Reference in command-mapping.json

3. Connect to prompt YAML

### Modifying Existing Prompts

1. Locate file in `/config/prompts/`
2. Make changes
3. Increment version number
4. Test in staging
5. Deploy

### Updating Output Templates

Edit the `output_template` section in the prompt YAML:

{% raw %}
```yaml
output_template: |
  # {{title}}

  **Generated:** {{current_date}}

  {{ai_generated.content}}
```
{% endraw %}

---

## User Support Tasks

### Viewing User Activity

```sql
SELECT
  u.display_name,
  cl.command,
  cl.created_at
FROM command_logs cl
JOIN users u ON cl.user_id = u.id
WHERE u.slack_id = 'U12345'
ORDER BY cl.created_at DESC
LIMIT 20;
```

### Checking Study Status

```sql
SELECT
  s.name,
  s.status,
  COUNT(p.id) as participant_count,
  COUNT(sess.id) as session_count
FROM studies s
LEFT JOIN participants p ON s.id = p.study_id
LEFT JOIN sessions sess ON s.id = sess.study_id
WHERE s.name LIKE '%study name%'
GROUP BY s.id;
```

### Reviewing Sam Escalations

```sql
SELECT
  e.summary,
  e.priority,
  e.status,
  u.display_name as requester,
  e.created_at
FROM escalations e
JOIN users u ON e.user_id = u.id
WHERE e.status = 'open'
ORDER BY
  CASE e.priority
    WHEN 'urgent' THEN 1
    WHEN 'high' THEN 2
    WHEN 'normal' THEN 3
    WHEN 'low' THEN 4
  END;
```

---

## Debugging Tasks

### Check Recent Errors

```bash
# View error logs
npm run logs -- --level=error --since=1h

# Check specific command
grep "research_plan" logs/application.log | tail -20
```

### Validate Configuration Files

```bash
# Validate all configs
npm run validate

# Validate specific file
npm run validate -- config/prompts/research_plan.yaml

# Check JSON syntax
cat config/modals/plan/research_plan.json | jq .
```

### Test AI Generation

```bash
# Run prompt in isolation
npm run test:prompt -- --file=research_plan.yaml --input='{"project_title": "Test"}'
```

### Trace Request Flow

```sql
SELECT
  cl.command,
  cl.action,
  cl.status,
  cl.error_message,
  cl.duration_ms,
  cl.created_at
FROM command_logs cl
WHERE cl.id = 'request-uuid'
OR cl.created_at BETWEEN '2024-01-01' AND '2024-01-02';
```

---

## Maintenance Tasks

### Clear Old Logs

```bash
# Archive logs older than 90 days
npm run logs:archive

# Delete archived logs older than 1 year
npm run logs:cleanup
```

### Update Dependencies

```bash
# Check for updates
npm outdated

# Update safely
npm update

# Full upgrade (review changes!)
npm upgrade

# Security audit
npm audit
npm audit fix
```

### Database Maintenance

```bash
# Vacuum database
npm run db:vacuum

# Analyze query performance
npm run db:analyze

# Check for slow queries
npm run db:slow-queries
```

### Rotate API Keys

1. Generate new key from provider
2. Add new key to environment
3. Deploy with new key
4. Verify functionality
5. Revoke old key

---

## Sam Agent Tasks

### Update Sam's Knowledge

Edit `/config/sam-config.yaml`:

```yaml
capabilities:
  answer_questions:
    knowledge_sources:
      - path: "docs/help/new-topic.md"
        description: "New topic documentation"
```

### Add Escalation Contact

Edit `/sam/escalation-config.yaml`:

```yaml
contacts:
  - name: "New Person"
    slack_id: "U_NEWPERSON"
    role: "Their Role"
    topics:
      - relevant_topic
```

### Review Sam Conversations

```bash
# View recent conversations
tail -100 logs/sam-conversations.log | jq .

# Search for specific topic
grep "research plan" logs/sam-conversations.log
```

### Update Sam Prompts

Edit `/sam/sam-prompts.yaml` to modify how Sam responds to different situations.

---

## GitHub Tasks

### Check Repository Access

```bash
# List repos
gh repo list your-org --limit 50

# Check specific repo
gh repo view your-org/study-name
```

### Manual File Operations

```bash
# View study file
gh api repos/your-org/study-name/contents/01-planning/research_plan.md

# Create/update file
gh api repos/your-org/study-name/contents/path/file.md \
  -X PUT \
  -f message="Update file" \
  -f content="$(base64 file.md)"
```

### Fix Repository Permissions

```bash
# Add collaborator
gh api repos/your-org/study-name/collaborators/username \
  -X PUT \
  -f permission=push
```

---

## Deployment Tasks

### Deploy Config Changes

```bash
git add config/
git commit -m "Update [feature] configuration"
git push origin main
npm run deploy:config
```

### Emergency Rollback

```bash
# Quick rollback
npm run rollback:production

# Rollback specific component
git revert HEAD
git push origin main
npm run deploy:config
```

### Health Check After Deploy

```bash
npm run health
npm run test:smoke
```

---

## Reference

- [Architecture](architecture.md)
- [Deployment](deployment.md)
- [Database Schema](database-schema.md)
