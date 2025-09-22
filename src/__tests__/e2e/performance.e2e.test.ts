import request from 'supertest';
import app from '../../server';
import { DatabaseManager } from '../../database/DatabaseManager';
import { Employee } from '../../models/Employee';
import { AttendanceRecord } from '../../models/AttendanceRecord';
import { TimeCategory } from '../../models/TimeCategory';
import { v4 as uuidv4 } from 'uuid';

describe('Performance E2E Tests', () => {
  let dbManager: DatabaseManager;
  let adminAuthToken: string;
  let testEmployees: Employee[] = [];

  beforeAll(async () => {
    dbManager = DatabaseManager.getInstance();
    await dbManager.initialize();
    
    // Create admin user
    const adminEmployee: Employee = {
      id: uuidv4(),
      employeeNumber: 'ADM001',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@farm.com',
      role: 'admin',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const db = dbManager.getDatabase();
    await new Promise<void>((resolve, reject) => {
      db.run(
        `INSERT INTO employees (id, employee_number, first_name, last_name, email, role, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [adminEmployee.id, adminEmployee.employeeNumber, adminEmployee.firstName, adminEmployee.lastName, 
         adminEmployee.email, adminEmployee.role, adminEmployee.isActive ? 1 : 0, 
         adminEmployee.createdAt.toISOString(), adminEmployee.updatedAt.toISOString()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // Get admin auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        employeeNumber: 'ADM001',
        password: 'password123'
      });
    
    adminAuthToken = loginResponse.body.token;
  });

  afterAll(async () => {
    await dbManager.close();
  });

  describe('Large Dataset Employee Management', () => {
    it('should handle creating large numbers of employees efficiently', async () => {
      const employeeCount = 1000;
      const batchSize = 100;
      const startTime = Date.now();

      // Create employees in batches
      for (let batch = 0; batch < employeeCount / batchSize; batch++) {
        const employees = [];
        
        for (let i = 0; i < batchSize; i++) {
          const empNum = batch * batchSize + i + 1;
          employees.push({
            employeeNumber: `EMP${empNum.toString().padStart(4, '0')}`,
            firstName: `Employee${empNum}`,
            lastName: `LastName${empNum}`,
            email: `employee${empNum}@farm.com`,
            role: 'employee',
            isActive: true
          });
        }

        const batchResponse = await request(app)
          .post('/api/admin/employees/bulk')
          .set('Authorization', `Bearer ${adminAuthToken}`)
          .send({ employees });

        expect(batchResponse.status).toBe(201);
        expect(batchResponse.body.created).toBe(batchSize);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(60000); // 60 seconds
      console.log(`Created ${employeeCount} employees in ${duration}ms`);

      // Verify all employees were created
      const listResponse = await request(app)
        .get('/api/admin/employees')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .query({ limit: employeeCount + 10 });

      expect(listResponse.status).toBe(200);
      expect(listResponse.body.employees.length).toBeGreaterThanOrEqual(employeeCount);
    });

    it('should efficiently query large employee datasets', async () => {
      const startTime = Date.now();

      // Test pagination performance
      const pageSize = 50;
      const totalPages = 20;

      for (let page = 1; page <= totalPages; page++) {
        const pageResponse = await request(app)
          .get('/api/admin/employees')
          .set('Authorization', `Bearer ${adminAuthToken}`)
          .query({ 
            page: page,
            limit: pageSize,
            sortBy: 'lastName',
            sortOrder: 'asc'
          });

        expect(pageResponse.status).toBe(200);
        expect(pageResponse.body.employees.length).toBeLessThanOrEqual(pageSize);
        
        // Verify sorting
        const employees = pageResponse.body.employees;
        for (let i = 1; i < employees.length; i++) {
          expect(employees[i].lastName >= employees[i-1].lastName).toBe(true);
        }
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(10000); // 10 seconds
      console.log(`Queried ${totalPages} pages in ${duration}ms`);
    });

    it('should handle complex employee searches efficiently', async () => {
      const searchQueries = [
        { firstName: 'Employee1' },
        { lastName: 'LastName5' },
        { email: '@farm.com' },
        { role: 'employee' },
        { isActive: true }
      ];

      const startTime = Date.now();

      for (const query of searchQueries) {
        const searchResponse = await request(app)
          .get('/api/admin/employees/search')
          .set('Authorization', `Bearer ${adminAuthToken}`)
          .query(query);

        expect(searchResponse.status).toBe(200);
        expect(Array.isArray(searchResponse.body.employees)).toBe(true);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(5000); // 5 seconds
      console.log(`Completed ${searchQueries.length} searches in ${duration}ms`);
    });
  });

  describe('Large Dataset Attendance Management', () => {
    beforeAll(async () => {
      // Create a smaller set of employees for attendance testing
      const db = dbManager.getDatabase();
      
      for (let i = 1; i <= 100; i++) {
        const employee: Employee = {
          id: uuidv4(),
          employeeNumber: `ATT${i.toString().padStart(3, '0')}`,
          firstName: `AttendanceTest${i}`,
          lastName: `Employee${i}`,
          email: `att${i}@farm.com`,
          role: 'employee',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO employees (id, employee_number, first_name, last_name, email, role, is_active, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [employee.id, employee.employeeNumber, employee.firstName, employee.lastName, 
             employee.email, employee.role, employee.isActive ? 1 : 0, 
             employee.createdAt.toISOString(), employee.updatedAt.toISOString()],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });

        testEmployees.push(employee);
      }
    });

    it('should handle creating large numbers of attendance records efficiently', async () => {
      const recordsPerEmployee = 30; // 30 days of attendance
      const totalRecords = testEmployees.length * recordsPerEmployee;
      const startTime = Date.now();

      const db = dbManager.getDatabase();

      // Create attendance records for each employee
      for (const employee of testEmployees) {
        const records = [];
        
        for (let day = 0; day < recordsPerEmployee; day++) {
          const clockInTime = new Date();
          clockInTime.setDate(clockInTime.getDate() - day);
          clockInTime.setHours(8, 0, 0, 0); // 8 AM

          const clockOutTime = new Date(clockInTime);
          clockOutTime.setHours(17, 0, 0, 0); // 5 PM

          const record: AttendanceRecord = {
            id: uuidv4(),
            employeeId: employee.id,
            clockInTime: clockInTime,
            clockOutTime: clockOutTime,
            totalHours: 9,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          records.push(record);
        }

        // Batch insert records
        const placeholders = records.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
        const values = records.flatMap(record => [
          record.id,
          record.employeeId,
          record.clockInTime.toISOString(),
          record.clockOutTime!.toISOString(),
          record.totalHours,
          record.createdAt.toISOString(),
          record.updatedAt.toISOString()
        ]);

        await new Promise<void>((resolve, reject) => {
          db.run(
            `INSERT INTO attendance_records (id, employee_id, clock_in_time, clock_out_time, total_hours, created_at, updated_at)
             VALUES ${placeholders}`,
            values,
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(30000); // 30 seconds
      console.log(`Created ${totalRecords} attendance records in ${duration}ms`);
    });

    it('should efficiently generate reports for large datasets', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
      const endDate = new Date();

      const startTime = Date.now();

      // Generate comprehensive report
      const reportResponse = await request(app)
        .get('/api/manager/reports/comprehensive')
        .set('Authorization', `Bearer ${adminAuthToken}`)
        .query({
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          includeDetails: true
        });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(reportResponse.status).toBe(200);
      expect(reportResponse.body).toHaveProperty('summary');
      expect(reportResponse.body).toHaveProperty('employeeData');
      expect(Array.isArray(reportResponse.body.employeeData)).toBe(true);

      expect(duration).toBeLessThan(15000); // 15 seconds
      console.log(`Generated comprehensive report in ${duration}ms`);
    });

    it('should handle concurrent attendance operations efficiently', async () => {
      const concurrentOperations = 50;
      const startTime = Date.now();

      // Create concurrent clock-in operations
      const clockInPromises = testEmployees.slice(0, concurrentOperations).map(employee => 
        request(app)
          .post('/api/attendance/clock-in')
          .set('Authorization', `Bearer ${adminAuthToken}`)
          .send({ employeeId: employee.id })
      );

      const clockInResponses = await Promise.all(clockInPromises);

      // Verify all succeeded
      clockInResponses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Create concurrent clock-out operations
      const clockOutPromises = testEmployees.slice(0, concurrentOperations).map(employee => 
        request(app)
          .post('/api/attendance/clock-out')
          .set('Authorization', `Bearer ${adminAuthToken}`)
          .send({ employeeId: employee.id })
      );

      const clockOutResponses = await Promise.all(clockOutPromises);

      // Verify all succeeded
      clockOutResponses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(10000); // 10 seconds
      console.log(`Completed ${concurrentOperations * 2} concurrent operations in ${duration}ms`);
    });
  });

  describe('Database Performance Under Load', () => {
    it('should maintain query performance with large datasets', async () => {
      const queries = [
        // Complex aggregation query
        () => request(app)
          .get('/api/reports/employee-summary')
          .set('Authorization', `Bearer ${adminAuthToken}`)
          .query({
            startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0]
          }),

        // Join query with filtering
        () => request(app)
          .get('/api/attendance/detailed-history')
          .set('Authorization', `Bearer ${adminAuthToken}`)
          .query({
            employeeId: testEmployees[0].id,
            limit: 100,
            includeAdjustments: true
          }),

        // Search query with multiple conditions
        () => request(app)
          .get('/api/admin/employees/search')
          .set('Authorization', `Bearer ${adminAuthToken}`)
          .query({
            role: 'employee',
            isActive: true,
            sortBy: 'lastName',
            limit: 50
          })
      ];

      const iterations = 10;
      const results = [];

      for (const query of queries) {
        const queryTimes = [];

        for (let i = 0; i < iterations; i++) {
          const startTime = Date.now();
          const response = await query();
          const endTime = Date.now();

          expect(response.status).toBeLessThan(400);
          queryTimes.push(endTime - startTime);
        }

        const avgTime = queryTimes.reduce((sum, time) => sum + time, 0) / queryTimes.length;
        const maxTime = Math.max(...queryTimes);

        results.push({ avgTime, maxTime });

        // Performance thresholds
        expect(avgTime).toBeLessThan(2000); // 2 seconds average
        expect(maxTime).toBeLessThan(5000); // 5 seconds max
      }

      console.log('Query performance results:', results);
    });

    it('should handle database growth efficiently', async () => {
      // Get initial database stats
      const initialStatsResponse = await request(app)
        .get('/api/admin/system/database-stats')
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(initialStatsResponse.status).toBe(200);
      const initialStats = initialStatsResponse.body;

      // Add more data
      const additionalRecords = 1000;
      const db = dbManager.getDatabase();

      const records = [];
      for (let i = 0; i < additionalRecords; i++) {
        const employee = testEmployees[i % testEmployees.length];
        const clockInTime = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000);
        const clockOutTime = new Date(clockInTime.getTime() + 8 * 60 * 60 * 1000);

        const record: AttendanceRecord = {
          id: uuidv4(),
          employeeId: employee.id,
          clockInTime: clockInTime,
          clockOutTime: clockOutTime,
          totalHours: 8,
          createdAt: new Date(),
          updatedAt: new Date()
        };

        records.push(record);
      }

      // Batch insert
      const placeholders = records.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
      const values = records.flatMap(record => [
        record.id,
        record.employeeId,
        record.clockInTime.toISOString(),
        record.clockOutTime!.toISOString(),
        record.totalHours,
        record.createdAt.toISOString(),
        record.updatedAt.toISOString()
      ]);

      const insertStart = Date.now();
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT INTO attendance_records (id, employee_id, clock_in_time, clock_out_time, total_hours, created_at, updated_at)
           VALUES ${placeholders}`,
          values,
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
      const insertEnd = Date.now();

      // Get final database stats
      const finalStatsResponse = await request(app)
        .get('/api/admin/system/database-stats')
        .set('Authorization', `Bearer ${adminAuthToken}`);

      const finalStats = finalStatsResponse.body;

      // Verify performance
      expect(insertEnd - insertStart).toBeLessThan(10000); // 10 seconds
      expect(finalStats.recordCount).toBeGreaterThan(initialStats.recordCount);
      expect(finalStats.size).toBeGreaterThan(initialStats.size);

      console.log(`Inserted ${additionalRecords} records in ${insertEnd - insertStart}ms`);
      console.log(`Database grew from ${initialStats.size} to ${finalStats.size} bytes`);
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should maintain reasonable memory usage during large operations', async () => {
      // Get initial memory stats
      const initialMemoryResponse = await request(app)
        .get('/api/admin/system/memory-stats')
        .set('Authorization', `Bearer ${adminAuthToken}`);

      expect(initialMemoryResponse.status).toBe(200);
      const initialMemory = initialMemoryResponse.body.heapUsed;

      // Perform memory-intensive operations
      const operations = [];
      for (let i = 0; i < 100; i++) {
        operations.push(
          request(app)
            .get('/api/manager/reports/detailed')
            .set('Authorization', `Bearer ${adminAuthToken}`)
            .query({
              startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              endDate: new Date().toISOString().split('T')[0],
              includeDetails: true
            })
        );
      }

      await Promise.all(operations);

      // Get final memory stats
      const finalMemoryResponse = await request(app)
        .get('/api/admin/system/memory-stats')
        .set('Authorization', `Bearer ${adminAuthToken}`);

      const finalMemory = finalMemoryResponse.body.heapUsed;
      const memoryGrowth = finalMemory - initialMemory;
      const growthRatio = finalMemory / initialMemory;

      // Memory growth should be reasonable
      expect(growthRatio).toBeLessThan(3); // Less than 3x growth
      console.log(`Memory usage: ${initialMemory} -> ${finalMemory} (${memoryGrowth} bytes growth)`);
    });

    it('should handle garbage collection efficiently', async () => {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const initialMemoryResponse = await request(app)
        .get('/api/admin/system/memory-stats')
        .set('Authorization', `Bearer ${adminAuthToken}`);

      const initialMemory = initialMemoryResponse.body.heapUsed;

      // Create and release large amounts of data
      for (let i = 0; i < 10; i++) {
        const largeDataResponse = await request(app)
          .get('/api/manager/reports/comprehensive')
          .set('Authorization', `Bearer ${adminAuthToken}`)
          .query({
            startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            endDate: new Date().toISOString().split('T')[0],
            includeDetails: true,
            format: 'detailed'
          });

        expect(largeDataResponse.status).toBe(200);
      }

      // Force garbage collection again
      if (global.gc) {
        global.gc();
      }

      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for GC

      const finalMemoryResponse = await request(app)
        .get('/api/admin/system/memory-stats')
        .set('Authorization', `Bearer ${adminAuthToken}`);

      const finalMemory = finalMemoryResponse.body.heapUsed;
      const memoryGrowth = finalMemory - initialMemory;

      // Memory should not grow excessively after GC
      expect(memoryGrowth).toBeLessThan(initialMemory * 0.5); // Less than 50% growth
      console.log(`Memory after GC: ${initialMemory} -> ${finalMemory} (${memoryGrowth} bytes net growth)`);
    });
  });
});