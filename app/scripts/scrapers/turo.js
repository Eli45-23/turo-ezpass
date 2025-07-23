/**
 * Turo Host Dashboard Scraper
 * 
 * Logs into the Turo host dashboard and scrapes trip data from the past 7 days.
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

class TuroScraper {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.tripData = [];
    this.screenshotsDir = path.join(__dirname, 'screenshots');
  }

  /**
   * Get Turo credentials from AWS Secrets Manager
   */
  async getCredentials() {
    try {
      const secretName = process.env.TURO_CREDENTIALS_SECRET_NAME || 'turo-ezpass/turo/credentials';
      
      console.log(`Retrieving Turo credentials from AWS Secrets Manager: ${secretName}`);
      
      const result = await secretsManager.getSecretValue({
        SecretId: secretName
      }).promise();

      const credentials = JSON.parse(result.SecretString);
      
      if (!credentials.email || !credentials.password) {
        throw new Error('Invalid credentials format - missing email or password');
      }

      return {
        email: credentials.email,
        password: credentials.password
      };
    } catch (error) {
      console.error('Failed to retrieve Turo credentials:', error);
      
      // Fallback to environment variables for development
      if (process.env.TURO_EMAIL && process.env.TURO_PASSWORD) {
        console.log('Using fallback environment variable credentials');
        return {
          email: process.env.TURO_EMAIL,
          password: process.env.TURO_PASSWORD
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
    const browser = await chromium.launch({
      headless: true,
      slowMo: 0,
      args: [
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage'
      ]
    });
    
    this.browser = browser;

    // Create browser context with stealth settings
    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    // Create new page from context
    this.page = await this.context.newPage();

    console.log('Browser initialized successfully');
  }

  /**
   * Login to Turo host dashboard
   */
  async login(credentials) {
    const { page } = this;
    const loginUrl = 'https://turo.com/login';
    const startTime = Date.now();

    try {
      // Navigate to login page
      console.log(`↗️ Navigating to Turo login page: ${loginUrl}`);
      await page.goto(loginUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 20000 
      });
      
      // Wait for page to fully render
      await page.waitForTimeout(2000);

      // Comprehensive selectors for email field
      const EMAIL_SELECTORS = [
        // ID-based
        'input#email',
        'input#emailAddress',
        'input#username',
        'input#loginEmail',
        'input#userEmail',
        // Name attribute
        'input[name="email"]',
        'input[name="emailAddress"]',
        'input[name="username"]',
        'input[name="loginEmail"]',
        'input[name="userEmail"]',
        // Type-based
        'input[type="email"]',
        // Placeholder-based
        'input[placeholder*="email" i]',
        'input[placeholder*="e-mail" i]',
        'input[placeholder*="username" i]',
        'input[placeholder*="address" i]',
        // Aria labels
        'input[aria-label*="email" i]',
        'input[aria-label*="e-mail" i]',
        'input[aria-label*="username" i]',
        // Data attributes
        'input[data-testid*="email" i]',
        'input[data-testid*="username" i]',
        'input[data-automation*="email" i]',
        // Autocomplete
        'input[autocomplete="email"]',
        'input[autocomplete="username"]',
        // Class-based
        'input[class*="email" i]',
        'input[class*="username" i]',
        // Generic text input in login form
        'form input[type="text"]:not([type="password"])',
        '#loginForm input[type="text"]',
        '.login-form input[type="text"]'
      ];
      
      const PASS_SELECTORS = [
        // ID-based
        'input#password',
        'input#pass',
        'input#pwd',
        'input#loginPassword',
        'input#userPassword',
        // Name attribute
        'input[name="password"]',
        'input[name="pass"]',
        'input[name="pwd"]',
        'input[name="loginPassword"]',
        'input[name="userPassword"]',
        // Type-based (most reliable)
        'input[type="password"]',
        // Placeholder-based
        'input[placeholder*="password" i]',
        'input[placeholder*="pass" i]',
        // Aria labels
        'input[aria-label*="password" i]',
        // Data attributes
        'input[data-testid*="password" i]',
        'input[data-automation*="password" i]',
        // Autocomplete
        'input[autocomplete="current-password"]',
        'input[autocomplete="password"]',
        // Class-based
        'input[class*="password" i]'
      ];

      // Find email field with timeout per selector
      console.log('🔍 Looking for email field...');
      let emailField = null;
      let foundEmailSelector = null;
      
      for (const selector of EMAIL_SELECTORS) {
        if (Date.now() - startTime > 15000) break; // Leave time for other operations
        
        console.log(`  Trying selector: ${selector}`);
        try {
          await page.waitForSelector(selector, { 
            timeout: 3000, 
            state: 'visible' 
          });
          emailField = await page.$(selector);
          if (emailField && await emailField.isVisible()) {
            foundEmailSelector = selector;
            console.log(`  ✅ Found email field with: ${selector}`);
            break;
          }
        } catch (e) {
          // Selector not found, continue
        }
      }
      
      if (!emailField) {
        const errorMsg = `Email field not found. Tried ${EMAIL_SELECTORS.length} selectors`;
        console.error(`❌ ${errorMsg}`);
        console.error(`Current URL: ${page.url()}`);
        console.error(`Page title: "${await page.title()}"`);
        console.error(`Tried selectors: ${EMAIL_SELECTORS.slice(0, 5).join(', ')}... (and ${EMAIL_SELECTORS.length - 5} more)`);
        
        await page.screenshot({ 
          path: path.join(this.screenshotsDir, `turo_email_not_found_${Date.now()}.png`) 
        });
        throw new Error(errorMsg);
      }

      // Find password field
      console.log('🔍 Looking for password field...');
      let passwordField = null;
      let foundPassSelector = null;
      
      for (const selector of PASS_SELECTORS) {
        if (Date.now() - startTime > 17000) break;
        
        console.log(`  Trying selector: ${selector}`);
        try {
          await page.waitForSelector(selector, { 
            timeout: 2000, 
            state: 'visible' 
          });
          passwordField = await page.$(selector);
          if (passwordField && await passwordField.isVisible()) {
            foundPassSelector = selector;
            console.log(`  ✅ Found password field with: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      if (!passwordField) {
        const errorMsg = `Password field not found. Tried ${PASS_SELECTORS.length} selectors`;
        console.error(`❌ ${errorMsg}`);
        console.error(`Current URL: ${page.url()}`);
        console.error(`Page title: "${await page.title()}"`);
        console.error(`Tried selectors: ${PASS_SELECTORS.slice(0, 5).join(', ')}... (and ${PASS_SELECTORS.length - 5} more)`);
        
        await page.screenshot({ 
          path: path.join(this.screenshotsDir, `turo_password_not_found_${Date.now()}.png`) 
        });
        throw new Error(errorMsg);
      }

      // Type credentials with human-like delays
      console.log('✏️ Filling in credentials...');
      await emailField.click();
      await page.waitForTimeout(200);
      await emailField.type(credentials.email, { delay: 120 });
      
      await page.waitForTimeout(400 + Math.random() * 300); // Random pause between fields
      
      await passwordField.click();
      await page.waitForTimeout(200);
      await passwordField.type(credentials.password, { delay: 120 });
      
      await page.waitForTimeout(600);

      // Find and click submit button
      console.log('🔍 Looking for submit button...');
      const SUBMIT_SELECTORS = [
        // Type-based
        'button[type="submit"]',
        'input[type="submit"]',
        // Text-based
        'button:has-text("Log in")',
        'button:has-text("Sign in")',
        'button:has-text("Login")',
        'button:has-text("Continue")',
        'button:has-text("Submit")',
        // Aria labels
        'button[aria-label*="log in" i]',
        'button[aria-label*="sign in" i]',
        'button[aria-label*="login" i]',
        'button[aria-label*="submit" i]',
        // Data attributes
        'button[data-testid*="login" i]',
        'button[data-testid*="submit" i]',
        'button[data-automation*="login" i]',
        // ID/class based
        '#loginButton',
        '#submitButton',
        '#loginSubmit',
        '.login-button',
        '.submit-button',
        '.btn-login',
        '.btn-primary:has-text("Log")',
        // Form buttons
        'form button:not([type="button"])',
        '#loginForm button',
        '.login-form button'
      ];
      
      let submitButton = null;
      for (const selector of SUBMIT_SELECTORS) {
        try {
          submitButton = await page.$(selector);
          if (submitButton && await submitButton.isVisible()) {
            console.log(`  ✅ Found submit button: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue
        }
      }
      
      if (!submitButton) {
        const errorMsg = `Submit button not found. Tried ${SUBMIT_SELECTORS.length} selectors`;
        console.error(`❌ ${errorMsg}`);
        await page.screenshot({ 
          path: path.join(this.screenshotsDir, `turo_submit_not_found_${Date.now()}.png`) 
        });
        throw new Error(errorMsg);
      }

      // Submit the form
      console.log('📤 Submitting login form...');
      await Promise.all([
        page.waitForNavigation({ 
          timeout: Math.max(20000 - (Date.now() - startTime), 3000), 
          waitUntil: 'networkidle' 
        }).catch(() => null), // Don't fail if navigation doesn't happen
        submitButton.click()
      ]);

      // Wait for page to settle
      await page.waitForTimeout(1500);

      // Check for 2FA/MFA
      const twoFactorSelectors = [
        'input[name="otp"]',
        'input[name="code"]',
        'input[name="verificationCode"]',
        'input[type="tel"][maxlength="6"]',
        'input[placeholder*="code" i]',
        'input[placeholder*="verification" i]',
        'input[aria-label*="code" i]',
        'input[aria-label*="verification" i]'
      ];
      
      for (const selector of twoFactorSelectors) {
        const twoFactorField = await page.$(selector);
        if (twoFactorField && await twoFactorField.isVisible()) {
          console.warn('⚠️ 2FA/MFA detected on Turo login.');
          await page.screenshot({ 
            path: path.join(this.screenshotsDir, `turo_2fa_detected_${Date.now()}.png`) 
          });
          console.log('   2FA field found - manual intervention may be required');
          break;
        }
      }

      // Verify login success
      const currentUrl = page.url();
      const pageContent = await page.content();
      
      const successIndicators = [
        'dashboard',
        'account',
        'host',
        'trips',
        'vehicles',
        'earnings',
        'messages',
        'calendar'
      ];
      
      const urlHasSuccess = successIndicators.some(indicator => 
        currentUrl.toLowerCase().includes(indicator)
      );
      
      const contentHasSuccess = successIndicators.some(indicator =>
        pageContent.toLowerCase().includes(indicator)
      );
      
      if (!urlHasSuccess && !contentHasSuccess && 
          (currentUrl.includes('login') || currentUrl.includes('signin'))) {
        console.error('❌ Login failed - still on login page');
        await page.screenshot({ 
          path: path.join(this.screenshotsDir, `turo_login_failed_${Date.now()}.png`) 
        });
        throw new Error('Turo login failed - check credentials');
      }

      console.log('✅ Turo login completed!');
      console.log(`   Final URL: ${currentUrl}`);
      return true;

    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error(`❌ Login failed after ${elapsed}ms:`, error.message);
      
      // Take final error screenshot
      try {
        const screenshotPath = path.join(this.screenshotsDir, 
          `turo_error_${error.message.replace(/[^a-z0-9]/gi, '_').substring(0, 30)}_${Date.now()}.png`
        );
        await page.screenshot({
          path: screenshotPath,
          fullPage: true
        });
        console.log(`   Screenshot saved: ${screenshotPath}`);
      } catch (screenshotError) {
        console.error('   Failed to capture screenshot:', screenshotError.message);
      }
      
      throw error;
    }
  }

  /**
   * Navigate to trips page
   */
  async navigateToTrips() {
    try {
      console.log('Navigating to trips page...');

      // Try to find trips navigation link
      const tripsLinkSelectors = [
        'a[href*="/your/trips"]',
        'a:has-text("Trips")',
        'a:has-text("Your trips")',
        '.nav-link:has-text("Trips")',
        '.menu-item:has-text("Trips")',
        'nav a:has-text("Trips")'
      ];

      let tripsLink = null;
      for (const selector of tripsLinkSelectors) {
        try {
          tripsLink = await this.page.$(selector);
          if (tripsLink) {
            console.log(`Found trips link with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (tripsLink) {
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
          tripsLink.click()
        ]);
      } else {
        // Try direct navigation
        console.log('Direct navigation to trips page...');
        await this.page.goto('https://turo.com/your/trips', {
          waitUntil: 'networkidle',
          timeout: 30000
        });
      }

      console.log('Successfully navigated to trips page');
      return true;
    } catch (error) {
      console.error('Failed to navigate to trips page:', error);
      throw error;
    }
  }

  /**
   * Apply filters for last 7 days and specific vehicle (if specified)
   */
  async applyFilters(vehicleId = null) {
    try {
      console.log('Applying filters for last 7 days...');

      // Wait for page to load
      await this.page.waitForTimeout(2000);

      // Look for filter controls
      const filterButtonSelectors = [
        'button:has-text("Filter")',
        'button:has-text("Filters")',
        '.filter-button',
        '.filters-toggle',
        '[class*="filter"]'
      ];

      let filterButton = null;
      for (const selector of filterButtonSelectors) {
        try {
          filterButton = await this.page.$(selector);
          if (filterButton) {
            console.log(`Found filter button: ${selector}`);
            await filterButton.click();
            await this.page.waitForTimeout(1000);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      // Set date range for last 7 days
      const today = new Date();
      const sevenDaysAgo = new Date(today.getTime() - (7 * 24 * 60 * 60 * 1000));

      const formatDate = (date) => {
        return date.toISOString().split('T')[0]; // YYYY-MM-DD format
      };

      const startDate = formatDate(sevenDaysAgo);
      const endDate = formatDate(today);

      console.log(`Setting date range: ${startDate} to ${endDate}`);

      // Try to set date filters
      const dateInputSelectors = [
        'input[type="date"]',
        'input[name*="date"]',
        'input[placeholder*="date" i]',
        '.date-picker input'
      ];

      const dateInputs = await this.page.$$(dateInputSelectors.join(', '));
      
      if (dateInputs.length >= 2) {
        console.log('Found date input fields, setting dates...');
        await dateInputs[0].fill(startDate); // Start date
        await dateInputs[1].fill(endDate);   // End date
      }

      // Apply vehicle filter if specified
      if (vehicleId) {
        console.log(`Applying vehicle filter: ${vehicleId}`);
        
        const vehicleSelectSelectors = [
          'select[name*="vehicle"]',
          'select[name*="car"]',
          '.vehicle-select',
          '.car-select'
        ];

        for (const selector of vehicleSelectSelectors) {
          try {
            const vehicleSelect = await this.page.$(selector);
            if (vehicleSelect) {
              await vehicleSelect.selectOption(vehicleId);
              console.log(`Vehicle filter applied: ${vehicleId}`);
              break;
            }
          } catch (e) {
            // Continue to next selector
          }
        }
      }

      // Apply filters
      const applyButtonSelectors = [
        'button:has-text("Apply")',
        'button:has-text("Search")',
        'button:has-text("Filter")',
        'button[type="submit"]'
      ];

      for (const selector of applyButtonSelectors) {
        try {
          const applyButton = await this.page.$(selector);
          if (applyButton) {
            console.log(`Applying filters with button: ${selector}`);
            await applyButton.click();
            await this.page.waitForTimeout(3000); // Wait for results
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      console.log('Filters applied successfully');
      return true;
    } catch (error) {
      console.error('Failed to apply filters:', error);
      // Continue without filters - may get more data than needed
      return false;
    }
  }

  /**
   * Extract trip data from the page
   */
  async extractTripData() {
    try {
      console.log('Extracting trip data...');

      // Wait for trip cards/items to load
      const tripSelectors = [
        '.trip-card',
        '.trip-item',
        '.trip',
        '[class*="trip"]',
        '.booking-card',
        '.booking-item'
      ];

      let tripContainer = null;
      for (const selector of tripSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 5000 });
          tripContainer = await this.page.$(selector);
          if (tripContainer) {
            console.log(`Found trip container: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!tripContainer) {
        console.warn('No trip containers found - may be no trips in date range');
        return [];
      }

      // Extract trip data using page evaluation
      const trips = await this.page.evaluate(() => {
        const extractTextContent = (element) => {
          return element ? element.textContent.trim() : '';
        };

        const parseDate = (dateText) => {
          if (!dateText) return null;
          try {
            // Handle various date formats
            const date = new Date(dateText);
            return date.toISOString();
          } catch (e) {
            return dateText;
          }
        };

        const extractTripId = (element) => {
          // Look for trip ID in various places
          const href = element.getAttribute('href') || '';
          const idMatch = href.match(/trips\/([^\/]+)/);
          if (idMatch) return idMatch[1];

          const dataId = element.getAttribute('data-trip-id') || 
                         element.getAttribute('data-id') ||
                         element.getAttribute('id');
          if (dataId) return dataId;

          // Look for trip ID in text content
          const text = element.textContent;
          const textIdMatch = text.match(/trip\s*[#:]?\s*([a-zA-Z0-9]+)/i);
          if (textIdMatch) return textIdMatch[1];

          return `TRIP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        };

        const trips = [];

        // Method 1: Trip cards/items
        const tripElements = document.querySelectorAll('.trip-card, .trip-item, .trip, [class*="trip"], .booking-card, .booking-item');
        
        tripElements.forEach((tripElement, index) => {
          try {
            // Extract trip ID
            const tripId = extractTripId(tripElement);

            // Extract guest information
            const guestNameElement = tripElement.querySelector('.guest-name, .renter-name, .user-name, [class*="guest"], [class*="renter"]');
            const guestName = extractTextContent(guestNameElement);

            // Extract vehicle information
            const vehicleElement = tripElement.querySelector('.vehicle, .car, [class*="vehicle"], [class*="car"]');
            const vehicleName = extractTextContent(vehicleElement);

            // Extract dates
            const dateElements = tripElement.querySelectorAll('.date, [class*="date"], time');
            let startDate = null;
            let endDate = null;

            if (dateElements.length >= 2) {
              startDate = parseDate(extractTextContent(dateElements[0]));
              endDate = parseDate(extractTextContent(dateElements[1]));
            } else if (dateElements.length === 1) {
              // Look for date range in single element
              const dateText = extractTextContent(dateElements[0]);
              const dateRangeMatch = dateText.match(/(.+?)\s*[-–]\s*(.+)/);
              if (dateRangeMatch) {
                startDate = parseDate(dateRangeMatch[1]);
                endDate = parseDate(dateRangeMatch[2]);
              }
            }

            // Extract status
            const statusElement = tripElement.querySelector('.status, .trip-status, [class*="status"]');
            const status = extractTextContent(statusElement) || 'unknown';

            // Extract earnings/amount
            const amountElement = tripElement.querySelector('.amount, .earnings, .price, [class*="amount"], [class*="earnings"], [class*="price"]');
            const amountText = extractTextContent(amountElement);
            const amount = amountText ? parseFloat(amountText.replace(/[^0-9.]/g, '')) || 0 : 0;

            // Extract location
            const locationElement = tripElement.querySelector('.location, .pickup, [class*="location"], [class*="pickup"]');
            const location = extractTextContent(locationElement);

            const trip = {
              tripId: tripId,
              status: status.toLowerCase(),
              guest: {
                name: guestName || 'Unknown Guest'
              },
              vehicle: {
                name: vehicleName || 'Unknown Vehicle'
              },
              dates: {
                start: startDate,
                end: endDate
              },
              location: location || 'Unknown Location',
              amount: amount,
              extractedAt: new Date().toISOString(),
              raw_data: extractTextContent(tripElement)
            };

            // Only add if we have essential data
            if (trip.tripId && (trip.dates.start || trip.dates.end)) {
              trips.push(trip);
            }
          } catch (error) {
            console.error(`Error extracting trip ${index}:`, error);
          }
        });

        return trips;
      });

      console.log(`Extracted ${trips.length} trips`);
      
      // Filter for last 7 days (client-side filtering as backup)
      const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
      const filteredTrips = trips.filter(trip => {
        if (!trip.dates.start && !trip.dates.end) return false;
        
        const tripStartDate = trip.dates.start ? new Date(trip.dates.start) : null;
        const tripEndDate = trip.dates.end ? new Date(trip.dates.end) : null;
        
        // Include trip if start or end date is within last 7 days
        return (tripStartDate && tripStartDate >= sevenDaysAgo) || 
               (tripEndDate && tripEndDate >= sevenDaysAgo);
      });

      console.log(`Filtered to ${filteredTrips.length} trips from last 7 days`);
      
      this.tripData = filteredTrips;
      return filteredTrips;
    } catch (error) {
      console.error('Failed to extract trip data:', error);
      throw error;
    }
  }

  /**
   * Save trip data to JSON file
   */
  async saveTripData() {
    try {
      const outputPath = path.join(__dirname, 'turo-trips.json');
      
      const outputData = {
        scrapeDate: new Date().toISOString(),
        dateRange: {
          start: new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
          end: new Date().toISOString().split('T')[0]
        },
        totalTrips: this.tripData.length,
        trips: this.tripData
      };

      await fs.writeFile(outputPath, JSON.stringify(outputData, null, 2));
      
      console.log(`Trip data saved to: ${outputPath}`);
      console.log(`Total trips: ${this.tripData.length}`);
      
      return outputPath;
    } catch (error) {
      console.error('Failed to save trip data:', error);
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
  async scrape(vehicleId = null) {
    try {
      console.log('Starting Turo trip scraping...');

      // Ensure screenshots directory exists
      await fs.mkdir(this.screenshotsDir, { recursive: true });

      // Get credentials
      const credentials = await this.getCredentials();
      
      // Initialize browser
      await this.initializeBrowser();
      
      // Login
      await this.login(credentials);
      
      // Navigate to trips page
      await this.navigateToTrips();
      
      // Apply filters
      await this.applyFilters(vehicleId);
      
      // Extract trip data
      await this.extractTripData();
      
      // Save results
      const outputPath = await this.saveTripData();
      
      console.log('Turo scraping completed successfully!');
      return {
        success: true,
        tripCount: this.tripData.length,
        outputPath: outputPath,
        trips: this.tripData
      };
      
    } catch (error) {
      console.error('Turo scraping failed:', error);
      
      // Take error screenshot
      if (this.page) {
        try {
          await this.page.screenshot({
            path: path.join(this.screenshotsDir, `turo_error_${Date.now()}.png`),
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
module.exports = TuroScraper;

// Run if called directly
if (require.main === module) {
  const scraper = new TuroScraper();
  
  // Get vehicle ID from command line arguments if provided
  const vehicleId = process.argv[2] || null;
  
  scraper.scrape(vehicleId)
    .then(result => {
      console.log('Scraping completed:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Scraping failed:', error);
      process.exit(1);
    });
}