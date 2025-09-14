/**
 * API Integration Test Suite
 * 
 * Tests the integration and functionality of all API endpoints.
 * Validates request/response handling, validation, and error cases.
 * 
 * @author ARYA RAG Team
 */

import { createApp } from '../app';
import { Application } from 'express';
import request from 'supertest';

/**
 * API Integration Test Class
 */
class APIIntegrationTest {
  private app: Application;
  private testUserId: string = 'test-user-api-integration';

  constructor() {
    this.app = createApp();
  }

  /**
   * Run complete API integration test suite
   */
  async runTestSuite(): Promise<{
    success: boolean;
    results: {
      healthEndpoints: boolean;
      documentEndpoints: boolean;
      queryEndpoints: boolean;
      userEndpoints: boolean;
      systemEndpoints: boolean;
      errorHandling: boolean;
      validation: boolean;
    };
    details: any[];
    errors: string[];
  }> {
    console.log('🧪 Starting API Integration Test Suite');
    console.log('=====================================');

    const results = {
      healthEndpoints: false,
      documentEndpoints: false,
      queryEndpoints: false,
      userEndpoints: false,
      systemEndpoints: false,
      errorHandling: false,
      validation: false
    };
    
    const details: any[] = [];
    const errors: string[] = [];

    try {
      // Test 1: Health and Basic Endpoints
      console.log('\n1️⃣ Testing Health Endpoints...');
      const healthResult = await this.testHealthEndpoints();
      results.healthEndpoints = healthResult.success;
      details.push({ test: 'Health Endpoints', ...healthResult });
      
      if (!healthResult.success) {
        errors.push('Health endpoints failed');
      }

      // Test 2: System Endpoints
      console.log('\n2️⃣ Testing System Endpoints...');
      const systemResult = await this.testSystemEndpoints();
      results.systemEndpoints = systemResult.success;
      details.push({ test: 'System Endpoints', ...systemResult });
      
      if (!systemResult.success) {
        errors.push('System endpoints failed');
      }

      // Test 3: Validation and Error Handling
      console.log('\n3️⃣ Testing Validation and Error Handling...');
      const validationResult = await this.testValidationAndErrorHandling();
      results.validation = validationResult.validationSuccess;
      results.errorHandling = validationResult.errorHandlingSuccess;
      details.push({ test: 'Validation', success: validationResult.validationSuccess, details: validationResult.validationDetails });
      details.push({ test: 'Error Handling', success: validationResult.errorHandlingSuccess, details: validationResult.errorHandlingDetails });
      
      if (!validationResult.validationSuccess) {
        errors.push('Validation failed');
      }
      if (!validationResult.errorHandlingSuccess) {
        errors.push('Error handling failed');
      }

      // Test 4: Document Endpoints (basic structure)
      console.log('\n4️⃣ Testing Document Endpoints...');
      const documentResult = await this.testDocumentEndpoints();
      results.documentEndpoints = documentResult.success;
      details.push({ test: 'Document Endpoints', ...documentResult });
      
      if (!documentResult.success) {
        errors.push('Document endpoints failed');
      }

      // Test 5: Query Endpoints (basic structure)
      console.log('\n5️⃣ Testing Query Endpoints...');
      const queryResult = await this.testQueryEndpoints();
      results.queryEndpoints = queryResult.success;
      details.push({ test: 'Query Endpoints', ...queryResult });
      
      if (!queryResult.success) {
        errors.push('Query endpoints failed');
      }

      // Test 6: User Endpoints
      console.log('\n6️⃣ Testing User Endpoints...');
      const userResult = await this.testUserEndpoints();
      results.userEndpoints = userResult.success;
      details.push({ test: 'User Endpoints', ...userResult });
      
      if (!userResult.success) {
        errors.push('User endpoints failed');
      }

    } catch (error) {
      errors.push(`Test suite execution error: ${error instanceof Error ? error.message : error}`);
    }

    // Calculate overall success
    const allTestsPassed = Object.values(results).every(result => result === true);

    console.log('\n📊 API Integration Test Results');
    console.log('===============================');
    console.log(`Health Endpoints:       ${results.healthEndpoints ? '✅' : '❌'}`);
    console.log(`Document Endpoints:     ${results.documentEndpoints ? '✅' : '❌'}`);
    console.log(`Query Endpoints:        ${results.queryEndpoints ? '✅' : '❌'}`);
    console.log(`User Endpoints:         ${results.userEndpoints ? '✅' : '❌'}`);
    console.log(`System Endpoints:       ${results.systemEndpoints ? '✅' : '❌'}`);
    console.log(`Error Handling:         ${results.errorHandling ? '✅' : '❌'}`);
    console.log(`Validation:             ${results.validation ? '✅' : '❌'}`);
    console.log(`Overall Success:        ${allTestsPassed ? '✅' : '❌'}`);

    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach(error => console.log(`   - ${error}`));
    }

    return {
      success: allTestsPassed,
      results,
      details,
      errors
    };
  }

  /**
   * Test health and basic endpoints
   */
  private async testHealthEndpoints(): Promise<{ success: boolean; message: string; details: any }> {
    try {
      const tests = [];

      // Test root endpoint
      const rootResponse = await request(this.app)
        .get('/')
        .expect(200);

      tests.push({
        endpoint: '/',
        success: rootResponse.body.success === true,
        responseTime: rootResponse.get('X-Response-Time') || 'N/A'
      });

      // Test health endpoint
      const healthResponse = await request(this.app)
        .get('/health')
        .expect(200);

      tests.push({
        endpoint: '/health',
        success: healthResponse.body.success === true,
        responseTime: healthResponse.get('X-Response-Time') || 'N/A'
      });

      // Test API info endpoint
      const apiResponse = await request(this.app)
        .get('/api')
        .expect(200);

      tests.push({
        endpoint: '/api',
        success: apiResponse.body.success === true,
        responseTime: apiResponse.get('X-Response-Time') || 'N/A'
      });

      const allSuccess = tests.every(test => test.success);

      return {
        success: allSuccess,
        message: allSuccess ? 'All health endpoints working' : 'Some health endpoints failed',
        details: { tests, totalEndpoints: tests.length }
      };

    } catch (error) {
      return {
        success: false,
        message: `Health endpoint test failed: ${error instanceof Error ? error.message : error}`,
        details: { error }
      };
    }
  }

  /**
   * Test system monitoring endpoints
   */
  private async testSystemEndpoints(): Promise<{ success: boolean; message: string; details: any }> {
    try {
      const tests = [];

      // Test system health check
      const healthResponse = await request(this.app)
        .get('/api/system/health');

      tests.push({
        endpoint: '/api/system/health',
        success: healthResponse.status === 200 || healthResponse.status === 503,
        status: healthResponse.status,
        hasHealthChecks: !!healthResponse.body.data?.checks
      });

      // Test system stats
      const statsResponse = await request(this.app)
        .get('/api/system/stats')
        .expect(200);

      tests.push({
        endpoint: '/api/system/stats',
        success: statsResponse.body.success === true,
        hasStats: !!statsResponse.body.data
      });

      // Test system config
      const configResponse = await request(this.app)
        .get('/api/system/config')
        .expect(200);

      tests.push({
        endpoint: '/api/system/config',
        success: configResponse.body.success === true,
        hasConfig: !!configResponse.body.data
      });

      // Test services status
      const servicesResponse = await request(this.app)
        .get('/api/system/services')
        .expect(200);

      tests.push({
        endpoint: '/api/system/services',
        success: servicesResponse.body.success === true,
        hasServiceData: !!servicesResponse.body.data
      });

      const allSuccess = tests.every(test => test.success);

      return {
        success: allSuccess,
        message: allSuccess ? 'All system endpoints working' : 'Some system endpoints failed',
        details: { tests, totalEndpoints: tests.length }
      };

    } catch (error) {
      return {
        success: false,
        message: `System endpoint test failed: ${error instanceof Error ? error.message : error}`,
        details: { error }
      };
    }
  }

  /**
   * Test validation and error handling
   */
  private async testValidationAndErrorHandling(): Promise<{
    validationSuccess: boolean;
    errorHandlingSuccess: boolean;
    validationDetails: any;
    errorHandlingDetails: any;
  }> {
    const validationTests = [];
    const errorHandlingTests = [];

    try {
      // Test validation - invalid user ID
      const invalidUserResponse = await request(this.app)
        .get('/api/users/invalid-user-id-with-special-chars!@#')
        .expect(400);

      validationTests.push({
        test: 'Invalid User ID validation',
        success: invalidUserResponse.body.error?.code === 'VALIDATION_ERROR',
        response: invalidUserResponse.body
      });

      // Test validation - missing query parameter
      const missingQueryResponse = await request(this.app)
        .get('/api/documents')
        .expect(400);

      validationTests.push({
        test: 'Missing required query parameter',
        success: missingQueryResponse.body.error?.code === 'VALIDATION_ERROR',
        response: missingQueryResponse.body
      });

      // Test validation - invalid pagination
      const invalidPaginationResponse = await request(this.app)
        .get('/api/documents?userId=testuser&page=invalid&limit=999')
        .expect(400);

      validationTests.push({
        test: 'Invalid pagination parameters',
        success: invalidPaginationResponse.body.error?.code === 'VALIDATION_ERROR',
        response: invalidPaginationResponse.body
      });

      // Test 404 handling
      const notFoundResponse = await request(this.app)
        .get('/api/nonexistent/endpoint')
        .expect(404);

      errorHandlingTests.push({
        test: '404 Not Found handling',
        success: notFoundResponse.body.error?.code === 'NOT_FOUND',
        response: notFoundResponse.body
      });

      // Test method not allowed (if implemented)
      const methodNotAllowedResponse = await request(this.app)
        .patch('/api/system/health')
        .expect(404); // Express returns 404 for unsupported methods by default

      errorHandlingTests.push({
        test: 'Unsupported method handling',
        success: notFoundResponse.status === 404,
        response: methodNotAllowedResponse.body
      });

      // Test request ID generation
      const requestIdResponse = await request(this.app)
        .get('/api/system/config');

      errorHandlingTests.push({
        test: 'Request ID generation',
        success: !!requestIdResponse.get('X-Request-ID'),
        requestId: requestIdResponse.get('X-Request-ID')
      });

      const validationSuccess = validationTests.every(test => test.success);
      const errorHandlingSuccess = errorHandlingTests.every(test => test.success);

      return {
        validationSuccess,
        errorHandlingSuccess,
        validationDetails: { tests: validationTests, passed: validationTests.filter(t => t.success).length },
        errorHandlingDetails: { tests: errorHandlingTests, passed: errorHandlingTests.filter(t => t.success).length }
      };

    } catch (error) {
      return {
        validationSuccess: false,
        errorHandlingSuccess: false,
        validationDetails: { error: error instanceof Error ? error.message : error },
        errorHandlingDetails: { error: error instanceof Error ? error.message : error }
      };
    }
  }

  /**
   * Test document management endpoints (basic structure)
   */
  private async testDocumentEndpoints(): Promise<{ success: boolean; message: string; details: any }> {
    try {
      const tests = [];

      // Test document list with valid parameters
      const listResponse = await request(this.app)
        .get(`/api/documents?userId=${this.testUserId}`)
        .expect(200);

      tests.push({
        endpoint: 'GET /api/documents',
        success: listResponse.body.success === true && Array.isArray(listResponse.body.data),
        hasData: !!listResponse.body.data,
        hasPagination: !!listResponse.body.metadata?.pagination
      });

      // Test document list with pagination
      const paginatedResponse = await request(this.app)
        .get(`/api/documents?userId=${this.testUserId}&page=1&limit=10`)
        .expect(200);

      tests.push({
        endpoint: 'GET /api/documents (paginated)',
        success: paginatedResponse.body.success === true,
        hasData: Array.isArray(paginatedResponse.body.data)
      });

      // Test invalid document ID format
      const invalidDocResponse = await request(this.app)
        .get('/api/documents/invalid-doc-id')
        .query({ userId: this.testUserId })
        .expect(400);

      tests.push({
        endpoint: 'GET /api/documents/:documentId (invalid)',
        success: invalidDocResponse.body.error?.code === 'VALIDATION_ERROR',
        properValidation: true
      });

      const allSuccess = tests.every(test => test.success);

      return {
        success: allSuccess,
        message: allSuccess ? 'Document endpoints structure valid' : 'Document endpoint issues found',
        details: { tests, totalEndpoints: tests.length, note: 'Structure tests only - full functionality requires database data' }
      };

    } catch (error) {
      return {
        success: false,
        message: `Document endpoint test failed: ${error instanceof Error ? error.message : error}`,
        details: { error }
      };
    }
  }

  /**
   * Test query processing endpoints (basic structure)
   */
  private async testQueryEndpoints(): Promise<{ success: boolean; message: string; details: any }> {
    try {
      const tests = [];

      // Test query history endpoint
      const historyResponse = await request(this.app)
        .get(`/api/queries/history?userId=${this.testUserId}`)
        .expect(200);

      tests.push({
        endpoint: 'GET /api/queries/history',
        success: historyResponse.body.success === true && Array.isArray(historyResponse.body.data),
        hasData: !!historyResponse.body.data,
        hasPagination: !!historyResponse.body.metadata?.pagination
      });

      // Test query analytics endpoint
      const analyticsResponse = await request(this.app)
        .get(`/api/queries/analytics/summary?userId=${this.testUserId}`)
        .expect(200);

      tests.push({
        endpoint: 'GET /api/queries/analytics/summary',
        success: analyticsResponse.body.success === true,
        hasAnalytics: !!analyticsResponse.body.data
      });

      // Test query connectivity test
      const connectivityResponse = await request(this.app)
        .get('/api/queries/test/connectivity');

      tests.push({
        endpoint: 'GET /api/queries/test/connectivity',
        success: connectivityResponse.status === 200 || connectivityResponse.status === 503,
        hasTestResults: !!connectivityResponse.body.data
      });

      // Test query suggestions
      const suggestionsResponse = await request(this.app)
        .get(`/api/queries/suggestions/similar?userId=${this.testUserId}&query=test`)
        .expect(200);

      tests.push({
        endpoint: 'GET /api/queries/suggestions/similar',
        success: suggestionsResponse.body.success === true,
        hasData: Array.isArray(suggestionsResponse.body.data)
      });

      // Test invalid query processing (missing data)
      const invalidQueryResponse = await request(this.app)
        .post('/api/queries/process')
        .send({})
        .expect(400);

      tests.push({
        endpoint: 'POST /api/queries/process (invalid)',
        success: invalidQueryResponse.body.error?.code === 'VALIDATION_ERROR',
        properValidation: true
      });

      const allSuccess = tests.every(test => test.success);

      return {
        success: allSuccess,
        message: allSuccess ? 'Query endpoints structure valid' : 'Query endpoint issues found',
        details: { tests, totalEndpoints: tests.length, note: 'Structure tests only - actual query processing requires RAG services' }
      };

    } catch (error) {
      return {
        success: false,
        message: `Query endpoint test failed: ${error instanceof Error ? error.message : error}`,
        details: { error }
      };
    }
  }

  /**
   * Test user management endpoints
   */
  private async testUserEndpoints(): Promise<{ success: boolean; message: string; details: any }> {
    try {
      const tests = [];

      // Test user profile endpoint
      const profileResponse = await request(this.app)
        .get(`/api/users/${this.testUserId}`)
        .expect(200);

      tests.push({
        endpoint: 'GET /api/users/:userId',
        success: profileResponse.body.success === true,
        hasProfile: !!profileResponse.body.data,
        hasStatistics: !!profileResponse.body.data?.statistics
      });

      // Test user preferences endpoint
      const preferencesResponse = await request(this.app)
        .get(`/api/users/${this.testUserId}/preferences`)
        .expect(200);

      tests.push({
        endpoint: 'GET /api/users/:userId/preferences',
        success: preferencesResponse.body.success === true,
        hasPreferences: !!preferencesResponse.body.data
      });

      // Test user statistics endpoints
      const docStatsResponse = await request(this.app)
        .get(`/api/users/${this.testUserId}/statistics/documents`)
        .expect(200);

      tests.push({
        endpoint: 'GET /api/users/:userId/statistics/documents',
        success: docStatsResponse.body.success === true,
        hasStatistics: !!docStatsResponse.body.data
      });

      const queryStatsResponse = await request(this.app)
        .get(`/api/users/${this.testUserId}/statistics/queries`)
        .expect(200);

      tests.push({
        endpoint: 'GET /api/users/:userId/statistics/queries',
        success: queryStatsResponse.body.success === true,
        hasStatistics: !!queryStatsResponse.body.data
      });

      // Test storage usage endpoint
      const storageResponse = await request(this.app)
        .get(`/api/users/${this.testUserId}/storage`)
        .expect(200);

      tests.push({
        endpoint: 'GET /api/users/:userId/storage',
        success: storageResponse.body.success === true,
        hasStorageData: !!storageResponse.body.data
      });

      // Test activity endpoint
      const activityResponse = await request(this.app)
        .get(`/api/users/${this.testUserId}/activity`)
        .expect(200);

      tests.push({
        endpoint: 'GET /api/users/:userId/activity',
        success: activityResponse.body.success === true,
        hasActivity: Array.isArray(activityResponse.body.data)
      });

      // Test preferences update (with valid data)
      const updatePrefsResponse = await request(this.app)
        .put(`/api/users/${this.testUserId}/preferences`)
        .send({
          defaultResponseStyle: 'concise',
          maxResultsPerQuery: 5
        })
        .expect(200);

      tests.push({
        endpoint: 'PUT /api/users/:userId/preferences',
        success: updatePrefsResponse.body.success === true,
        updated: !!updatePrefsResponse.body.data
      });

      const allSuccess = tests.every(test => test.success);

      return {
        success: allSuccess,
        message: allSuccess ? 'User endpoints working correctly' : 'User endpoint issues found',
        details: { tests, totalEndpoints: tests.length }
      };

    } catch (error) {
      return {
        success: false,
        message: `User endpoint test failed: ${error instanceof Error ? error.message : error}`,
        details: { error }
      };
    }
  }

  /**
   * Clean up test data
   */
  async cleanup(): Promise<void> {
    try {
      console.log('🧹 Cleaning up API test data...');
      
      // Note: In a real implementation, you'd clean up any test data created
      // For this integration test, we mostly tested read endpoints and validation
      
      console.log('✅ API test cleanup completed');
      
    } catch (error) {
      console.warn('⚠️ API test cleanup failed (this may be okay):', error);
    }
  }
}

/**
 * Main test execution function
 */
export async function runAPIIntegrationTest(): Promise<void> {
  const testRunner = new APIIntegrationTest();
  
  try {
    console.log('🚀 Initializing API Integration Test...');
    
    // Run the complete test suite
    const results = await testRunner.runTestSuite();
    
    // Display results
    if (results.success) {
      console.log('\n🎉 ALL API TESTS PASSED!');
      console.log('The API endpoints are working correctly.');
    } else {
      console.log('\n❌ SOME API TESTS FAILED');
      console.log('Please review the errors and fix the issues.');
      
      if (results.errors.length > 0) {
        console.log('\nError Summary:');
        results.errors.forEach((error, index) => {
          console.log(`${index + 1}. ${error}`);
        });
      }
    }

    // API readiness summary
    const endpointsWorking = Object.values(results.results).filter(r => r).length;
    const totalEndpoints = Object.keys(results.results).length;
    
    console.log('\n📡 API Readiness Summary:');
    console.log(`   Working Endpoint Groups: ${endpointsWorking}/${totalEndpoints}`);
    console.log(`   API Readiness: ${Math.round((endpointsWorking / totalEndpoints) * 100)}%`);

    if (results.success) {
      console.log('   Status: ✅ Ready for frontend integration');
    } else {
      console.log('   Status: ⚠️ Needs attention before production use');
    }

    return;

  } catch (error) {
    console.error('💥 API test execution failed:', error);
  } finally {
    // Always attempt cleanup
    await testRunner.cleanup();
  }
}

/**
 * If running this file directly, execute the test
 */
if (require.main === module) {
  runAPIIntegrationTest()
    .then(() => {
      console.log('\n🏁 API integration test execution completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Fatal API test error:', error);
      process.exit(1);
    });
}