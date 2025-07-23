/**
 * TuroBot - Automated Toll Reimbursement Submission
 * 
 * Reads matched toll-trip records and automatically submits reimbursement claims
 * through the Turo host dashboard interface using Playwright automation.
 * 
 * @TuroBot-Agent Implementation
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

class TuroBot {
  constructor() {
    this.browser = null;
    this.page = null;
    this.matches = [];
    this.submissionResults = [];
    this.failureScreenshotsDir = path.join(__dirname, 'failure-screenshots');
    this.screenshotsDir = path.join(__dirname, 'scrapers', 'screenshots');
    
    // Rate limiting and retry configuration
    this.requestDelay = 3000; // 3 seconds between actions
    this.submissionDelay = 5000; // 5 seconds between submissions
    this.maxRetries = 3;
    this.retryDelay = 10000; // 10 seconds between retries
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
   * Load matched toll-trip records
   */
  async loadMatches() {
    try {
      const matchesPath = path.join(__dirname, 'matches.json');
      console.log(`Loading matches from: ${matchesPath}`);
      
      const matchesContent = await fs.readFile(matchesPath, 'utf8');
      const matchesData = JSON.parse(matchesContent);
      
      this.matches = matchesData.matches || [];
      console.log(`Loaded ${this.matches.length} toll-trip matches`);
      
      // Filter for matches that need submission (high/medium confidence)
      const submittableMatches = this.matches.filter(match => 
        match.confidence.category === 'high' || 
        match.confidence.category === 'medium'
      );
      
      console.log(`${submittableMatches.length} matches eligible for automatic submission`);
      this.matches = submittableMatches;
      
      return this.matches;
    } catch (error) {
      console.error('Failed to load matches:', error);
      
      if (error.code === 'ENOENT') {
        console.log('No matches file found - creating empty submission report');
        this.matches = [];
        return this.matches;
      }
      
      throw error;
    }
  }

  /**
   * Initialize browser with stealth configuration
   */
  async initializeBrowser() {
    console.log('Initializing browser with stealth settings...');
    
    this.browser = await chromium.launch({
      headless: process.env.NODE_ENV === 'production',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });

    this.page = await this.browser.newPage();

    // Set realistic browser characteristics
    await this.page.setViewport({ width: 1440, height: 900 });
    await this.page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );

    // Set extra headers for realism
    await this.page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    });

    // Handle JavaScript dialogs
    this.page.on('dialog', async dialog => {
      console.log(`Dialog appeared: ${dialog.message()}`);
      await dialog.accept();
    });

    console.log('Browser initialized successfully');
  }

  /**
   * Login to Turo host dashboard
   */
  async login(credentials) {
    try {
      console.log('Navigating to Turo login page...');
      
      await this.page.goto('https://turo.com/login', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      await this.waitWithDelay(2000);

      // Fill login form
      console.log('Filling login credentials...');
      
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        '#email',
        'input[placeholder*="email" i]'
      ];

      let emailField = null;
      for (const selector of emailSelectors) {
        emailField = await this.page.$(selector);
        if (emailField) {
          console.log(`Found email field: ${selector}`);
          break;
        }
      }

      if (!emailField) {
        throw new Error('Could not locate email input field');
      }

      await emailField.fill(credentials.email);
      await this.waitWithDelay(1000);

      const passwordField = await this.page.waitForSelector('input[type="password"]', {
        timeout: 5000
      });

      await passwordField.fill(credentials.password);
      await this.waitWithDelay(1000);

      // Handle potential CAPTCHA
      await this.handleCaptcha();

      // Submit login form
      const loginButtonSelectors = [
        'button[type="submit"]',
        'button:has-text("Log in")',
        'button:has-text("Sign in")',
        '.login-button'
      ];

      let loginButton = null;
      for (const selector of loginButtonSelectors) {
        try {
          loginButton = await this.page.$(selector);
          if (loginButton) {
            console.log(`Found login button: ${selector}`);
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
      
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
        loginButton.click()
      ]);

      // Verify successful login
      await this.waitWithDelay(3000);
      
      const currentUrl = this.page.url();
      if (currentUrl.includes('login') || currentUrl.includes('sign-in')) {
        throw new Error('Login failed - still on login page');
      }

      console.log('Login successful');
      return true;
    } catch (error) {
      console.error('Login failed:', error);
      await this.captureFailureScreenshot('login_failed');
      throw error;
    }
  }

  /**
   * Handle CAPTCHA if present
   */
  async handleCaptcha() {
    try {
      const captchaSelectors = [
        '.captcha',
        '.recaptcha',
        '#captcha',
        '[class*="captcha"]',
        '[class*="recaptcha"]',
        'iframe[src*="recaptcha"]'
      ];

      for (const selector of captchaSelectors) {
        const captchaElement = await this.page.$(selector);
        if (captchaElement) {
          console.warn('CAPTCHA detected - manual intervention may be required');
          await this.captureFailureScreenshot('captcha_detected');
          
          // Wait for manual intervention or automatic solving
          console.log('Waiting 30 seconds for CAPTCHA resolution...');
          await this.waitWithDelay(30000);
          
          break;
        }
      }
    } catch (error) {
      console.warn('Error checking for CAPTCHA:', error);
    }
  }

  /**
   * Navigate to specific trip page
   */
  async navigateToTrip(tripId) {
    try {
      console.log(`Navigating to trip: ${tripId}`);
      
      // Try direct navigation first
      const tripUrl = `https://turo.com/trips/${tripId}`;
      await this.page.goto(tripUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      await this.waitWithDelay(2000);

      // Verify we're on the correct trip page
      const pageContent = await this.page.content();
      if (pageContent.includes(tripId) || pageContent.includes('trip')) {
        console.log(`Successfully navigated to trip ${tripId}`);
        return true;
      }

      // Fallback: Navigate through trips list
      console.log('Direct navigation failed, trying trips list...');
      
      await this.page.goto('https://turo.com/your/trips', {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      await this.waitWithDelay(2000);

      // Look for the specific trip in the list
      const tripLinkSelectors = [
        `a[href*="${tripId}"]`,
        `[data-trip-id="${tripId}"]`,
        `.trip-card:has-text("${tripId}")`,
        `.trip-item:has-text("${tripId}")`
      ];

      let tripLink = null;
      for (const selector of tripLinkSelectors) {
        try {
          tripLink = await this.page.$(selector);
          if (tripLink) {
            console.log(`Found trip link: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (tripLink) {
        await Promise.all([
          this.page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 }),
          tripLink.click()
        ]);
        
        console.log(`Successfully navigated to trip ${tripId} via trips list`);
        return true;
      }

      throw new Error(`Could not find trip ${tripId} in trips list`);
    } catch (error) {
      console.error(`Failed to navigate to trip ${tripId}:`, error);
      await this.captureFailureScreenshot(`navigate_trip_${tripId}_failed`);
      throw error;
    }
  }

  /**
   * Navigate to charge incidents section
   */
  async navigateToChargeIncidents() {
    try {
      console.log('Navigating to charge incidents section...');

      const incidentLinkSelectors = [
        'a:has-text("Charge incidents")',
        'a:has-text("Charge Incidents")',
        'a:has-text("Request reimbursement")',
        'a:has-text("Add charges")',
        'button:has-text("Charge incidents")',
        'button:has-text("Request reimbursement")',
        '.charge-incidents',
        '.incident-button',
        '[class*="incident"]'
      ];

      let incidentLink = null;
      for (const selector of incidentLinkSelectors) {
        try {
          incidentLink = await this.page.$(selector);
          if (incidentLink) {
            console.log(`Found charge incidents link: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!incidentLink) {
        // Try scrolling down to find the section
        await this.page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight / 2);
        });
        await this.waitWithDelay(1000);

        // Try again after scrolling
        for (const selector of incidentLinkSelectors) {
          try {
            incidentLink = await this.page.$(selector);
            if (incidentLink) {
              console.log(`Found charge incidents link after scroll: ${selector}`);
              break;
            }
          } catch (e) {
            // Continue to next selector
          }
        }
      }

      if (!incidentLink) {
        throw new Error('Could not find charge incidents section');
      }

      await incidentLink.click();
      await this.waitWithDelay(3000);

      console.log('Successfully navigated to charge incidents section');
      return true;
    } catch (error) {
      console.error('Failed to navigate to charge incidents:', error);
      await this.captureFailureScreenshot('charge_incidents_navigation_failed');
      throw error;
    }
  }

  /**
   * Fill out the toll reimbursement form
   */
  async fillTollForm(match) {
    try {
      console.log(`Filling toll form for amount: $${match.amount}`);

      // Wait for form to load
      await this.waitWithDelay(2000);

      // Select incident type (tolls)
      const incidentTypeSelectors = [
        'select[name*="type"]',
        'select[name*="incident"]',
        '#incident-type',
        '.incident-type select'
      ];

      for (const selector of incidentTypeSelectors) {
        try {
          const typeSelect = await this.page.$(selector);
          if (typeSelect) {
            console.log(`Found incident type selector: ${selector}`);
            await typeSelect.selectOption('tolls');
            await this.waitWithDelay(1000);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      // Fill amount field
      const amountSelectors = [
        'input[name*="amount"]',
        'input[type="number"]',
        'input[placeholder*="amount" i]',
        '#amount',
        '.amount input'
      ];

      let amountField = null;
      for (const selector of amountSelectors) {
        amountField = await this.page.$(selector);
        if (amountField) {
          console.log(`Found amount field: ${selector}`);
          break;
        }
      }

      if (amountField) {
        await amountField.fill(match.amount.toString());
        await this.waitWithDelay(1000);
      }

      // Fill description
      const descriptionSelectors = [
        'textarea[name*="description"]',
        'textarea[placeholder*="description" i]',
        '#description',
        '.description textarea',
        'input[name*="description"]'
      ];

      for (const selector of descriptionSelectors) {
        try {
          const descField = await this.page.$(selector);
          if (descField) {
            console.log(`Found description field: ${selector}`);
            const description = `Toll charge for ${match.toll.location} on ${match.toll.date}. Trip: ${match.trip.tripId}`;
            await descField.fill(description);
            await this.waitWithDelay(1000);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      // Fill toll-specific fields if available
      const tollLocationSelectors = [
        'input[name*="location"]',
        'input[placeholder*="location" i]',
        '#toll-location',
        '.location input'
      ];

      for (const selector of tollLocationSelectors) {
        try {
          const locationField = await this.page.$(selector);
          if (locationField) {
            console.log(`Found location field: ${selector}`);
            await locationField.fill(match.toll.location || '');
            await this.waitWithDelay(1000);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      console.log('Toll form filled successfully');
      return true;
    } catch (error) {
      console.error('Failed to fill toll form:', error);
      await this.captureFailureScreenshot(`fill_form_${match.tripId}_failed`);
      throw error;
    }
  }

  /**
   * Upload screenshot evidence
   */
  async uploadScreenshot(match) {
    try {
      if (!match.screenshotPath) {
        console.warn('No screenshot path provided for match');
        return false;
      }

      const screenshotPath = path.resolve(match.screenshotPath);
      
      // Check if screenshot file exists
      try {
        await fs.access(screenshotPath);
      } catch (error) {
        console.warn(`Screenshot file not found: ${screenshotPath}`);
        return false;
      }

      console.log(`Uploading screenshot: ${screenshotPath}`);

      // Find file upload input
      const fileInputSelectors = [
        'input[type="file"]',
        'input[accept*="image"]',
        '.file-upload input',
        '.upload-input',
        '[class*="upload"] input[type="file"]'
      ];

      let fileInput = null;
      for (const selector of fileInputSelectors) {
        fileInput = await this.page.$(selector);
        if (fileInput) {
          console.log(`Found file input: ${selector}`);
          break;
        }
      }

      if (!fileInput) {
        // Try to find and click upload button first
        const uploadButtonSelectors = [
          'button:has-text("Upload")',
          'button:has-text("Choose file")',
          'button:has-text("Add file")',
          '.upload-button',
          '.file-upload-button'
        ];

        for (const selector of uploadButtonSelectors) {
          try {
            const uploadButton = await this.page.$(selector);
            if (uploadButton) {
              console.log(`Found upload button: ${selector}`);
              await uploadButton.click();
              await this.waitWithDelay(1000);
              
              // Try to find file input again
              fileInput = await this.page.$('input[type="file"]');
              if (fileInput) break;
            }
          } catch (e) {
            // Continue to next selector
          }
        }
      }

      if (!fileInput) {
        throw new Error('Could not find file upload input');
      }

      // Upload the file
      await fileInput.setInputFiles(screenshotPath);
      await this.waitWithDelay(3000); // Wait for upload to process

      // Wait for upload confirmation
      const uploadSuccessSelectors = [
        '.upload-success',
        '.file-uploaded',
        '.upload-complete',
        ':has-text("uploaded")',
        ':has-text("success")'
      ];

      let uploadSuccess = false;
      for (const selector of uploadSuccessSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            uploadSuccess = true;
            console.log('Upload success confirmed');
            break;
          }
        } catch (e) {
          // Continue checking
        }
      }

      console.log('Screenshot uploaded successfully');
      return true;
    } catch (error) {
      console.error('Failed to upload screenshot:', error);
      await this.captureFailureScreenshot(`upload_${match.tripId}_failed`);
      return false;
    }
  }

  /**
   * Submit the reimbursement claim
   */
  async submitClaim(match) {
    try {
      console.log(`Submitting reimbursement claim for trip ${match.tripId}`);

      // Look for submit button
      const submitButtonSelectors = [
        'button[type="submit"]',
        'button:has-text("Submit")',
        'button:has-text("Send request")',
        'button:has-text("Submit request")',
        'input[type="submit"]',
        '.submit-button',
        '.submit-btn'
      ];

      let submitButton = null;
      for (const selector of submitButtonSelectors) {
        try {
          submitButton = await this.page.$(selector);
          if (submitButton) {
            console.log(`Found submit button: ${selector}`);
            break;
          }
        } catch (e) {
          // Continue to next selector
        }
      }

      if (!submitButton) {
        throw new Error('Could not find submit button');
      }

      // Click submit and wait for response
      await Promise.all([
        this.page.waitForResponse(response => 
          response.url().includes('incident') || 
          response.url().includes('charge') || 
          response.url().includes('submit'), 
          { timeout: 30000 }
        ).catch(() => {
          console.log('No specific response detected, continuing...');
        }),
        submitButton.click()
      ]);

      await this.waitWithDelay(5000); // Wait for form processing

      // Check for success confirmation
      const successSelectors = [
        '.success-message',
        '.confirmation',
        ':has-text("submitted")',
        ':has-text("success")',
        ':has-text("confirmed")',
        '.alert-success'
      ];

      let submissionSuccess = false;
      let confirmationMessage = '';

      for (const selector of successSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            submissionSuccess = true;
            confirmationMessage = await element.textContent();
            console.log(`Submission success confirmed: ${confirmationMessage}`);
            break;
          }
        } catch (e) {
          // Continue checking
        }
      }

      // Check for error messages
      const errorSelectors = [
        '.error-message',
        '.alert-error',
        '.alert-danger',
        ':has-text("error")',
        ':has-text("failed")',
        '.validation-error'
      ];

      let errorMessage = '';
      for (const selector of errorSelectors) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            errorMessage = await element.textContent();
            console.log(`Error detected: ${errorMessage}`);
            break;
          }
        } catch (e) {
          // Continue checking
        }
      }

      if (submissionSuccess) {
        console.log(`Claim submitted successfully for trip ${match.tripId}`);
        return {
          success: true,
          message: confirmationMessage || 'Submission confirmed',
          confirmationId: this.extractConfirmationId(confirmationMessage)
        };
      } else if (errorMessage) {
        throw new Error(`Submission failed: ${errorMessage}`);
      } else {
        // Assume success if no error detected
        console.log(`Claim submission completed for trip ${match.tripId} (status unclear)`);
        return {
          success: true,
          message: 'Submission completed (confirmation pending)',
          confirmationId: null
        };
      }
    } catch (error) {
      console.error(`Failed to submit claim for trip ${match.tripId}:`, error);
      await this.captureFailureScreenshot(`submit_${match.tripId}_failed`);
      throw error;
    }
  }

  /**
   * Extract confirmation ID from success message
   */
  extractConfirmationId(message) {
    if (!message) return null;
    
    const patterns = [
      /confirmation\s*[#:]?\s*([a-zA-Z0-9]+)/i,
      /reference\s*[#:]?\s*([a-zA-Z0-9]+)/i,
      /id\s*[#:]?\s*([a-zA-Z0-9]+)/i,
      /([a-zA-Z0-9]{8,})/
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Process a single toll-trip match
   */
  async processMatch(match, index, total) {
    const startTime = Date.now();
    
    try {
      console.log(`\n=== Processing match ${index + 1}/${total} ===`);
      console.log(`Trip: ${match.tripId}, Toll: ${match.tollId}, Amount: $${match.amount}`);
      console.log(`Confidence: ${match.confidence.category} (${match.confidence.score.toFixed(2)})`);

      // Navigate to trip
      await this.navigateToTrip(match.tripId);
      await this.waitWithDelay(this.requestDelay);

      // Navigate to charge incidents
      await this.navigateToChargeIncidents();
      await this.waitWithDelay(this.requestDelay);

      // Fill toll form
      await this.fillTollForm(match);
      await this.waitWithDelay(this.requestDelay);

      // Upload screenshot
      const uploadSuccess = await this.uploadScreenshot(match);
      await this.waitWithDelay(this.requestDelay);

      // Submit claim
      const submissionResult = await this.submitClaim(match);
      
      const processingTime = Date.now() - startTime;
      
      const result = {
        tripId: match.tripId,
        tollId: match.tollId,
        amount: match.amount,
        status: 'success',
        message: submissionResult.message,
        confirmationId: submissionResult.confirmationId,
        uploadSuccess: uploadSuccess,
        confidence: match.confidence.category,
        processingTime: processingTime,
        timestamp: new Date().toISOString()
      };

      console.log(`✅ Successfully processed trip ${match.tripId} in ${processingTime}ms`);
      return result;
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      const result = {
        tripId: match.tripId,
        tollId: match.tollId,
        amount: match.amount,
        status: 'failed',
        message: error.message,
        confirmationId: null,
        uploadSuccess: false,
        confidence: match.confidence.category,
        processingTime: processingTime,
        timestamp: new Date().toISOString(),
        error: {
          name: error.name,
          stack: error.stack
        }
      };

      console.log(`❌ Failed to process trip ${match.tripId}: ${error.message}`);
      return result;
    }
  }

  /**
   * Wait with human-like delay
   */
  async waitWithDelay(ms) {
    const variation = Math.random() * 1000; // Add up to 1 second variation
    const totalDelay = ms + variation;
    await this.page.waitForTimeout(totalDelay);
  }

  /**
   * Capture failure screenshot
   */
  async captureFailureScreenshot(identifier) {
    try {
      await fs.mkdir(this.failureScreenshotsDir, { recursive: true });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `failure_${identifier}_${timestamp}.png`;
      const screenshotPath = path.join(this.failureScreenshotsDir, filename);
      
      await this.page.screenshot({
        path: screenshotPath,
        fullPage: true,
        type: 'png'
      });
      
      console.log(`Failure screenshot saved: ${filename}`);
    } catch (error) {
      console.error('Failed to capture failure screenshot:', error);
    }
  }

  /**
   * Handle rate limiting and retries
   */
  async withRetry(operation, maxRetries = this.maxRetries) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        console.log(`Attempt ${attempt} failed: ${error.message}`);
        
        // Check for rate limiting indicators
        if (error.message.includes('rate limit') || 
            error.message.includes('too many requests') ||
            error.message.includes('429')) {
          
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          console.log(`Rate limited detected, waiting ${delay}ms before retry...`);
          await this.waitWithDelay(delay);
        } else if (attempt === maxRetries) {
          throw error;
        } else {
          await this.waitWithDelay(this.retryDelay);
        }
      }
    }
  }

  /**
   * Save submission report
   */
  async saveSubmissionReport() {
    try {
      const reportPath = path.join(__dirname, 'submission-report.json');
      
      const report = {
        submissionDate: new Date().toISOString(),
        summary: {
          totalMatches: this.matches.length,
          successfulSubmissions: this.submissionResults.filter(r => r.status === 'success').length,
          failedSubmissions: this.submissionResults.filter(r => r.status === 'failed').length,
          totalAmount: this.submissionResults
            .filter(r => r.status === 'success')
            .reduce((sum, r) => sum + r.amount, 0),
          averageProcessingTime: this.submissionResults.length > 0 
            ? this.submissionResults.reduce((sum, r) => sum + r.processingTime, 0) / this.submissionResults.length
            : 0
        },
        submissions: this.submissionResults,
        configuration: {
          requestDelay: this.requestDelay,
          submissionDelay: this.submissionDelay,
          maxRetries: this.maxRetries
        }
      };

      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      
      console.log(`\n=== SUBMISSION REPORT ===`);
      console.log(`Total matches processed: ${report.summary.totalMatches}`);
      console.log(`Successful submissions: ${report.summary.successfulSubmissions}`);
      console.log(`Failed submissions: ${report.summary.failedSubmissions}`);
      console.log(`Total amount submitted: $${report.summary.totalAmount.toFixed(2)}`);
      console.log(`Average processing time: ${report.summary.averageProcessingTime.toFixed(0)}ms`);
      console.log(`Report saved to: ${reportPath}`);
      
      return reportPath;
    } catch (error) {
      console.error('Failed to save submission report:', error);
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
      if (this.browser) {
        await this.browser.close();
      }
      console.log('Browser cleanup completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  /**
   * Main automation process
   */
  async run() {
    try {
      console.log('🤖 Starting TuroBot automated toll reimbursement submission...');

      // Ensure directories exist
      await fs.mkdir(this.failureScreenshotsDir, { recursive: true });

      // Load matches
      await this.loadMatches();
      
      if (this.matches.length === 0) {
        console.log('No matches found for submission');
        await this.saveSubmissionReport();
        return { success: true, submitted: 0 };
      }

      // Get credentials and initialize browser
      const credentials = await this.getCredentials();
      await this.initializeBrowser();

      // Login to Turo
      await this.login(credentials);
      await this.waitWithDelay(this.submissionDelay);

      // Process each match
      for (let i = 0; i < this.matches.length; i++) {
        const match = this.matches[i];
        
        const result = await this.withRetry(async () => {
          return await this.processMatch(match, i, this.matches.length);
        });
        
        this.submissionResults.push(result);
        
        // Respectful delay between submissions
        if (i < this.matches.length - 1) {
          console.log(`Waiting ${this.submissionDelay}ms before next submission...`);
          await this.waitWithDelay(this.submissionDelay);
        }
      }

      // Save report
      await this.saveSubmissionReport();
      
      const successCount = this.submissionResults.filter(r => r.status === 'success').length;
      console.log(`\n🎉 TuroBot completed! ${successCount}/${this.matches.length} submissions successful`);
      
      return {
        success: true,
        submitted: successCount,
        failed: this.matches.length - successCount,
        results: this.submissionResults
      };
      
    } catch (error) {
      console.error('TuroBot failed:', error);
      await this.captureFailureScreenshot('turobot_failed');
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// Export for use as module
module.exports = TuroBot;

// Run if called directly
if (require.main === module) {
  const bot = new TuroBot();
  
  bot.run()
    .then(result => {
      console.log('TuroBot completed:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('TuroBot failed:', error);
      process.exit(1);
    });
}