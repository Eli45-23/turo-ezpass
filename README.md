# Turo Toll Tracker Dashboard 

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node.js-18+-brightgreen.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/express.js-4.x-blue.svg)](https://expressjs.com/)
[![Tailwind CSS](https://img.shields.io/badge/tailwind%20css-3.x-cyan.svg)](https://tailwindcss.com/)
[![Powered by Supabase](https://img.shields.io/badge/powered%20by-Supabase-green.svg)](https://supabase.io)

A full-stack web application designed to help Turo hosts automate and professionalize their toll management workflow. Built with Node.js and Express, this tool lets you upload E-ZPass CSV files and uses an intelligent **Toll Matcher** algorithm to automatically categorize and assign tolls to your trips.

This dashboard replaces manual spreadsheet work with a powerful, visual, and efficient system.

---

##  Dashboard Preview

![Turo Toll Tracker Dashboard Preview](https://raw.githubusercontent.com/Eli45-23/turo-ezpass/main/dashboard_preview.jpg)



---

##  Key Features

* **Interactive Dashboard:** A "Performance Matrix" gives you a high-level overview of total tolls, matched tolls, personal tolls, and any that are unmatched.
* **Real-Time Updates:** Uses WebSockets to provide instant feedback as your data is processed.
* **Easy CSV Upload:** A dedicated interface to upload your E-ZPass transaction history.
* **Intelligent Toll Matcher:** A smart algorithm that analyzes toll data and automatically matches it to the correct Turo trips.
* **Secure Authentication:** User accounts and session management powered by Supabase.
* **Progressive Web App (PWA):** Installable on mobile devices for a native-app-like experience.

---

##  Technology Stack

This project is built with a modern, secure, and scalable technology stack.

| Category                | Technologies                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------- |
| **Backend** | Node.js, Express.js, WebSocket (`ws`), Winston (Logging)                              |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript, Tailwind CSS, PWA                                    |
| **Database & Auth** | Supabase (PostgreSQL), SQLite3 (for local dev)                                        |
| **Security & Middleware** | Helmet, Express Rate Limit, CORS, Joi (Validation), `bcrypt`, `express-session`       |
| **Data Processing** | Multer (File Uploads), `csv-parser`, Luxon (Date/Time), `node-cache` (In-Memory Cache) |
| **Development Tools** | nodemon, ngrok, autoprefixer, postcss                                                 |

---

##  Getting Started (Local Development)

Follow these instructions to get the project running on your local machine for development and testing.

### Prerequisites

* Node.js v18 or higher
* npm (Node Package Manager)
* Git

### Installation & Setup

1.  **Clone the repository:**
    ```sh
    git clone [https://github.com/Eli45-23/turo-ezpass.git](https://github.com/Eli45-23/turo-ezpass.git)
    cd turo-ezpass
    ```

2.  **Install dependencies:**
    ```sh
    npm install
    ```

3.  **Configure environment variables:**
    Create a `.env` file in the root directory by copying the example file:
    ```sh
    cp .env.example .env
    ```
    Now, open the `.env` file and add your Supabase credentials, session secret, and any other required configuration.

4.  **Run the development server:**
    This command uses `nodemon` to start the server, which will automatically restart when you make changes to the code.
    ```sh
    npm run dev
    ```

5.  **Run in production mode:**
    To run the app as it would be in production (without auto-restarting):
    ```sh
    npm start
    ```

The application should now be running on `http://localhost:3000` (or the port you've configured).

---

##  Deployment

This application is designed for easy deployment on modern cloud platforms. It has been tested and confirmed to work on:

* **Render** (Primary)
* Railway
* Fly.io
* Vercel

---

##  License

This project is licensed under the MIT License. See the `LICENSE` file for details.
