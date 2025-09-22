import { DatabaseManager } from '../database/DatabaseManager';
import { EventEmitter } from 'events';

export interface RFIDCard {
  cardId: string;
  employeeId?: string;
  isActive: boolean;
  lastUsed?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RFIDReader {
  id: string;
  name: string;
  devicePath: string;
  baudRate: number;
  status: 'connected' | 'disconnected' | 'error';
  lastHeartbeat?: string;
  capabilities: {
    frequency: '125kHz' | '13.56MHz' | 'dual';
    readRange: number; // in cm
    writeSupport: boolean;
    encryption: boolean;
  };
}

export interface RFIDScanEvent {
  cardId: string;
  readerId: string;
  timestamp: string;
  signalStrength: number;
  rawData?: string;
}

export class RFIDService extends EventEmitter {
  private db: DatabaseManager;
  private readers: Map<string, RFIDReader> = new Map();
  private scanBuffer: Map<string, number> = new Map(); // Prevent duplicate scans
  private readonly SCAN_DEBOUNCE_MS = 2000; // 2 seconds between same card scans

  constructor() {
    super();
    this.db = DatabaseManager.getInstance();
    this.initializeReaders();
  }

  private async initializeReaders(): Promise<void> {
    try {
      // Initialize database tables if they don't exist
      await this.createTables();
      
      // Load registered readers from database
      await this.loadRegisteredReaders();
      
      // Start reader detection and monitoring
      this.startReaderMonitoring();
      
      console.log('RFID Service initialized');
    } catch (error) {
      console.error('Failed to initialize RFID Service:', error);
    }
  }

  private async createTables(): Promise<void> {
    const createRFIDCardsTable = `
      CREATE TABLE IF NOT EXISTS rfid_cards (
        card_id TEXT PRIMARY KEY,
        employee_id TEXT,
        is_active INTEGER DEFAULT 1,
        last_used TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (employee_id) REFERENCES employees (id)
      )
    `;

    const createRFIDReadersTable = `
      CREATE TABLE IF NOT EXISTS rfid_readers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        device_path TEXT NOT NULL,
        baud_rate INTEGER DEFAULT 9600,
        status TEXT DEFAULT 'disconnected',
        last_heartbeat TEXT,
        capabilities TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createRFIDScansTable = `
      CREATE TABLE IF NOT EXISTS rfid_scans (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        reader_id TEXT NOT NULL,
        timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
        signal_strength INTEGER,
        raw_data TEXT,
        processed INTEGER DEFAULT 0,
        FOREIGN KEY (card_id) REFERENCES rfid_cards (card_id),
        FOREIGN KEY (reader_id) REFERENCES rfid_readers (id)
      )
    `;

    await this.db.run(createRFIDCardsTable);
    await this.db.run(createRFIDReadersTable);
    await this.db.run(createRFIDScansTable);
  }

  private async loadRegisteredReaders(): Promise<void> {
    try {
      const readers = await this.db.all('SELECT * FROM rfid_readers WHERE status != ?', ['disabled']);
      
      for (const reader of readers) {
        const rfidReader: RFIDReader = {
          id: reader.id,
          name: reader.name,
          devicePath: reader.device_path,
          baudRate: reader.baud_rate,
          status: 'disconnected',
          lastHeartbeat: reader.last_heartbeat,
          capabilities: JSON.parse(reader.capabilities || '{}')
        };
        
        this.readers.set(reader.id, rfidReader);
      }
      
      console.log(`Loaded ${readers.length} RFID readers`);
    } catch (error) {
      console.error('Failed to load registered readers:', error);
    }
  }

  private startReaderMonitoring(): void {
    // Check reader connectivity every 30 seconds
    setInterval(async () => {
      for (const [readerId, reader] of this.readers) {
        try {
          const isConnected = await this.checkReaderConnection(reader);
          const newStatus = isConnected ? 'connected' : 'disconnected';
          
          if (reader.status !== newStatus) {
            reader.status = newStatus;
            reader.lastHeartbeat = new Date().toISOString();
            
            // Update database
            await this.db.run(
              'UPDATE rfid_readers SET status = ?, last_heartbeat = ? WHERE id = ?',
              [newStatus, reader.lastHeartbeat, readerId]
            );
            
            this.emit('readerStatusChanged', { readerId, status: newStatus });
          }
        } catch (error) {
          console.error(`Failed to check reader ${readerId}:`, error);
          reader.status = 'error';
        }
      }
    }, 30000);

    // Start listening for card scans on connected readers
    this.startCardScanning();
  }

  private async checkReaderConnection(reader: RFIDReader): Promise<boolean> {
    // In a real implementation, this would check the actual hardware connection
    // For simulation, we'll assume readers are connected if they're registered
    try {
      // Simulate hardware check
      if (process.env.NODE_ENV === 'test') {
        return true; // Always connected in test environment
      }
      
      // In production, this would use serial port communication
      // const serialPort = new SerialPort(reader.devicePath, { baudRate: reader.baudRate });
      // return serialPort.isOpen;
      
      return Math.random() > 0.1; // 90% uptime simulation
    } catch (error) {
      return false;
    }
  }

  private startCardScanning(): void {
    // Simulate card scanning for connected readers
    for (const [readerId, reader] of this.readers) {
      if (reader.status === 'connected') {
        this.simulateCardScanning(readerId);
      }
    }
  }

  private simulateCardScanning(readerId: string): void {
    // In a real implementation, this would listen to the actual RFID reader
    // For simulation, we'll create a mock scanning interface
    
    if (process.env.NODE_ENV !== 'test') {
      console.log(`Started card scanning for reader ${readerId}`);
      // Real implementation would set up serial port listeners here
    }
  }

  // Public API methods

  async getAllCards(): Promise<RFIDCard[]> {
    try {
      const cards = await this.db.all(`
        SELECT 
          card_id,
          employee_id,
          is_active,
          last_used,
          created_at,
          updated_at
        FROM rfid_cards 
        ORDER BY created_at DESC
      `);

      return cards.map(card => ({
        cardId: card.card_id,
        employeeId: card.employee_id,
        isActive: Boolean(card.is_active),
        lastUsed: card.last_used,
        createdAt: card.created_at,
        updatedAt: card.updated_at
      }));
    } catch (error) {
      console.error('Failed to get all cards:', error);
      throw error;
    }
  }

  async getCard(cardId: string): Promise<RFIDCard | null> {
    try {
      const card = await this.db.get(
        'SELECT * FROM rfid_cards WHERE card_id = ?',
        [cardId]
      );

      if (!card) return null;

      return {
        cardId: card.card_id,
        employeeId: card.employee_id,
        isActive: Boolean(card.is_active),
        lastUsed: card.last_used,
        createdAt: card.created_at,
        updatedAt: card.updated_at
      };
    } catch (error) {
      console.error('Failed to get card:', error);
      throw error;
    }
  }

  async assignCard(cardId: string, employeeId: string): Promise<RFIDCard> {
    try {
      // Check if card already exists
      const existingCard = await this.getCard(cardId);
      
      if (existingCard) {
        // Update existing card
        await this.db.run(
          'UPDATE rfid_cards SET employee_id = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE card_id = ?',
          [employeeId, cardId]
        );
      } else {
        // Create new card
        await this.db.run(
          'INSERT INTO rfid_cards (card_id, employee_id, is_active) VALUES (?, ?, 1)',
          [cardId, employeeId]
        );
      }

      const updatedCard = await this.getCard(cardId);
      if (!updatedCard) {
        throw new Error('Failed to retrieve updated card');
      }

      this.emit('cardAssigned', { cardId, employeeId });
      return updatedCard;
    } catch (error) {
      console.error('Failed to assign card:', error);
      throw error;
    }
  }

  async deactivateCard(cardId: string): Promise<void> {
    try {
      await this.db.run(
        'UPDATE rfid_cards SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE card_id = ?',
        [cardId]
      );

      this.emit('cardDeactivated', { cardId });
    } catch (error) {
      console.error('Failed to deactivate card:', error);
      throw error;
    }
  }

  async getEmployeeByCard(cardId: string): Promise<any | null> {
    try {
      const result = await this.db.get(`
        SELECT e.* FROM employees e
        JOIN rfid_cards r ON e.id = r.employee_id
        WHERE r.card_id = ? AND r.is_active = 1
      `, [cardId]);

      return result || null;
    } catch (error) {
      console.error('Failed to get employee by card:', error);
      throw error;
    }
  }

  async recordScan(scanEvent: RFIDScanEvent): Promise<void> {
    try {
      // Check for duplicate scans (debouncing)
      const lastScanTime = this.scanBuffer.get(scanEvent.cardId);
      const now = Date.now();
      
      if (lastScanTime && (now - lastScanTime) < this.SCAN_DEBOUNCE_MS) {
        console.log(`Ignoring duplicate scan for card ${scanEvent.cardId}`);
        return;
      }

      this.scanBuffer.set(scanEvent.cardId, now);

      // Record the scan in database
      await this.db.run(`
        INSERT INTO rfid_scans (
          id, card_id, reader_id, timestamp, signal_strength, raw_data
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [
        `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        scanEvent.cardId,
        scanEvent.readerId,
        scanEvent.timestamp,
        scanEvent.signalStrength,
        scanEvent.rawData
      ]);

      // Update card last used timestamp
      await this.db.run(
        'UPDATE rfid_cards SET last_used = ? WHERE card_id = ?',
        [scanEvent.timestamp, scanEvent.cardId]
      );

      // Emit scan event for listeners
      this.emit('cardScanned', scanEvent);
    } catch (error) {
      console.error('Failed to record scan:', error);
      throw error;
    }
  }

  async getReaders(): Promise<RFIDReader[]> {
    return Array.from(this.readers.values());
  }

  async registerReader(reader: Omit<RFIDReader, 'id' | 'status' | 'lastHeartbeat'>): Promise<RFIDReader> {
    try {
      const readerId = `reader_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const newReader: RFIDReader = {
        ...reader,
        id: readerId,
        status: 'disconnected'
      };

      // Save to database
      await this.db.run(`
        INSERT INTO rfid_readers (
          id, name, device_path, baud_rate, capabilities
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        readerId,
        reader.name,
        reader.devicePath,
        reader.baudRate,
        JSON.stringify(reader.capabilities)
      ]);

      this.readers.set(readerId, newReader);
      this.emit('readerRegistered', newReader);

      return newReader;
    } catch (error) {
      console.error('Failed to register reader:', error);
      throw error;
    }
  }

  // Simulate card scan (for testing and demo purposes)
  simulateCardScan(cardId: string, readerId?: string): void {
    const availableReaders = Array.from(this.readers.values()).filter(r => r.status === 'connected');
    
    if (availableReaders.length === 0) {
      console.warn('No connected readers available for simulation');
      return;
    }

    const reader = readerId ? this.readers.get(readerId) : availableReaders[0];
    
    if (!reader) {
      console.warn(`Reader ${readerId} not found or not connected`);
      return;
    }

    const scanEvent: RFIDScanEvent = {
      cardId,
      readerId: reader.id,
      timestamp: new Date().toISOString(),
      signalStrength: Math.floor(Math.random() * 100) + 50, // 50-150 range
      rawData: `RAW_${cardId}_${Date.now()}`
    };

    this.recordScan(scanEvent);
  }

  // Cleanup method
  async shutdown(): Promise<void> {
    try {
      // Close any open connections
      for (const reader of this.readers.values()) {
        if (reader.status === 'connected') {
          // In real implementation, close serial port connections
          console.log(`Closing connection to reader ${reader.id}`);
        }
      }

      this.readers.clear();
      this.scanBuffer.clear();
      this.removeAllListeners();
      
      console.log('RFID Service shutdown complete');
    } catch (error) {
      console.error('Error during RFID Service shutdown:', error);
    }
  }
}

// Singleton instance
let rfidServiceInstance: RFIDService | null = null;

export const getRFIDService = (): RFIDService => {
  if (!rfidServiceInstance) {
    rfidServiceInstance = new RFIDService();
  }
  return rfidServiceInstance;
};