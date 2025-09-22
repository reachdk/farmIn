#!/usr/bin/env ts-node

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  suite: string;
  passed: boolean;
  duration: number;
  error?: string;
}

class E2ETestRunner {
  private results: TestResult[] = [];
  private startTime: number = 0;

  async runAllTests(): Promise<void> {
    console.log('🚀 Starting End-to-End Test Suite');
    console.log('=====================================\n');

    this.startTime = Date.now();

    const testSuites = [
      'employee-journey.e2e.test.ts',
      'manager-journey.e2e.test.ts', 
      'admin-journey.e2e.test.ts',
      'offline-scenarios.e2e.test.ts',
      'performance.e2e.test.ts',
      'sync-scenarios.e2e.test.ts'
    ];

    for (const suite of testSuites) {
      await this.runTestSuite(suite);
    }

    this.generateReport();
  }

  private async runTestSuite(suiteName: string): Promise<void> {
    console.log(`📋 Running ${suiteName}...`);
    const suiteStartTime = Date.now();

    try {
      const testPath = path.join(__dirname, suiteName);
      
      // Check if test file exists
      if (!fs.existsSync(testPath)) {
        throw new Error(`Test file not found: ${testPath}`);
      }

      // Run the test suite
      const command = `npx jest ${testPath} --verbose --detectOpenHandles --forceExit`;
      execSync(command, { 
        stdio: 'inherit',
        cwd: process.cwd(),
        timeout: 300000 // 5 minutes timeout
      });

      const duration = Date.now() - suiteStartTime;
      this.results.push({
        suite: suiteName,
        passed: true,
        duration
      });

      console.log(`✅ ${suiteName} passed in ${duration}ms\n`);

    } catch (error) {
      const duration = Date.now() - suiteStartTime;
      this.results.push({
        suite: suiteName,
        passed: false,
        duration,
        error: error instanceof Error ? error.message : String(error)
      });

      console.log(`❌ ${suiteName} failed in ${duration}ms`);
      console.log(`Error: ${error}\n`);
    }
  }

  private generateReport(): void {
    const totalDuration = Date.now() - this.startTime;
    const passedTests = this.results.filter(r => r.passed).length;
    const failedTests = this.results.filter(r => !r.passed).length;

    console.log('\n📊 End-to-End Test Results');
    console.log('============================');
    console.log(`Total Suites: ${this.results.length}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Total Duration: ${totalDuration}ms (${(totalDuration / 1000).toFixed(2)}s)`);
    console.log('');

    // Detailed results
    console.log('📋 Detailed Results:');
    console.log('--------------------');
    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      const duration = `${result.duration}ms`;
      console.log(`${status} ${result.suite.padEnd(35)} ${duration.padStart(10)}`);
      
      if (!result.passed && result.error) {
        console.log(`   Error: ${result.error}`);
      }
    });

    // Performance summary
    console.log('\n⚡ Performance Summary:');
    console.log('----------------------');
    const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length;
    const slowestTest = this.results.reduce((prev, current) => 
      prev.duration > current.duration ? prev : current
    );
    const fastestTest = this.results.reduce((prev, current) => 
      prev.duration < current.duration ? prev : current
    );

    console.log(`Average Duration: ${avgDuration.toFixed(2)}ms`);
    console.log(`Slowest Test: ${slowestTest.suite} (${slowestTest.duration}ms)`);
    console.log(`Fastest Test: ${fastestTest.suite} (${fastestTest.duration}ms)`);

    // Generate JSON report
    this.generateJSONReport();

    // Exit with appropriate code
    process.exit(failedTests > 0 ? 1 : 0);
  }

  private generateJSONReport(): void {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => !r.passed).length,
        totalDuration: Date.now() - this.startTime
      },
      results: this.results,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch
      }
    };

    const reportPath = path.join(process.cwd(), 'e2e-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 JSON report saved to: ${reportPath}`);
  }
}

// Run if called directly
if (require.main === module) {
  const runner = new E2ETestRunner();
  runner.runAllTests().catch(error => {
    console.error('Failed to run E2E tests:', error);
    process.exit(1);
  });
}

export { E2ETestRunner };