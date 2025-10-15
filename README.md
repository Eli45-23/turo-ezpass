# Turo Toll Tracker Dashboard [W.I.P]

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node.js-18+-brightgreen.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/express.js-4.x-blue.svg)](https://expressjs.com/)
[![Tailwind CSS](https://img.shields.io/badge/tailwind%20css-3.x-cyan.svg)](https://tailwindcss.com/)
[![Powered by Supabase](https://img.shields.io/badge/powered%20by-Supabase-green.svg)](https://supabase.io)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**Automate toll management for Turo hosts with intelligent matching and real-time analytics**

[Features](#-key-features) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Demo](#-dashboard-preview)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Dashboard Preview](#-dashboard-preview)
- [Key Features](#-key-features)
- [How It Works](#-how-it-works)
- [Technology Stack](#-technology-stack)
- [Quick Start](#-quick-start)
- [Documentation](#-documentation)
- [Deployment](#-deployment)
- [Contributing](#-contributing)
- [Changelog](#-changelog)
- [License](#-license)
- [Support](#-support)

---

## 🎯 Overview

Turo Toll Tracker is a full-stack web application that eliminates the manual spreadsheet work of matching highway tolls to Turo rentals. Upload your E-ZPass CSV, and let our intelligent algorithm automatically categorize tolls as business or personal expenses.

**Perfect for:**
- Turo hosts managing multiple vehicles
- Hosts who frequently drive on toll roads
- Anyone tired of manual toll reconciliation

**Time Saved:** Average users report saving 2-3 hours per month on toll management.

---

## 🎬 Dashboard Preview

![Turo Toll Tracker Dashboard Preview](https://raw.githubusercontent.com/Eli45-23/turo-ezpass/main/dashboard-preview.png)

*Real-time performance matrix showing toll statistics and automatic matching results*

---

## ✨ Key Features

- **📊 Interactive Dashboard** - Performance Matrix with comprehensive toll analytics at a glance
- **⚡ Real-Time Updates** - WebSocket-powered instant feedback during data processing
- **📤 Easy CSV Upload** - Drag-and-drop E-ZPass transaction history upload
- **🤖 Intelligent Toll Matcher** - Smart algorithm that automatically categorizes tolls by trip
- **🔐 Secure Authentication** - User accounts and session management powered by Supabase
- **📱 Progressive Web App** - Installable on mobile devices for native-app-like experience

---

## 🔍 How It Works

### The Toll Matching Algorithm

Our intelligent matcher uses a multi-stage process:

1. **Data Ingestion** - Parses E-ZPass CSV files and validates toll data
2. **Time Window Analysis** - Creates time windows around Turo trip start/end times
3. **Location Matching** - Maps toll plaza locations to trip routes
4. **Smart Assignment** - Automatically categorizes tolls as:
   - ✅ **Matched** - Tolls during active Turo trips (business expense)
   - 🏠 **Personal** - Tolls outside any trip window
   - ⚠️ **Ambiguous** - Tolls near trip boundaries (flagged for review)
   - ❌ **Unmatched** - Unable to categorize (manual review required)

### Architecture

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Browser   │ ───> │   Express   │ ───> │  Supabase   │
│  (PWA)      │ <──  │   Server    │ <─── │  Database   │
└─────────────┘      └─────────────┘      └─────────────┘
       │                    │
       └────────────────────┘
            WebSocket
         (Real-time updates)
```

**Want to learn more?** See our [Architecture Guide](docs/ARCHITECTURE.md) for detailed system design.

---

## 🛠️ Technology Stack

| Category | Technologies |
| ----------------------- | ------------------------------------------------------------------------------------- |
| **Backend** | Node.js, Express.js, WebSocket (`ws`), Winston (Logging) |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript, Tailwind CSS, PWA |
| **Database & Auth** | Supabase (PostgreSQL), SQLite3 (for local dev) |
| **Security & Middleware** | Helmet, Express Rate Limit, CORS, Joi (Validation), bcrypt, express-session |
| **Data Processing** | Multer (File Uploads), csv-parser, Luxon (Date/Time), node-cache (In-Memory Cache) |
| **Development Tools** | nodemon, ngrok, autoprefixer, postcss |

---

## 🚀 Quick Start

### Prerequisites

- Node.js v18 or higher
- npm (Node Package Manager)
- Git
- A Supabase account ([sign up free](https://supabase.com))

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/Eli45-23/turo-ezpass.git
cd turo-ezpass

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env and add your Supabase credentials

# 4. Run the development server
npm run dev
```

The application will be running at `http://localhost:3000` 🎉

### First-Time Setup

1. **Create your Supabase project** at [supabase.com](https://supabase.com)
2. **Set up the database** - Run the SQL commands in [docs/CONFIGURATION.md#database-setup](docs/CONFIGURATION.md#database-setup)
3. **Configure your `.env`** - Add your Supabase URL and API key
4. **Start uploading tolls!**

**Need detailed instructions?** See our [Complete Installation Guide](docs/INSTALLATION.md)

---

## 📚 Documentation

### For Users
- **[Installation Guide](docs/INSTALLATION.md)** - Detailed setup instructions with troubleshooting
- **[Configuration Guide](docs/CONFIGURATION.md)** - Environment variables and database setup
- **[Usage Guide](docs/USAGE.md)** - Step-by-step walkthrough of features
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues and solutions
- **[FAQ](docs/FAQ.md)** - Frequently asked questions

### For Developers
- **[Development Guide](docs/DEVELOPMENT.md)** - Contributing and development setup
- **[API Documentation](docs/API.md)** - Endpoints and integration examples
- **[Architecture Overview](docs/ARCHITECTURE.md)** - System design and algorithm details

### For DevOps
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Deploy to Render, Railway, Fly.io, or Vercel

---

## 🚢 Deployment

This application is designed for easy deployment on modern cloud platforms:

### Supported Platforms

| Platform | Status | Guide |
|----------|--------|-------|
| **Render** | ✅ Recommended | [Deploy Guide](docs/DEPLOYMENT.md#render) |
| **Railway** | ✅ Tested | [Deploy Guide](docs/DEPLOYMENT.md#railway) |
| **Fly.io** | ✅ Tested | [Deploy Guide](docs/DEPLOYMENT.md#flyio) |
| **Vercel** | ✅ Tested | [Deploy Guide](docs/DEPLOYMENT.md#vercel) |

**Quick Deploy to Render:**

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

See our [Deployment Guide](docs/DEPLOYMENT.md) for platform-specific instructions and configuration.

---

## 🤝 Contributing

We love contributions! Whether you're fixing bugs, adding features, or improving documentation, your help is welcome.

### Ways to Contribute
- 🐛 Report bugs via [GitHub Issues](https://github.com/Eli45-23/turo-ezpass/issues)
- 💡 Suggest features in [Discussions](https://github.com/Eli45-23/turo-ezpass/discussions)
- 📝 Improve documentation
- 🔧 Submit pull requests

### Quick Start for Contributors

```bash
# Fork the repo, then clone your fork
git clone https://github.com/YOUR-USERNAME/turo-ezpass.git
cd turo-ezpass

# Create a feature branch
git checkout -b feature/your-feature-name

# Make changes, commit, and push
git commit -m "feat: add awesome feature"
git push origin feature/your-feature-name

# Open a Pull Request on GitHub
```

**Read our full [Contributing Guide](CONTRIBUTING.md)** for code standards, testing requirements, and PR guidelines.

---

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed version history and release notes.

### Recent Updates

**v1.2.0** (Latest)
- Added confidence scoring for toll matches
- Improved WebSocket reconnection logic
- Enhanced CSV parser for additional E-ZPass formats
- Bug fixes and performance improvements

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

**What this means:**
- ✅ Commercial use allowed
- ✅ Modification allowed
- ✅ Distribution allowed
- ✅ Private use allowed

---

## 🙏 Support

### Getting Help

- 📖 **Documentation** - Start with our [docs](docs/) folder
- 💬 **Discussions** - Ask questions in [GitHub Discussions](https://github.com/Eli45-23/turo-ezpass/discussions)
- 🐛 **Bug Reports** - File issues at [GitHub Issues](https://github.com/Eli45-23/turo-ezpass/issues)
- 🔒 **Security** - Report vulnerabilities privately (see [SECURITY.md](SECURITY.md))

### Show Your Support

If this project helped you save time and money:
- ⭐ **Star this repository**
- 📢 **Share with other Turo hosts**
- 🐛 **Report bugs you find**
- 💡 **Suggest improvements**

---

## 🗺️ Roadmap

Interested in what's coming next? Check our [Roadmap](docs/ROADMAP.md) or vote on features in [Discussions](https://github.com/Eli45-23/turo-ezpass/discussions).

**Coming Soon:**
- SunPass and FasTrak support
- Mobile app (React Native)
- QuickBooks integration
- Advanced reporting with charts

---

## 📊 Project Stats

![GitHub stars](https://img.shields.io/github/stars/Eli45-23/turo-ezpass?style=social)
![GitHub forks](https://img.shields.io/github/forks/Eli45-23/turo-ezpass?style=social)
![GitHub issues](https://img.shields.io/github/issues/Eli45-23/turo-ezpass)

---

<div align="center">

**Made with ❤️ by Turo hosts, for Turo hosts**

[⬆ Back to Top](#turo-toll-tracker-dashboard)

</div>
