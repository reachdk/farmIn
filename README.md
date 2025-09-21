# Farm Attendance System

An offline-first web application for tracking employee attendance in agricultural operations.

## Features

- **Offline-First**: Core functionality works without internet connectivity
- **Automatic Sync**: Data synchronizes when connectivity is available
- **Role-Based Access**: Employee, Manager, and Admin interfaces
- **Time Categories**: Configurable work classifications (half day, full day, etc.)
- **Hardware Integration**: Support for RFID cards and camera capture
- **Audit Trail**: Complete logging of all changes and adjustments

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Initialize the database:
   ```bash
   npm run migrate
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:3000`

### Health Checks

- System health: `GET /health`
- Database health: `GET /health/database`

## Development

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run migrate` - Run database migrations

### Project Structure

```
src/
├── database/           # Database management and migrations
├── __tests__/         # Test files
└── server.ts          # Main server entry point
```

## Database

The system uses SQLite for local storage with the following tables:

- `employees` - Employee master data
- `attendance_records` - Time tracking entries  
- `time_categories` - Configurable work classifications
- `time_adjustments` - Audit trail for manual corrections
- `sync_queue` - Pending synchronization operations
- `system_settings` - Configuration parameters
- `sync_log` - Synchronization history and status

## Testing

Run the test suite:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

## License

MIT