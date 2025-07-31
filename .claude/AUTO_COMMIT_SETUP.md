# Auto-Commit Hook Setup

## Overview

This project now has an auto-commit hook configured that automatically commits successful code changes to Git when Claude makes file modifications.

## How It Works

### Hook Configuration

The hook is configured in `.claude/settings.local.json`:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "$HOME/.claude/hooks/auto-commit.sh"
          }
        ]
      }
    ]
  }
}
```

### Hook Script

The auto-commit script (`~/.claude/hooks/auto-commit.sh`) performs the following:

1. **Error Checking**: Validates syntax for common file types:
   - JavaScript/TypeScript (`.js`, `.jsx`, `.ts`, `.tsx`)
   - JSON files (`.json`) 
   - Python files (`.py`)
   - Terraform files (`.tf`)

2. **Smart Commit Messages**: Generates meaningful commit messages based on file types:
   - `feat: code updates` - for source code changes
   - `config: configuration updates` - for config files
   - `docs: documentation updates` - for markdown/text files
   - `deps: dependency updates` - for package.json, requirements.txt, etc.

3. **Safety Features**:
   - Only commits if no syntax errors are detected
   - Won't commit if not in a Git repository
   - Shows detailed information about what's being committed
   - Uses `--no-verify` to bypass Git hooks that might interfere

## What Gets Auto-Committed

The hook triggers after successful:
- File writes (new files)
- File edits (modifications)
- Multi-file edits

## What Doesn't Get Auto-Committed

The hook will **skip** commits if:
- Syntax errors are detected in changed files
- No files have actually changed
- Not in a Git repository
- The validation checks fail

## Commit Message Format

Auto-commits include:
- Descriptive commit type and summary
- List of modified files
- Attribution to Claude Code
- Co-authored-by tag

Example:
```
feat: code updates

Modified files:
- src/components/Dashboard.tsx
- src/utils/api.ts

🤖 Auto-committed by Claude Code after successful changes

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Managing the Hook

### Disable Auto-Commits

To temporarily disable auto-commits, comment out the hooks section in `.claude/settings.local.json`:

```json
{
  "permissions": { ... },
  // "hooks": { ... }
}
```

### Enable Auto-Push

To also automatically push commits to the remote repository, uncomment the push section in the hook script:

```bash
# Uncomment these lines in ~/.claude/hooks/auto-commit.sh
echo "🚀 Pushing to remote repository..."
if git push; then
    echo "✅ Successfully pushed to remote!"
else
    echo "⚠️  Failed to push to remote. You may need to push manually."
fi
```

### View Hook Status

Check if the hook is working by looking for auto-commit messages after Claude makes changes to files.

## Troubleshooting

### Hook Not Running

1. Verify the hook script is executable:
   ```bash
   chmod +x ~/.claude/hooks/auto-commit.sh
   ```

2. Check the settings.local.json syntax is valid JSON

3. Ensure you have the necessary permissions in the settings file

### Syntax Errors Preventing Commits

The hook will show specific error messages for different file types. Fix the syntax errors and the next successful change will trigger a commit.

### Manual Override

If you need to commit changes that fail validation, you can always commit manually:

```bash
git add -A
git commit -m "manual: override auto-commit validation"
```

## Benefits

- **Never lose work**: All successful changes are automatically preserved in Git history
- **Better commit history**: Meaningful commit messages with file listings  
- **Error prevention**: Won't commit broken code
- **Zero overhead**: Runs automatically without interrupting your workflow
- **Transparency**: Clear indicators when commits happen and why

## Security Note

The hook only runs on successful file changes and includes validation to prevent committing broken code. It uses the same Git permissions you already have and doesn't introduce additional security risks.