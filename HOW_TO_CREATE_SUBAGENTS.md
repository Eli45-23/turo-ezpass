# How to Create Claude Code Subagents

> Comprehensive guide for creating specialized AI subagents for your projects

## 📋 Table of Contents

1. [Understanding Subagents](#understanding-subagents)
2. [Quick Start Guide](#quick-start-guide)
3. [Subagent Structure](#subagent-structure)
4. [Configuration Reference](#configuration-reference)
5. [Writing Effective System Prompts](#writing-effective-system-prompts)
6. [Tool Management](#tool-management)
7. [Best Practices](#best-practices)
8. [Testing and Validation](#testing-and-validation)
9. [Examples and Templates](#examples-and-templates)
10. [Troubleshooting](#troubleshooting)

---

## Understanding Subagents

### What are Subagents?

Claude Code subagents are specialized AI assistants that:
- **Focus on specific domains** (e.g., frontend, security, infrastructure)
- **Use dedicated context windows** (no pollution of main conversation)
- **Have customized system prompts** for their expertise area
- **Can access specific tools** based on their needs
- **Activate automatically** based on context or explicit requests

### Key Benefits

| Benefit | Description |
|---------|-------------|
| **Context Preservation** | Each subagent maintains its own context, keeping the main conversation focused |
| **Specialized Expertise** | Domain-specific knowledge and patterns for better results |
| **Improved Performance** | Targeted responses with 80%+ faster problem resolution |
| **Reusability** | Once created, can be used across projects and shared with teams |
| **Flexible Permissions** | Granular tool access control for security and efficiency |

---

## Quick Start Guide

### Method 1: Using the `/agents` Command (Recommended)

```bash
# Open the subagents interface
/agents
```

This provides an interactive menu to:
- View all available subagents
- Create new subagents with guided setup
- Edit existing subagents
- Manage tool permissions
- Delete subagents

### Method 2: Manual File Creation

```bash
# Create project-level subagent
mkdir -p .claude/agents
touch .claude/agents/your-subagent-name.md

# Create user-level subagent (available across all projects)
mkdir -p ~/.claude/agents
touch ~/.claude/agents/your-subagent-name.md
```

### Method 3: Generate with Claude (Recommended)

Ask Claude to help create your subagent:

```
> Create a subagent for [your specific domain] that specializes in [specific tasks]. 
> It should be used for [when to use it] and have expertise in [technologies/areas].
```

---

## Subagent Structure

### File Locations and Priority

| Type | Location | Scope | Priority |
|------|----------|--------|----------|
| **Project Subagents** | `.claude/agents/` | Current project only | Highest |
| **User Subagents** | `~/.claude/agents/` | All projects | Lower |

**Note**: When names conflict, project-level subagents override user-level ones.

### File Format

Every subagent follows this Markdown structure:

```markdown
---
name: subagent-name
description: When and why this subagent should be used
tools: tool1, tool2, tool3  # Optional - inherits all if omitted
---

Your detailed system prompt goes here.

This can be multiple paragraphs and should clearly define:
- The subagent's role and expertise
- When it should be invoked
- How it approaches problems
- Specific instructions and constraints
- Best practices and methodologies
```

---

## Configuration Reference

### Required Fields

#### `name` (Required)
- **Format**: Lowercase letters and hyphens only
- **Examples**: `frontend-developer`, `security-auditor`, `api-specialist`
- **Best Practice**: Use descriptive, domain-specific names

```yaml
name: frontend-developer
```

#### `description` (Required)
- **Purpose**: Tells Claude when to activate this subagent
- **Style**: Natural language, action-oriented
- **Keywords**: Include "proactively", "MUST BE USED" for automatic activation

```yaml
description: Frontend development specialist for React components, state management, and modern JavaScript. Use proactively for dashboard development, component creation, React hooks, and frontend architecture decisions.
```

### Optional Fields

#### `tools` (Optional)
- **Default**: Inherits all tools from main thread if omitted
- **Format**: Comma-separated list
- **Purpose**: Restrict tools for security or focus

```yaml
tools: Read, Edit, Write, Bash, Grep, Glob
```

**Available Tools:**
- `Read` - Read files from filesystem
- `Edit` - Edit existing files
- `Write` - Create new files
- `Bash` - Execute shell commands
- `Grep` - Search within files
- `Glob` - Find files by pattern
- `LS` - List directory contents
- `Task` - Launch other subagents
- `WebFetch` - Fetch web content
- `WebSearch` - Search the web
- Plus any MCP server tools you have configured

---

## Writing Effective System Prompts

### Structure Template

```markdown
You are a [role] specializing in [domain] for the [project name] project.

**Core Expertise:**
- Area 1 with specific technologies
- Area 2 with methodologies
- Area 3 with tools and practices

**Key Components You Manage:**
- Component/file 1 - description
- Component/file 2 - description
- System/process 3 - description

**When invoked:**
1. Specific action 1
2. Specific action 2
3. Specific action 3
4. Specific action 4
5. Specific action 5

**[Domain] Workflow:**
1. **Step 1**: Description of first step
2. **Step 2**: Description of second step
3. **Step 3**: Description of third step
4. **Step 4**: Description of fourth step
5. **Step 5**: Description of fifth step

**Key Principles/Standards:**
- Principle 1 with explanation
- Principle 2 with explanation
- Principle 3 with explanation

**Common Tasks:**
```language
// Code examples relevant to this domain
const example = "showing typical patterns";
```

**Best Practices:**
- Practice 1 with reasoning
- Practice 2 with reasoning
- Practice 3 with reasoning

Always [key behavior or output expectation].
```

### Content Guidelines

#### 1. **Be Specific and Actionable**
```markdown
❌ General: "Help with frontend tasks"
✅ Specific: "Create React components with TypeScript, implement state management patterns, and optimize bundle performance"
```

#### 2. **Include Domain Context**
```markdown
**Key Technologies:**
- React 18+ with hooks and Suspense
- TypeScript for type safety
- Tailwind CSS for styling
- React Query for server state
```

#### 3. **Define Clear Workflows**
```markdown
**Component Development Process:**
1. **Analysis**: Review existing patterns and requirements
2. **Design**: Plan component interface and props
3. **Implementation**: Write component with TypeScript
4. **Testing**: Add unit tests and stories
5. **Integration**: Connect to application state
```

#### 4. **Provide Code Examples**
```markdown
**Component Pattern:**
```typescript
interface ComponentProps {
  data: DataType;
  onAction: (item: DataType) => void;
}

const Component: React.FC<ComponentProps> = ({ data, onAction }) => {
  return <div>{/* implementation */}</div>;
};
```

#### 5. **Include Project-Specific Context**
```markdown
**Turo-EZPass Specific:**
- Dashboard for trip management
- Integration with AWS Lambda APIs
- Authentication via Cognito
- Responsive design for mobile and desktop
```

---

## Tool Management

### Understanding Tool Access

#### Option 1: Inherit All Tools (Default)
```yaml
# No tools field = inherits all available tools
---
name: full-access-agent
description: Agent with access to all available tools
---
```

#### Option 2: Specific Tool Access
```yaml
# Comma-separated list of specific tools
---
name: read-only-agent
description: Agent that can only read and analyze files
tools: Read, Grep, Glob
---
```

### Tool Selection Strategy

| Use Case | Recommended Tools | Reasoning |
|----------|-------------------|-----------|
| **Code Analysis** | `Read`, `Grep`, `Glob` | Read code, search patterns, find files |
| **Development** | `Read`, `Edit`, `Write`, `Bash` | Full development capabilities |
| **Security Audit** | `Read`, `Grep`, `Bash` | Analyze code, run security tools |
| **Documentation** | `Read`, `Write`, `Glob` | Read existing docs, create new ones |
| **Infrastructure** | `Read`, `Edit`, `Bash` | Manage config files, run commands |

### MCP Tools Integration

If you have MCP servers configured, subagents can access those tools:

```yaml
# Include MCP tools with standard tools
tools: Read, Edit, Write, Bash, mcp_tool_name, another_mcp_tool
```

---

## Best Practices

### 🎯 Design Principles

#### 1. **Single Responsibility**
- Each subagent should have one clear domain
- Avoid creating "do everything" subagents
- Better to have multiple focused subagents

#### 2. **Descriptive Naming**
```yaml
✅ Good Names:
- frontend-developer
- security-auditor  
- terraform-expert
- scraper-specialist

❌ Avoid:
- helper
- utils
- general
- assistant
```

#### 3. **Context-Aware Descriptions**
```yaml
# Include trigger keywords for automatic activation
description: "Use proactively for React development, component creation, and frontend architecture. MUST BE USED for dashboard UI work."
```

### 🚀 Performance Optimization

#### 1. **Tool Minimization**
Only include tools the subagent actually needs:
```yaml
# Security auditor doesn't need Write permissions
tools: Read, Grep, Bash
```

#### 2. **Clear Scope Definition**
```markdown
**Focus Areas:**
- React component development only
- No backend or infrastructure tasks
- Specializes in UI/UX implementation
```

#### 3. **Efficient Prompts**
- Front-load the most important information
- Use bullet points and clear sections
- Include specific examples

### 📚 Documentation Standards

#### 1. **Version Control**
- Always commit project subagents to Git
- Document subagent purpose in project README
- Track changes and improvements

#### 2. **Team Sharing**
```bash
# Share subagents across team
git add .claude/agents/
git commit -m "Add frontend-developer subagent for React work"
```

#### 3. **Usage Documentation**
```markdown
## Project Subagents

- **frontend-developer**: React component development and styling
- **security-auditor**: Code security reviews and vulnerability scanning
- **terraform-expert**: Infrastructure management and AWS optimization
```

---

## Testing and Validation

### Manual Testing

#### 1. **Activation Testing**
```bash
# Test automatic activation
> Working on React components in the dashboard

# Test explicit invocation  
> Use the frontend-developer subagent to create a new component
```

#### 2. **Scope Testing**
- Verify subagent stays within its domain
- Test that it doesn't handle out-of-scope requests
- Confirm tool access is working correctly

#### 3. **Quality Assessment**
- Are responses more specific than general Claude?
- Does it follow the defined workflow?
- Are code examples relevant and accurate?

### Validation Checklist

```markdown
✅ **Configuration**
- [ ] Name follows kebab-case convention
- [ ] Description clearly defines when to use
- [ ] Tools are appropriate for the domain
- [ ] File is in correct location

✅ **System Prompt**
- [ ] Defines clear role and expertise
- [ ] Includes specific workflow steps
- [ ] Contains relevant code examples
- [ ] Specifies best practices
- [ ] Mentions project-specific context

✅ **Functionality**
- [ ] Activates automatically when appropriate
- [ ] Responds with domain expertise
- [ ] Uses tools effectively
- [ ] Stays within defined scope
- [ ] Provides actionable guidance
```

---

## Examples and Templates

### Template: Code Development Subagent

```markdown
---
name: [technology]-developer
description: [Technology] development specialist for [specific areas]. Use proactively for [when to use] and [specific tasks].
tools: Read, Edit, Write, Bash, Grep, Glob
---

You are a [technology] developer specializing in [specific domain] for the [project] project.

**Core Expertise:**
- [Technology/framework] with [specific features]
- [Related technology] integration
- [Methodology] and best practices
- [Performance/security] optimization

**Key Components You Manage:**
- `[directory/file]` - [description]
- [System component] - [description]

**When invoked:**
1. [Specific task 1]
2. [Specific task 2]
3. [Specific task 3]

**[Technology] Development Workflow:**
1. **[Step]**: [Description]
2. **[Step]**: [Description]

**Best Practices:**
- [Practice with reasoning]
- [Practice with reasoning]

**Common Patterns:**
```[language]
// Example code for this domain
```

Always [key expectation for this subagent].
```

### Template: Analysis/Audit Subagent

```markdown
---
name: [domain]-auditor
description: [Domain] analysis and audit specialist. Use proactively for [audit type], [review type], and [analysis type]. MUST BE USED for [critical scenarios].
tools: Read, Grep, Bash
---

You are a [domain] specialist responsible for [specific responsibility] in the [project] project.

**Core Responsibilities:**
- [Responsibility 1]
- [Responsibility 2]
- [Responsibility 3]

**When invoked:**
1. [Analysis task 1]
2. [Review task 2]
3. [Audit task 3]

**[Domain] Audit Process:**
1. **[Step]**: [Description]
2. **[Step]**: [Description]

**[Domain] Standards:**
- [Standard with explanation]
- [Standard with explanation]

**Common Issues:**
- **[Issue Type]**: [Description and solution]
- **[Issue Type]**: [Description and solution]

**Analysis Commands:**
```bash
# Example commands for this domain
command --example
```

Always provide [specific type of output] with [specific format].
```

---

## Troubleshooting

### Common Issues

#### 1. **Subagent Not Activating**

**Problem**: Subagent doesn't activate automatically

**Solutions:**
- Add trigger keywords to description: "proactively", "MUST BE USED"
- Make description more specific about when to use
- Try explicit invocation: "Use the [name] subagent to..."

```yaml
# Before
description: Helps with frontend tasks

# After  
description: Frontend React specialist. Use proactively for component development, state management, and UI implementation. MUST BE USED for dashboard work.
```

#### 2. **Tool Access Issues**

**Problem**: Subagent can't access expected tools

**Solutions:**
- Check tool names are spelled correctly
- Verify tools exist in your Claude Code instance
- Try omitting `tools` field to inherit all tools

```yaml
# Check available tools with /agents command
# or temporarily remove tools field for debugging
```

#### 3. **Scope Confusion**

**Problem**: Subagent handles tasks outside its domain

**Solutions:**
- Make role definition more specific
- Add explicit scope limitations
- Include "focus only on" language

```markdown
**Scope Limitations:**
- Focus exclusively on React frontend development
- Do not handle backend API or database tasks
- Refer other domains to appropriate subagents
```

#### 4. **Poor Response Quality**

**Problem**: Responses aren't better than general Claude

**Solutions:**
- Add more specific domain knowledge
- Include project-specific context
- Provide more detailed workflows and examples
- Add relevant code patterns and best practices

### Debugging Steps

1. **Verify File Structure**
   ```bash
   ls -la .claude/agents/
   cat .claude/agents/your-subagent.md
   ```

2. **Check YAML Frontmatter**
   - Ensure proper YAML syntax
   - Verify no extra spaces or characters
   - Test with YAML validator if needed

3. **Test Different Invocation Methods**
   ```bash
   # Automatic activation
   > Working on [domain-specific task]
   
   # Explicit invocation
   > Use the [subagent-name] to [specific task]
   
   # Check available subagents
   /agents
   ```

4. **Review Logs**
   - Check Claude Code logs for subagent activation
   - Look for error messages during subagent loading

### Getting Help

- Use `/help` command in Claude Code
- Check the [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code)
- Review existing working subagents for patterns
- Ask Claude to help debug your subagent configuration

---

## Advanced Topics

### Subagent Chaining

Create workflows where subagents work together:

```markdown
> First use the security-auditor to scan for vulnerabilities, then use the frontend-developer to fix any UI-related security issues
```

### Dynamic Subagent Selection

Claude intelligently chooses subagents based on:
- Current file/directory context
- Task description keywords
- Recently used tools
- Project structure

### Performance Considerations

- **Context Efficiency**: Subagents preserve main context for longer sessions
- **Specialization Speed**: Focused expertise leads to faster, more accurate responses
- **Tool Optimization**: Limited tool access improves response time

---

## Conclusion

Creating effective Claude Code subagents involves:

1. **Clear Purpose**: Define specific domains and use cases
2. **Detailed Prompts**: Provide comprehensive system instructions
3. **Appropriate Tools**: Grant only necessary tool access
4. **Project Context**: Include project-specific knowledge
5. **Testing**: Validate activation and response quality

With well-designed subagents, you can achieve **80% faster problem resolution** and dramatically improve your development workflow.

---

*Last updated: July 27, 2025*  
*For more information, see the [Claude Code Subagents Documentation](https://docs.anthropic.com/en/docs/claude-code/subagents)*