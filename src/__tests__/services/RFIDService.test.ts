import { DatabaseManager } from '../../database/DatabaseManager';
import { RFIDService, getRFIDService } from '../../services/RFIDService';

describe('RFIDService', () => {
  let db: DatabaseManager;
  let rfidService: RFIDService;

  beforeAll(async () => {
    db = DatabaseManager.getInstance();
    await db.initialize();
  });

  beforeEach(async () => {
    rfidService = new RFIDService();
    
    // Clean up test data in correct order to avoid foreign key constraints
    await db.run('DELETE FROM rfid_scans WHERE card_id LIKE "test_%"');
    await db.run('DELETE FROM rfid_cards WHERE card_id LIKE "test_%"');
    await db.run('DELETE FROM rfid_readers WHERE id LIKE "test_%"');
    await db.run('DELETE FROM employees WHERE id LIKE "test_%"');
  });

  afterEach(async () => {
    await rfidService.shutdown();
  });

  afterAll(async () => {
    // Clean up test data in correct order to avoid foreign key constraints
    await db.run('DELETE FROM rfid_scans WHERE card_id LIKE "test_%"');
    await db.run('DELETE FROM rfid_cards WHERE card_id LIKE "test_%"');
    await db.run('DELETE FROM rfid_readers WHERE id LIKE "test_%"');
    await db.run('DELETE FROM employees WHERE id LIKE "test_%"');
    await db.close();
  });

  describe('Card Management', () => {
    it('should get all cards', async () => {
      // Create test card
      await db.run(`
        INSERT INTO rfid_cards (card_id, employee_id, is_active)
        VALUES (?, ?, ?)
      `, ['test_card_001', 'test_emp_001', 1]);

      const cards = await rfidService.getAllCards();
      
      expect(cards).toHaveLength(1);
      expect(cards[0]).toMatchObject({
        cardId: 'test_card_001',
        employeeId: 'test_emp_001',
        isActive: true
      });
    });

    it('should get card by ID', async () => {
      // Create test card
      await db.run(`
        INSERT INTO rfid_cards (card_id, employee_id, is_active)
        VALUES (?, ?, ?)
      `, ['test_card_002', 'test_emp_002', 1]);

      const card = await rfidService.getCard('test_card_002');
      
      expect(card).toMatchObject({
        cardId: 'test_card_002',
        employeeId: 'test_emp_002',
        isActive: true
      });
    });

    it('should return null for non-existent card', async () => {
      const card = await rfidService.getCard('non_existent_card');
      expect(card).toBeNull();
    });

    it('should assign card to employee', async () => {
      // Create test employee
      await db.run(`
        INSERT INTO employees (id, employee_number, first_name, last_name, role, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `, ['test_emp_003', 'EMP003', 'John', 'Doe', 'employee', 1]);

      const card = await rfidService.assignCard('test_card_003', 'test_emp_003');
      
      expect(card).toMatchObject({
        cardId: 'test_card_003',
        employeeId: 'test_emp_003',
        isActive: true
      });

      // Verify card was created in database
      const dbCard = await db.get('SELECT * FROM rfid_cards WHERE card_id = ?', ['test_card_003']);
      expect(dbCard).toBeTruthy();
      expect(dbCard.employee_id).toBe('test_emp_003');
    });

    it('should update existing card assignment', async () => {
      // Create test employees
      await db.run(`
        INSERT INTO employees (id, employee_number, first_name, last_name, role, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `, ['test_emp_004', 'EMP004', 'Jane', 'Smith', 'employee', 1]);

      await db.run(`
        INSERT INTO employees (id, employee_number, first_name, last_name, role, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `, ['test_emp_005', 'EMP005', 'Bob', 'Johnson', 'employee', 1]);

      // Create card assigned to first employee
      await db.run(`
        INSERT INTO rfid_cards (card_id, employee_id, is_active)
        VALUES (?, ?, ?)
      `, ['test_card_004', 'test_emp_004', 1]);

      // Reassign to second employee
      const card = await rfidService.assignCard('test_card_004', 'test_emp_005');
      
      expect(card.employeeId).toBe('test_emp_005');

      // Verify database was updated
      const dbCard = await db.get('SELECT * FROM rfid_cards WHERE card_id = ?', ['test_card_004']);
      expect(dbCard.employee_id).toBe('test_emp_005');
    });

    it('should deactivate card', async () => {
      // Create test card
      await db.run(`
        INSERT INTO rfid_cards (card_id, employee_id, is_active)
        VALUES (?, ?, ?)
      `, ['test_card_005', 'test_emp_005', 1]);

      await rfidService.deactivateCard('test_card_005');

      const card = await rfidService.getCard('test_card_005');
      expect(card?.isActive).toBe(false);
    });

    it('should emit events for card operations', async () => {
      const assignedSpy = jest.fn();
      const deactivatedSpy = jest.fn();

      rfidService.on('cardAssigned', assignedSpy);
      rfidService.on('cardDeactivated', deactivatedSpy);

      // Create test employee
      await db.run(`
        INSERT INTO employees (id, employee_number, first_name, last_name, role, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `, ['test_emp_006', 'EMP006', 'Alice', 'Brown', 'employee', 1]);

      await rfidService.assignCard('test_card_006', 'test_emp_006');
      expect(assignedSpy).toHaveBeenCalledWith({
        cardId: 'test_card_006',
        employeeId: 'test_emp_006'
      });

      await rfidService.deactivateCard('test_card_006');
      expect(deactivatedSpy).toHaveBeenCalledWith({
        cardId: 'test_card_006'
      });
    });
  });

  describe('Employee Lookup', () => {
    it('should get employee by card', async () => {
      // Create test employee and card
      await db.run(`
        INSERT INTO employees (id, employee_number, first_name, last_name, role, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `, ['test_emp_007', 'EMP007', 'Charlie', 'Wilson', 'employee', 1]);

      await db.run(`
        INSERT INTO rfid_cards (card_id, employee_id, is_active)
        VALUES (?, ?, ?)
      `, ['test_card_007', 'test_emp_007', 1]);

      const employee = await rfidService.getEmployeeByCard('test_card_007');
      
      expect(employee).toMatchObject({
        id: 'test_emp_007',
        employee_number: 'EMP007',
        first_name: 'Charlie',
        last_name: 'Wilson'
      });
    });

    it('should return null for inactive card', async () => {
      // Create test employee and inactive card
      await db.run(`
        INSERT INTO employees (id, employee_number, first_name, last_name, role, is_active)
        VALUES (?, ?, ?, ?, ?, ?)
      `, ['test_emp_008', 'EMP008', 'David', 'Miller', 'employee', 1]);

      await db.run(`
        INSERT INTO rfid_cards (card_id, employee_id, is_active)
        VALUES (?, ?, ?)
      `, ['test_card_008', 'test_emp_008', 0]);

      const employee = await rfidService.getEmployeeByCard('test_card_008');
      expect(employee).toBeNull();
    });

    it('should return null for non-existent card', async () => {
      const employee = await rfidService.getEmployeeByCard('non_existent_card');
      expect(employee).toBeNull();
    });
  });

  describe('Reader Management', () => {
    it('should register new reader', async () => {
      const readerData = {
        name: 'Test Reader',
        devicePath: '/dev/ttyUSB0',
        baudRate: 9600,
        capabilities: {
          frequency: '125kHz' as const,
          readRange: 10,
          writeSupport: false,
          encryption: false
        }
      };

      const reader = await rfidService.registerReader(readerData);
      
      expect(reader).toMatchObject({
        name: 'Test Reader',
        devicePath: '/dev/ttyUSB0',
        baudRate: 9600,
        status: 'disconnected'
      });

      expect(reader.id).toBeTruthy();
      expect(reader.capabilities).toEqual(readerData.capabilities);

      // Verify reader was saved to database
      const dbReader = await db.get('SELECT * FROM rfid_readers WHERE id = ?', [reader.id]);
      expect(dbReader).toBeTruthy();
    });

    it('should get all readers', async () => {
      // Register test reader
      await rfidService.registerReader({
        name: 'Test Reader 2',
        devicePath: '/dev/ttyUSB1',
        baudRate: 9600,
        capabilities: {
          frequency: '13.56MHz' as const,
          readRange: 5,
          writeSupport: true,
          encryption: true
        }
      });

      const readers = await rfidService.getReaders();
      
      expect(readers.length).toBeGreaterThan(0);
      const testReader = readers.find(r => r.name === 'Test Reader 2');
      expect(testReader).toBeTruthy();
    });

    it('should emit reader registered event', async () => {
      const registeredSpy = jest.fn();
      rfidService.on('readerRegistered', registeredSpy);

      const reader = await rfidService.registerReader({
        name: 'Event Test Reader',
        devicePath: '/dev/ttyUSB2',
        baudRate: 9600,
        capabilities: {
          frequency: '125kHz' as const,
          readRange: 10,
          writeSupport: false,
          encryption: false
        }
      });

      expect(registeredSpy).toHaveBeenCalledWith(reader);
    });
  });

  describe('Scan Recording', () => {
    let testReaderId: string;

    beforeEach(async () => {
      // Register test reader
      const reader = await rfidService.registerReader({
        name: 'Scan Test Reader',
        devicePath: '/dev/ttyUSB3',
        baudRate: 9600,
        capabilities: {
          frequency: '125kHz' as const,
          readRange: 10,
          writeSupport: false,
          encryption: false
        }
      });
      testReaderId = reader.id;

      // Create test card
      await db.run(`
        INSERT INTO rfid_cards (card_id, employee_id, is_active)
        VALUES (?, ?, ?)
      `, ['test_card_scan', 'test_emp_scan', 1]);
    });

    it('should record scan event', async () => {
      const scanEvent = {
        cardId: 'test_card_scan',
        readerId: testReaderId,
        timestamp: new Date().toISOString(),
        signalStrength: 85,
        rawData: 'RAW_DATA_123'
      };

      await rfidService.recordScan(scanEvent);

      // Verify scan was recorded
      const scan = await db.get(
        'SELECT * FROM rfid_scans WHERE card_id = ? AND reader_id = ?',
        [scanEvent.cardId, scanEvent.readerId]
      );

      expect(scan).toBeTruthy();
      expect(scan.signal_strength).toBe(85);
      expect(scan.raw_data).toBe('RAW_DATA_123');
    });

    it('should update card last_used timestamp', async () => {
      const scanEvent = {
        cardId: 'test_card_scan',
        readerId: testReaderId,
        timestamp: new Date().toISOString(),
        signalStrength: 90
      };

      await rfidService.recordScan(scanEvent);

      // Verify card last_used was updated
      const card = await db.get('SELECT * FROM rfid_cards WHERE card_id = ?', ['test_card_scan']);
      expect(card.last_used).toBe(scanEvent.timestamp);
    });

    it('should emit scan event', async () => {
      const scannedSpy = jest.fn();
      rfidService.on('cardScanned', scannedSpy);

      const scanEvent = {
        cardId: 'test_card_scan',
        readerId: testReaderId,
        timestamp: new Date().toISOString(),
        signalStrength: 95
      };

      await rfidService.recordScan(scanEvent);

      expect(scannedSpy).toHaveBeenCalledWith(scanEvent);
    });

    it('should debounce duplicate scans', async () => {
      const scanEvent = {
        cardId: 'test_card_scan',
        readerId: testReaderId,
        timestamp: new Date().toISOString(),
        signalStrength: 80
      };

      // Record first scan
      await rfidService.recordScan(scanEvent);

      // Try to record duplicate scan immediately
      await rfidService.recordScan({
        ...scanEvent,
        timestamp: new Date().toISOString()
      });

      // Should only have one scan recorded
      const scans = await db.all(
        'SELECT * FROM rfid_scans WHERE card_id = ? AND reader_id = ?',
        [scanEvent.cardId, scanEvent.readerId]
      );

      expect(scans).toHaveLength(1);
    });
  });

  describe('Simulation Features', () => {
    let testReaderId: string;

    beforeEach(async () => {
      // Register test reader
      const reader = await rfidService.registerReader({
        name: 'Simulation Reader',
        devicePath: '/dev/ttyUSB4',
        baudRate: 9600,
        capabilities: {
          frequency: '125kHz' as const,
          readRange: 10,
          writeSupport: false,
          encryption: false
        }
      });
      testReaderId = reader.id;

      // Mark reader as connected for simulation
      await db.run(
        'UPDATE rfid_readers SET status = ? WHERE id = ?',
        ['connected', testReaderId]
      );
    });

    it('should simulate card scan', async () => {
      const scannedSpy = jest.fn();
      rfidService.on('cardScanned', scannedSpy);

      rfidService.simulateCardScan('test_sim_card', testReaderId);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(scannedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          cardId: 'test_sim_card',
          readerId: testReaderId
        })
      );
    });

    it('should use first available reader when none specified', async () => {
      const scannedSpy = jest.fn();
      rfidService.on('cardScanned', scannedSpy);

      rfidService.simulateCardScan('test_sim_card_2');

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(scannedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          cardId: 'test_sim_card_2',
          readerId: testReaderId
        })
      );
    });

    it('should warn when no connected readers available', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // Disconnect all readers
      db.run('UPDATE rfid_readers SET status = ?', ['disconnected']);

      rfidService.simulateCardScan('test_sim_card_3');

      expect(consoleSpy).toHaveBeenCalledWith('No connected readers available for simulation');

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors in getAllCards', async () => {
      // Close database to simulate error
      await db.close();

      await expect(rfidService.getAllCards()).rejects.toThrow();

      // Reinitialize for cleanup
      await db.initialize();
    });

    it('should handle database errors in assignCard', async () => {
      await expect(rfidService.assignCard('invalid_card', 'non_existent_employee')).rejects.toThrow();
    });

    it('should handle invalid scan data gracefully', async () => {
      const invalidScanEvent = {
        cardId: '',
        readerId: 'non_existent_reader',
        timestamp: 'invalid_timestamp',
        signalStrength: -1
      };

      await expect(rfidService.recordScan(invalidScanEvent)).rejects.toThrow();
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance from getRFIDService', () => {
      const instance1 = getRFIDService();
      const instance2 = getRFIDService();

      expect(instance1).toBe(instance2);
    });

    it('should properly shutdown service', async () => {
      const service = getRFIDService();
      
      // Should not throw
      await expect(service.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Event Emitter Functionality', () => {
    it('should properly remove event listeners', async () => {
      const testSpy = jest.fn();
      
      rfidService.on('cardScanned', testSpy);
      rfidService.removeListener('cardScanned', testSpy);

      // Simulate scan
      rfidService.simulateCardScan('test_card');
      
      // Wait for potential async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(testSpy).not.toHaveBeenCalled();
    });

    it('should handle multiple listeners for same event', async () => {
      const spy1 = jest.fn();
      const spy2 = jest.fn();

      rfidService.on('cardScanned', spy1);
      rfidService.on('cardScanned', spy2);

      // Register reader and simulate scan
      const reader = await rfidService.registerReader({
        name: 'Multi Listener Reader',
        devicePath: '/dev/ttyUSB5',
        baudRate: 9600,
        capabilities: {
          frequency: '125kHz' as const,
          readRange: 10,
          writeSupport: false,
          encryption: false
        }
      });

      await db.run('UPDATE rfid_readers SET status = ? WHERE id = ?', ['connected', reader.id]);

      rfidService.simulateCardScan('test_multi_card', reader.id);

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(spy1).toHaveBeenCalled();
      expect(spy2).toHaveBeenCalled();
    });
  });
});