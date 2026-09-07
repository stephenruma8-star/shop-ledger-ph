# Shop Ledger PH

A complete POS and inventory management system built for Philippine sari-sari stores, built with Electron, SQLite, and Express.

## Features

- Point-of-sale with barcode scanning and quick-sale mode
- Product inventory with categories, stock tracking, and price management
- Sales history with receipts (print/PDF) and daily summaries
- Customer management with balances and transaction history
- Expense tracking and profit/loss reporting
- Backup and restore (local + cloud options)
- LAN API for mobile/tablet access to the same database
- CSV import/export for products and sales
- Email reports (PDF attachments via nodemailer)
- Auto-update via GitHub Releases

## Screenshots

*Coming soon*

## Installation

Download the latest installer from [GitHub Releases](https://github.com/stephenruma8-star/shop-ledger-ph/releases).

**Windows:** Run the `.exe` installer or use the portable version.

## Development Setup

```bash
npm install
npm run dev
```

## Build

```bash
npm run build:win        # Windows (NSIS installer + portable)
npm run build            # Build without packaging
```

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start in development mode with hot-reload |
| `npm run build` | Build the app for production |
| `npm run build:win` | Build + package for Windows |
| `npm run start` | Run the built app |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run linter, typecheck, and all smoke tests |
| `npm run typecheck` | TypeScript type checking |
| `npm run test` | Full test suite (lint + build + smoke tests) |
| `npm run audit` | Check production dependencies for vulnerabilities |
| `npm run audit:fix` | Auto-fix production dependency vulnerabilities |
| `npm run rebuild:electron` | Rebuild native modules for Electron ABI |

## Architecture

```
shop-ledger-ph/
├── src/
│   ├── main/           # Electron main process (window management, IPC, DB)
│   ├── renderer/       # Frontend UI (HTML/CSS/JS)
│   └── preload/        # Context bridge for IPC
├── scripts/            # Build, test, and utility scripts
├── out/                # Compiled output
└── package.json
```

- **Electron** — Desktop shell and system integration
- **SQLite (better-sqlite3)** — Local database for all data
- **Express** — LAN API server for mobile/tablet clients on the same network
- **electron-vite** — Build tooling
- **electron-builder** — Packaging and distribution

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run `npm run lint` before committing
4. Open a pull request with a clear description of changes
