#!/usr/bin/env node

/**
 * Real-time Subagent Monitor
 * Shows live subagent activity in the terminal
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🔍 Starting Subagent Monitor...\n');
console.log('📡 Watching for subagent activity in real-time');
console.log('💡 Press Ctrl+C to stop monitoring\n');
console.log('=' .repeat(60));

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

// Agent color mapping
const agentColors = {
    'scraper-specialist': colors.cyan,
    'toll-matcher': colors.green,
    'dashboard-optimizer': colors.blue,
    'data-sync-expert': colors.magenta,
    'security-auditor': colors.red,
    'ui-designer': colors.yellow,
    'ux-optimizer': colors.yellow,
    'mobile-responsive': colors.white
};

function formatTime() {
    return new Date().toLocaleTimeString();
}

function logSubagentActivity(line) {
    // Parse subagent trigger lines
    if (line.includes('🤖 Auto-triggering')) {
        const match = line.match(/🤖 Auto-triggering (\S+) for: (.+)/);
        if (match) {
            const agent = match[1];
            const description = match[2];
            const color = agentColors[agent] || colors.white;
            
            console.log(`${colors.dim}[${formatTime()}]${colors.reset} ${color}🤖 ${agent.toUpperCase()}${colors.reset}`);
            console.log(`${colors.dim}   └─${colors.reset} ${description}`);
            console.log('');
        }
    }
    
    // Parse detailed trigger info
    if (line.includes('📊 Subagent Trigger Activated:')) {
        try {
            // Try to extract JSON data if present
            const nextLineMatch = line.match(/📊 Subagent Trigger Activated: ({.+})/);
            if (nextLineMatch) {
                const data = JSON.parse(nextLineMatch[1]);
                console.log(`${colors.dim}   📊 Event: ${data.event}${colors.reset}`);
                if (data.data) {
                    Object.entries(data.data).forEach(([key, value]) => {
                        console.log(`${colors.dim}   📈 ${key}: ${value}${colors.reset}`);
                    });
                }
                console.log('');
            }
        } catch (e) {
            // Ignore JSON parsing errors
        }
    }
}

// Monitor server.log file
const logPath = path.join(__dirname, 'server.log');
const tail = spawn('tail', ['-f', logPath]);

tail.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    lines.forEach(line => {
        if (line.includes('🤖') || line.includes('📊')) {
            logSubagentActivity(line);
        }
    });
});

tail.stderr.on('data', (data) => {
    console.error(`${colors.red}Error monitoring log: ${data}${colors.reset}`);
});

tail.on('close', (code) => {
    console.log(`\n${colors.yellow}Monitor stopped with code ${code}${colors.reset}`);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log(`\n${colors.yellow}Stopping subagent monitor...${colors.reset}`);
    tail.kill();
    process.exit(0);
});

// Show initial status
console.log(`${colors.green}✅ Monitor started successfully!${colors.reset}`);
console.log(`${colors.dim}Watching: ${logPath}${colors.reset}\n`);

// Keep the process alive
setInterval(() => {
    // Show heartbeat every 30 seconds if no activity
}, 30000);