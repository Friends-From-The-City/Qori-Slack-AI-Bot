# Staging: qori-studies/_content/

**Phase B-0.5 Step 2**

These files need to be committed to qori-studies (the content repo) at `_content/`.

## Files to commit

```
qori-studies/
└── _content/
    ├── project-readme-template.md
    ├── study-readme-template.md
    ├── observer-guidelines.md
    └── observer-guide-expanded.md
```

## Commit command

```bash
cd /path/to/qori-studies
mkdir -p _content
cp /path/to/qori-slack/docs/staging/_content/* _content/
git add _content/
git commit -m "feat(B-0.5): add content templates for project/study scaffolding

Phase B-0.5 Step 2: Content templates for scaffolding service.

Files:
- project-readme-template.md: Project README with folder structure
- study-readme-template.md: Study README with cascade status
- observer-guidelines.md: VA observer guidelines (migrated from config/templates)
- observer-guide-expanded.md: Expanded observer guide (migrated from config/templates)

Handlebars variables used:
- {{project_name}}, {{project_slug}}
- {{study_name}}, {{study_slug}}
- {{created_date}}, {{created_by}}
"
git push origin main
```

## After committing

Delete this staging directory:
```bash
rm -rf docs/staging/
```

Then proceed to Step 3 (scaffolding service).
