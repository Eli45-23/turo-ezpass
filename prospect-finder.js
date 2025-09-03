#!/usr/bin/env node

/**
 * Prospect Finder for NY Turo Hosts
 * 
 * This script helps identify potential beta users who are Turo hosts in New York.
 * It provides tools for research and organization, without violating any platform terms.
 * 
 * Usage: node prospect-finder.js [command]
 * Commands:
 *   - linkedin: Generate LinkedIn search URLs
 *   - facebook: Generate Facebook group search strategies  
 *   - reddit: Generate Reddit search queries
 *   - email: Generate email finder strategies
 *   - all: Show all strategies
 */

const fs = require('fs');
const path = require('path');

class ProspectFinder {
    constructor() {
        this.nyAreas = [
            'New York City', 'NYC', 'Manhattan', 'Brooklyn', 'Queens', 
            'Bronx', 'Staten Island', 'Long Island', 'Westchester',
            'White Plains', 'Yonkers', 'New Rochelle', 'Jersey City',
            'Hoboken', 'Newark', 'Buffalo', 'Rochester', 'Syracuse',
            'Albany', 'Schenectady'
        ];
        
        this.turoKeywords = [
            'Turo host', 'Turo hosting', 'car sharing', 'vehicle sharing',
            'passive income cars', 'rent my car', 'Turo business',
            'car rental business', 'side hustle cars', 'Turo fleet'
        ];
    }

    generateLinkedInSearches() {
        console.log('📍 LINKEDIN SEARCH STRATEGIES\n');
        console.log('='.repeat(50));
        
        const searches = [];
        
        // Basic searches
        this.turoKeywords.forEach(keyword => {
            this.nyAreas.slice(0, 5).forEach(area => {
                searches.push(`"${keyword}" AND "${area}"`);
            });
        });

        // Advanced searches
        searches.push('"Turo host" AND ("NYC" OR "New York" OR "Brooklyn")');
        searches.push('"passive income" AND "cars" AND ("NY" OR "New York")');
        searches.push('"side hustle" AND "Turo" AND "New York"');
        searches.push('"car sharing business" AND ("NYC" OR "New York")');

        console.log('🔍 LinkedIn Search URLs to try:');
        console.log('-'.repeat(30));
        
        searches.slice(0, 10).forEach((search, i) => {
            const encodedSearch = encodeURIComponent(search);
            const url = `https://www.linkedin.com/search/results/people/?keywords=${encodedSearch}&origin=SUGGESTION`;
            console.log(`${i + 1}. ${search}`);
            console.log(`   ${url}\n`);
        });

        console.log('💡 LinkedIn Outreach Tips:');
        console.log('- Send connection requests with personal messages');
        console.log('- Engage with their content before reaching out');
        console.log('- Focus on hosts with multiple cars/active posting');
        console.log('- Look for mentions of toll costs, EZ-Pass issues\n');

        return searches;
    }

    generateFacebookStrategies() {
        console.log('📘 FACEBOOK GROUP STRATEGIES\n');
        console.log('='.repeat(50));
        
        const groups = [
            { name: 'Turo Host Community', members: '50K+', activity: 'High' },
            { name: 'Turo Hosts United', members: '30K+', activity: 'Medium' },
            { name: 'NYC Side Hustles', members: '25K+', activity: 'High' },
            { name: 'New York Entrepreneurs', members: '40K+', activity: 'Medium' },
            { name: 'Passive Income NYC', members: '15K+', activity: 'Medium' },
            { name: 'Car Sharing Business', members: '20K+', activity: 'Low' },
            { name: 'NYC Real Estate & Business', members: '35K+', activity: 'High' }
        ];

        console.log('🎯 Target Facebook Groups:');
        console.log('-'.repeat(30));
        
        groups.forEach((group, i) => {
            console.log(`${i + 1}. ${group.name}`);
            console.log(`   Members: ${group.members} | Activity: ${group.activity}`);
            console.log(`   Strategy: ${this.getGroupStrategy(group.activity)}\n`);
        });

        console.log('🔍 Facebook Search Terms:');
        console.log('-'.repeat(30));
        console.log('Within groups, search for:');
        console.log('- "toll" OR "EZ-Pass" OR "bridge" OR "tunnel"');
        console.log('- "Turo income" OR "Turo revenue" OR "Turo profit"');
        console.log('- "New York" OR "NYC" OR "Manhattan" OR "Brooklyn"');
        console.log('- Posts mentioning specific bridges/tunnels\n');

        console.log('📝 Engagement Strategy:');
        console.log('- Join groups and observe for 1-2 weeks first');
        console.log('- Comment helpfully on 3-5 posts before posting');
        console.log('- Post during peak hours (7-9pm EST)');
        console.log('- Focus on value, not sales pitch\n');

        return groups;
    }

    getGroupStrategy(activity) {
        switch(activity) {
            case 'High': return 'Post valuable content, engage daily';
            case 'Medium': return 'Weekly engagement, helpful comments';
            case 'Low': return 'Direct messaging, less posting';
            default: return 'Observe and adapt';
        }
    }

    generateRedditStrategies() {
        console.log('🤖 REDDIT STRATEGIES\n');
        console.log('='.repeat(50));
        
        const subreddits = [
            { name: 'r/turo', members: '50K', focus: 'Primary target - active hosts' },
            { name: 'r/nyc', members: '500K', focus: 'Location-based, broad reach' },
            { name: 'r/Brooklyn', members: '200K', focus: 'High Turo activity area' },
            { name: 'r/Queens', members: '100K', focus: 'Many hosts, airport proximity' },
            { name: 'r/sidehustle', members: '800K', focus: 'Entrepreneurial mindset' },
            { name: 'r/passive_income', members: '300K', focus: 'Investment-focused' },
            { name: 'r/entrepreneur', members: '1M', focus: 'Business-minded individuals' }
        ];

        console.log('🎯 Target Subreddits:');
        console.log('-'.repeat(30));
        
        subreddits.forEach((sub, i) => {
            console.log(`${i + 1}. ${sub.name} (${sub.members} members)`);
            console.log(`   Focus: ${sub.focus}\n`);
        });

        console.log('🔍 Search Queries for Reddit:');
        console.log('-'.repeat(30));
        const redditSearches = [
            'Turo toll costs',
            'EZ-Pass Turo guest charges', 
            'NYC Turo hosting tips',
            'Turo bridge tunnel fees',
            'NY Turo host income',
            'Turo expense tracking',
            'Verrazzano bridge Turo',
            'Turo guest toll reimbursement'
        ];

        redditSearches.forEach((search, i) => {
            console.log(`${i + 1}. "${search}"`);
            console.log(`   URL: https://www.reddit.com/search/?q=${encodeURIComponent(search)}`);
        });

        console.log('\n💡 Reddit Engagement Tips:');
        console.log('- Build karma by being helpful in communities first');
        console.log('- Share genuine experiences, not sales pitches');
        console.log('- Use "fellow host" language to build rapport');
        console.log('- Offer to DM details rather than posting links\n');

        return subreddits;
    }

    generateEmailStrategies() {
        console.log('📧 EMAIL FINDER STRATEGIES\n');
        console.log('='.repeat(50));
        
        console.log('🔍 Finding Email Addresses:');
        console.log('-'.repeat(30));
        console.log('1. LinkedIn Sales Navigator (if available)');
        console.log('   - Export contacts with email addresses');
        console.log('   - Use company email patterns\n');

        console.log('2. Hunter.io / Apollo.io');
        console.log('   - Search by company domain');
        console.log('   - Verify email addresses before sending\n');

        console.log('3. Social Media Bio Links');
        console.log('   - Check Instagram/TikTok profiles');
        console.log('   - Look for business inquiries emails\n');

        console.log('4. Turo Profile Research (Manual)');
        console.log('   - Note: Only use public information');
        console.log('   - Look for business contact methods');
        console.log('   - Check for website links in profiles\n');

        console.log('📋 Email List Building Process:');
        console.log('-'.repeat(30));
        console.log('1. Identify prospects through social media');
        console.log('2. Find their business/professional email');
        console.log('3. Verify email deliverability');
        console.log('4. Segment by location and activity level');
        console.log('5. Personalize outreach based on their content\n');

        console.log('⚖️ Compliance Notes:');
        console.log('- Only use publicly available information');
        console.log('- Respect privacy and platform terms');
        console.log('- Include unsubscribe options in emails');
        console.log('- Follow CAN-SPAM Act guidelines\n');

        return {
            tools: ['Hunter.io', 'Apollo.io', 'LinkedIn Sales Navigator'],
            sources: ['LinkedIn', 'Instagram', 'Public websites', 'Business directories']
        };
    }

    generateProspectDatabase() {
        console.log('🗄️ PROSPECT DATABASE TEMPLATE\n');
        console.log('='.repeat(50));
        
        const template = {
            prospects: [
                {
                    name: "Example Host",
                    platform: "LinkedIn", 
                    location: "Brooklyn, NY",
                    email: "host@example.com",
                    cars: "3+ vehicles",
                    activity: "Active last 30 days",
                    pain_points: ["Toll costs", "Manual tracking"],
                    contact_date: "2025-01-15",
                    status: "Initial outreach sent",
                    notes: "Mentioned losing $150/month on tolls"
                }
            ]
        };

        const csvHeaders = [
            'name', 'platform', 'location', 'email', 'linkedin_url',
            'cars_count', 'activity_level', 'contact_date', 'status',
            'pain_points', 'notes', 'follow_up_date'
        ];

        const sampleRow = [
            'John Smith',
            'LinkedIn', 
            'Manhattan, NY',
            'john@example.com',
            'https://linkedin.com/in/johnsmith',
            '2-3 vehicles',
            'High',
            '2025-01-15',
            'Initial contact',
            'Toll tracking issues',
            'Responded positively to first email',
            '2025-01-20'
        ];

        console.log('📊 CSV Template Structure:');
        console.log('-'.repeat(30));
        console.log(csvHeaders.join(','));
        console.log(sampleRow.join(','));
        console.log('\n');

        // Save CSV template
        const csvContent = csvHeaders.join(',') + '\n' + sampleRow.join(',') + '\n';
        
        return { template, csvHeaders, csvContent };
    }

    saveTrackingSheet() {
        const { csvContent } = this.generateProspectDatabase();
        
        try {
            fs.writeFileSync(path.join(__dirname, 'prospect-tracking.csv'), csvContent);
            console.log('✅ Created prospect-tracking.csv template');
        } catch (error) {
            console.log('❌ Error creating CSV file:', error.message);
        }
    }

    runCommand(command) {
        console.log(`\n🚀 TURO TOLL TRACKER - BETA PROSPECT FINDER\n`);
        console.log(`Target: 5 NY Turo Host Beta Users\n`);

        switch(command) {
            case 'linkedin':
                this.generateLinkedInSearches();
                break;
            case 'facebook':
                this.generateFacebookStrategies();
                break;
            case 'reddit':
                this.generateRedditStrategies();
                break;
            case 'email':
                this.generateEmailStrategies();
                break;
            case 'database':
                this.generateProspectDatabase();
                this.saveTrackingSheet();
                break;
            case 'all':
            default:
                this.generateLinkedInSearches();
                this.generateFacebookStrategies(); 
                this.generateRedditStrategies();
                this.generateEmailStrategies();
                this.generateProspectDatabase();
                this.saveTrackingSheet();
                break;
        }

        console.log('\n📈 EXPECTED OUTCOMES:');
        console.log('='.repeat(50));
        console.log('• Week 1: Identify 50+ potential prospects');
        console.log('• Week 1-2: Initial outreach to 30+ prospects'); 
        console.log('• Week 2-3: 10+ interested conversations');
        console.log('• Week 3-4: 5 confirmed beta users');
        console.log('\n🎯 SUCCESS METRICS:');
        console.log('• 20% response rate on personalized outreach');
        console.log('• 50% interest-to-beta conversion');
        console.log('• 5 active beta users by day 21\n');
    }
}

// Command line execution
if (require.main === module) {
    const finder = new ProspectFinder();
    const command = process.argv[2] || 'all';
    finder.runCommand(command);
}