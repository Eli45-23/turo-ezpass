/**
 * E-ZPass NY Portal Scraper
 * 
 * Logs into the E-ZPass NY portal and scrapes toll records from the past 7 days.
 * Uses Playwright for browser automation and AWS Secrets Manager for credentials.
 * 
 * @Scraper-Agent Implementation
 */

const { chromium } = require('playwright');
const AWS = require('aws-sdk');
const fs = require('fs').promises;
const path = require('path');

// Configure AWS
AWS.config.update({
  region: process.env.AWS_REGION || 'us-east-1',
  ...(process.env.AWS_ACCESS_KEY_ID && { 
    accessKeyId: process.env.AWS_ACCESS_KEY_ID 
  }),
  ...(process.env.AWS_SECRET_ACCESS_KEY && { 
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY 
  })
});

const secretsManager = new AWS.SecretsManager();

class EZPassScraper {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.tollRecords = [];
    this.screenshotsDir = path.join(__dirname, 'screenshots');
  }

  /**
   * Get E-ZPass credentials from AWS Secrets Manager
   */
  async getCredentials() {
    try {
      const secretName = process.env.EZPASS_CREDENTIALS_SECRET_NAME || 'turo-ezpass/ezpass/credentials';
      
      console.log(`Retrieving E-ZPass credentials from AWS Secrets Manager: ${secretName}`);
      
      const result = await secretsManager.getSecretValue({
        SecretId: secretName
      }).promise();

      const credentials = JSON.parse(result.SecretString);
      
      if (!credentials.username || !credentials.password) {
        throw new Error('Invalid credentials format - missing username or password');
      }

      return {
        username: credentials.username,
        password: credentials.password,
        state: credentials.state || 'ny'
      };
    } catch (error) {
      console.error('Failed to retrieve E-ZPass credentials:', error);
      
      // Fallback to environment variables for development
      if (process.env.EZPASS_USERNAME && process.env.EZPASS_PASSWORD) {
        console.log('Using fallback environment variable credentials');
        return {
          username: process.env.EZPASS_USERNAME,
          password: process.env.EZPASS_PASSWORD,
          state: process.env.EZPASS_STATE || 'ny'
        };
      }
      
      throw error;
    }
  }

  /**
   * Initialize browser with stealth settings
   */
  async initializeBrowser() {
    console.log('Initializing browser with stealth settings...');
    
    // Launch browser with simplified configuration
    this.browser = await chromium.launch({
      headless: true,
      slowMo: 0,
      args: [
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    // Create browser context with stealth settings
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    });

    // Create new page from context
    this.page = await this.context.newPage();

    // Block images and fonts to speed up loading
    await this.page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf}', route => route.abort());

    console.log('Browser initialized successfully');
  }

  /**
   * Login to E-ZPass NY portal
   */
  async login(credentials) {
    try {
      console.log('Navigating to E-ZPass NY login page...');
      
      // Navigate to login page
      await this.page.goto('https://www.e-zpassny.com/ezpass/sign-in', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      console.log('Login page loaded, filling credentials...');

      // Wait for login form elements
      await this.page.waitForSelector('input#userIdentifier, input[name="userIdentifier"]', {
        timeout: 10000
      });

      // Find and fill username/email field
      const usernameSelectors = [
        'input#userIdentifier',
        'input[name="userIdentifier"]',
        'input[name="username"]',
        'input[id="username"]',
        'input[type="text"]'
      ];

      let usernameField = null;
      for (const selector of usernameSelectors) {
        usernameField = await this.page.$(selector);
        if (usernameField) {
          console.log(`Found username field with selector: ${selector}`);
          break;
        }
      }

      if (!usernameField) {
        throw new Error('Could not locate username/email input field');
      }

      await usernameField.fill(credentials.username);
      await this.page.waitForTimeout(1000); // Human-like delay

      // Find and fill password field
      const passwordField = await this.page.waitForSelector('input[type="password"]', {
        timeout: 5000
      });

      await passwordField.fill(credentials.password);
      await this.page.waitForTimeout(1000);

      // Check for CAPTCHA
      const captchaElement = await this.page.$('.captcha, .recaptcha, #captcha, [class*="captcha"]');
      if (captchaElement) {
        console.warn('CAPTCHA detected - manual intervention may be required');
        // Take screenshot for manual review
        await this.page.screenshot({
          path: path.join(this.screenshotsDir, `captcha_${Date.now()}.png`),
          fullPage: true
        });
      }

      // Find and click login button
      const loginButtonSelectors = [
        'button[type="submit"]',
        'input[type="submit"]',
        'button:has-text("Sign In")',
        'button:has-text("Login")',
        '#login-submit',
        '.login-button'
      ];

      let loginButton = null;
      for (const selector of loginButtonSelectors) {
        try {
          loginButton = await this.page.$(selector);
          if (loginButton) {
            console.log(`Found login button with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!loginButton) {
        throw new Error('Could not locate login button');
      }

      console.log('Submitting login form...');

      // Submit login form and wait for navigation
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
        loginButton.click()
      ]);

      // Verify successful login by checking for dashboard elements
      const dashboardSelectors = [
        '.dashboard',
        '.account-overview',
        '.account-summary',
        '[class*="dashboard"]',
        '[class*="account"]'
      ];

      let dashboardFound = false;
      for (const selector of dashboardSelectors) {
        const element = await this.page.$(selector);
        if (element) {
          dashboardFound = true;
          console.log(`Login successful - found dashboard element: ${selector}`);
          break;
        }
      }

      if (!dashboardFound) {
        // Check if we're still on login page (login failed)
        const currentUrl = this.page.url();
        if (currentUrl.includes('sign-in') || currentUrl.includes('login')) {
          throw new Error('Login failed - still on login page');
        }
        
        console.log('Login appears successful, proceeding to account history...');
      }

      return true;
    } catch (error) {
      console.error('Login failed:', error);
      
      // Take screenshot for debugging
      await this.page.screenshot({
        path: path.join(this.screenshotsDir, `login_error_${Date.now()}.png`),
        fullPage: true
      });
      
      throw error;
    }
  }

  /**
   * Navigate to account history page
   */
  async navigateToAccountHistory() {
    try {
      console.log('Navigating to account history...');

      // Look for account history navigation links
      const historyLinkSelectors = [
        'a:has-text("Account History")',
        'a:has-text("Transaction History")',
        'a:has-text("Statements")',
        'a[href*="history"]',
        'a[href*="transactions"]',
        'a[href*="statements"]',
        '.nav-link:has-text("History")',
        '.menu-item:has-text("History")'
      ];

      let historyLink = null;
      for (const selector of historyLinkSelectors) {
        try {
          historyLink = await this.page.$(selector);
          if (historyLink) {
            console.log(`Found history link with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (historyLink) {
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
          historyLink.click()
        ]);
      } else {
        // Try direct navigation
        console.log('Direct navigation to account history page...');
        await this.page.goto('https://www.e-zpassny.com/account/history', {
          waitUntil: 'networkidle',
          timeout: 30000
        });
      }

      console.log('Successfully navigated to account history page');
      return true;
    } catch (error) {
      console.error('Failed to navigate to account history:', error);
      throw error;
    }
  }

  /**
   * Set date range filter for last 7 days
   */
  async setDateRangeFilter() {
    try {
      console.log('Setting date range filter for last 7 days...');

      const today = new Date();
      const sevenDaysAgo = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));

      const formatDate = (date) => {
        return date.toISOString().split('T')[0]; // YYYY-MM-DD format
      };

      const startDate = formatDate(sevenDaysAgo);
      const endDate = formatDate(today);

      console.log(`Date range: ${startDate} to ${endDate}`);

      // Look for date filter elements
      const startDateSelectors = [
        'input[name="start-date"]',
        'input[name="startDate"]',
        'input[id="start-date"]',
        'input[id="startDate"]',
        'input[type="date"]:first-of-type',
        '.date-picker input:first-of-type'
      ];

      const endDateSelectors = [
        'input[name="end-date"]',
        'input[name="endDate"]',
        'input[id="end-date"]',
        'input[id="endDate"]',
        'input[type="date"]:last-of-type',
        '.date-picker input:last-of-type'
      ];

      // Set start date
      let startDateField = null;
      for (const selector of startDateSelectors) {
        try {
          startDateField = await this.page.$(selector);
          if (startDateField) {
            console.log(`Found start date field: ${selector}`);
            await startDateField.fill(startDate);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      // Set end date
      let endDateField = null;
      for (const selector of endDateSelectors) {
        try {
          endDateField = await this.page.$(selector);
          if (endDateField) {
            console.log(`Found end date field: ${selector}`);
            await endDateField.fill(endDate);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      // Look for and click search/filter button
      const searchButtonSelectors = [
        'button:has-text("Search")',
        'button:has-text("Filter")',
        'button:has-text("Apply")',
        'button[type="submit"]',
        'input[type="submit"]',
        '#search-button',
        '.search-btn',
        '.filter-btn'
      ];

      let searchButton = null;
      for (const selector of searchButtonSelectors) {
        try {
          searchButton = await this.page.$(selector);
          if (searchButton) {
            console.log(`Found search button: ${selector}`);
            await searchButton.click();
            await this.page.waitForTimeout(2000); // Wait for results
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      console.log('Date range filter applied successfully');
      return true;
    } catch (error) {
      console.error('Failed to set date range filter:', error);
      // Continue without filtering - may get more data than needed
      return false;
    }
  }

  /**
   * Extract toll transaction data from the page
   */
  async extractTollTransactions() {
    try {
      console.log('Extracting toll transaction data...');

      // Wait for transaction table/list to load
      const tableSelectors = [
        '.transaction-table',
        '.transactions-list',
        '.history-table',
        'table',
        '.transaction-row',
        '.transaction-item'
      ];

      let transactionContainer = null;
      for (const selector of tableSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 5000 });
          transactionContainer = await this.page.$(selector);
          if (transactionContainer) {
            console.log(`Found transaction container: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!transactionContainer) {
        console.warn('No transaction table found - may be no transactions in date range');
        return [];
      }

      // Extract transaction data
      const transactions = await this.page.evaluate(() => {
        const extractTextContent = (element) => {
          return element ? element.textContent.trim() : '';
        };

        const parseAmount = (amountText) => {
          if (!amountText) return 0;
          const match = amountText.match(/[\d.]+/);
          return match ? parseFloat(match[0]) : 0;
        };

        const parseDate = (dateText) => {
          if (!dateText) return null;
          try {
            return new Date(dateText).toISOString().split('T')[0];
          } catch (e) {
            return dateText;
          }
        };

        // Try different table structures
        const transactions = [];

        // Method 1: Table rows
        const tableRows = document.querySelectorAll('table tbody tr, .transaction-row, .transaction-item');
        
        tableRows.forEach((row, index) => {
          const cells = row.querySelectorAll('td, .cell, .transaction-field');
          
          if (cells.length >= 3) {
            const transaction = {
              id: `TXN_${Date.now()}_${index}`,
              date: parseDate(extractTextContent(cells[0])),
              time: extractTextContent(cells[1]) || '',
              location: extractTextContent(cells[2]) || '',
              amount: parseAmount(extractTextContent(cells[3])),
              description: extractTextContent(cells[4]) || '',
              raw_data: Array.from(cells).map(cell => extractTextContent(cell))
            };
            
            // Only add if we have essential data
            if (transaction.date && transaction.amount > 0) {
              transactions.push(transaction);
            }
          }
        });

        // Method 2: Structured divs (if table approach fails)
        if (transactions.length === 0) {
          const transactionItems = document.querySelectorAll('.transaction, .toll-record, .history-item');
          
          transactionItems.forEach((item, index) => {
            const dateElement = item.querySelector('.date, .transaction-date, [class*="date"]');
            const amountElement = item.querySelector('.amount, .transaction-amount, [class*="amount"]');
            const locationElement = item.querySelector('.location, .toll-location, [class*="location"]');
            
            const transaction = {
              id: `TXN_${Date.now()}_${index}`,
              date: parseDate(extractTextContent(dateElement)),
              time: '',
              location: extractTextContent(locationElement),
              amount: parseAmount(extractTextContent(amountElement)),
              description: extractTextContent(item),
              raw_data: [extractTextContent(item)]
            };
            
            if (transaction.date && transaction.amount > 0) {
              transactions.push(transaction);
            }
          });
        }

        return transactions;
      });

      console.log(`Extracted ${transactions.length} toll transactions`);
      
      // Filter for last 7 days (client-side filtering as backup)
      const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
      const filteredTransactions = transactions.filter(transaction => {
        if (!transaction.date) return false;
        const transactionDate = new Date(transaction.date);
        return transactionDate >= sevenDaysAgo;
      });

      console.log(`Filtered to ${filteredTransactions.length} transactions from last 7 days`);
      
      this.tollRecords = filteredTransactions;
      return filteredTransactions;
    } catch (error) {
      console.error('Failed to extract toll transactions:', error);
      throw error;
    }
  }

  /**
   * Take screenshots for each toll record
   */
  async takeScreenshots() {
    try {
      console.log('Taking screenshots for toll records...');

      // Ensure screenshots directory exists
      await fs.mkdir(this.screenshotsDir, { recursive: true });

      for (let i = 0; i < this.tollRecords.length; i++) {
        const record = this.tollRecords[i];
        
        try {
          // Take a screenshot of the current page state
          const screenshotPath = path.join(
            this.screenshotsDir, 
            `ezpass_toll_${record.id}_${Date.now()}.png`
          );

          await this.page.screenshot({
            path: screenshotPath,
            fullPage: true,
            type: 'png'
          });

          // Add screenshot path to record
          record.screenshotPath = screenshotPath;
          record.screenshotFilename = path.basename(screenshotPath);

          console.log(`Screenshot saved for transaction ${record.id}: ${record.screenshotFilename}`);

          // Small delay between screenshots
          await this.page.waitForTimeout(500);
        } catch (error) {
          console.error(`Failed to take screenshot for transaction ${record.id}:`, error);
          record.screenshotPath = null;
          record.screenshotFilename = null;
        }
      }

      console.log(`Screenshots completed for ${this.tollRecords.length} records`);
    } catch (error) {
      console.error('Failed to take screenshots:', error);
      throw error;
    }
  }

  /**
   * Save toll records to JSON file
   */
  async saveTollRecords() {
    try {
      const outputPath = path.join(__dirname, 'ezpass.json');
      
      const outputData = {
        scrapeDate: new Date().toISOString(),
        dateRange: {
          start: new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
          end: new Date().toISOString().split('T')[0]
        },
        totalRecords: this.tollRecords.length,
        records: this.tollRecords
      };

      await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2));
      
      console.log(`Toll records saved to: ${outputPath}`);
      console.log(`Total records: ${this.tollRecords.length}`);
      
      return outputPath;
    } catch (error) {
      console.error('Failed to save toll records:', error);
      throw error;
    }
  }

  /**
   * Cleanup browser resources
   */
  async cleanup() {
    try {
      if (this.page) {
        await this.page.close();
      }
      if (this.context) {
        await this.context.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
      console.log('Browser cleanup completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * Main scraping method
   */
  async scrape() {
    try {
      console.log('Starting E-ZPass NY toll scraping...');

      // Get credentials
      const credentials = await this.getCredentials();
      
      // Initialize browser
      await this.initializeBrowser();
      
      // Login
      await this.login(credentials);
      
      // Navigate to account history
      await this.navigateToAccountHistory();
      
      // Set date range filter
      await this.setDateRangeFilter();
      
      // Extract toll transactions
      await this.extractTollTransactions();
      
      // Take screenshots
      await this.takeScreenshots();
      
      // Save results
      const outputPath = await this.saveTollRecords();
      
      console.log('E-ZPass scraping completed successfully!');
      return {
        success: true,
        recordCount: this.tollRecords.length,
        outputPath: outputPath,
        records: this.tollRecords
      };
      
    } catch (error) {
      console.error('E-ZPass scraping failed:', error);
      
      // Take error screenshot
      if (this.page) {
        try {
          await this.page.screenshot({
            path: path.join(this.screenshotsDir, `error_${Date.now()}.png`),
            fullPage: true
          });
        } catch (screenshotError) {
          console.error('Failed to take error screenshot:', screenshotError);
        }
      }
      
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// Export for use as module
module.exports = EZPassScraper;

// Run if called directly
if (require.main === module) {
  const scraper = new EZPassScraper();
  
  scraper.scrape()
    .then(result => {
      console.log('Scraping completed:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Scraping failed:', error);
      process.exit(1);
    });
}