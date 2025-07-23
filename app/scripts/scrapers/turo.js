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
    try {
      console.log('Navigating to Turo login page...');
      
      // Navigate to login page
      await this.page.goto('https://turo.com/login', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      console.log('Login page loaded, waiting for form elements...');

      // Wait for login form elements with expanded selectors and longer timeout
      console.log('Waiting for email input field...');
      await this.page.waitForSelector(
        'input#emailAddress, input[name="emailAddress"], input[type="email"]',
        { timeout: 20000 }
      );

      console.log('Email field found, filling credentials...');

      // Fill email field using expanded selectors
      await this.page.fill(
        'input#emailAddress, input[name="emailAddress"], input[type="email"]',
        credentials.email
      );

      console.log('Email filled, waiting for password field...');
      await this.page.waitForTimeout(1000); // Human-like delay

      // Fill password field using expanded selectors
      console.log('Filling password field...');
      await this.page.fill(
        'input[name="password"], #login_password, input[type="password"]',
        credentials.password
      );

      console.log('Password filled, waiting for submit button...');
      await this.page.waitForTimeout(1000);

      // Wait for and click the submit button with expanded selectors
      console.log('Waiting for login submit button...');
      await this.page.waitForSelector(
        'button[type="submit"], button[data-testid="login-button"], button:has-text("Log in"), button:has-text("Sign in")',
        { timeout: 10000 }
      );

      console.log('Submit button found, clicking to login...');
      await this.page.click(
        'button[type="submit"], button[data-testid="login-button"], button:has-text("Log in"), button:has-text("Sign in")'
      );

      console.log('Login form submitted, waiting for dashboard...');

      // Wait for post-login dashboard elements to confirm success
      console.log('Waiting for dashboard elements to appear...');
      await this.page.waitForSelector(
        '.host-dashboard, a[href*="/trips"], .dashboard, [class*="host"]',
        { timeout: 20000 }
      );

      console.log('Dashboard elements found - login successful!');
      return true;

    } catch (error) {
      console.error('Login failed with error:', error.message);
      
      // Take screenshot for debugging
      try {
        const screenshotPath = path.join(this.screenshotsDir, `turo_login_error_${Date.now()}.png`);
        await this.page.screenshot({
          path: screenshotPath,
          fullPage: true
        });
        console.log(`Debug screenshot saved: ${screenshotPath}`);
      } catch (screenshotError) {
        console.error('Failed to take error screenshot:', screenshotError.message);
      }
      
      throw new Error('Login failed: ' + error.message);
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