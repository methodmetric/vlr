# VLR Website Tests

This directory contains automated tests to ensure the website functions correctly and that new changes don't break existing functionality.

## Test Structure

```
test/
├── unit/                    # Unit tests for individual functions
│   ├── seoHelpers.test.js  # Tests for SEO metadata generation
│   └── seoMiddleware.test.js # Tests for SEO middleware
├── integration/             # Integration tests for routes
│   └── routes.test.js      # Tests for route responses and SEO integration
└── README.md               # This file
```

## Running Tests

### Install Test Dependencies

First, install the testing frameworks:

```bash
npm install
```

This will install:
- **Mocha**: Test framework
- **Chai**: Assertion library
- **Supertest**: HTTP testing library

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

Automatically re-run tests when files change:

```bash
npm run test:watch
```

### Run Specific Test Files

```bash
# Run only SEO helpers tests
npx mocha test/unit/seoHelpers.test.js

# Run only middleware tests
npx mocha test/unit/seoMiddleware.test.js

# Run only integration tests
npx mocha test/integration/routes.test.js
```

## What the Tests Cover

### Unit Tests

**SEO Helpers (`test/unit/seoHelpers.test.js`)**
- ✅ URL slug generation
- ✅ HTML sanitization
- ✅ Meta description length enforcement (120-158 chars)
- ✅ Metadata generation for all page types
- ✅ Error handling for invalid inputs

**SEO Middleware (`test/unit/seoMiddleware.test.js`)**
- ✅ Middleware creation and configuration
- ✅ Data injection into `res.locals`
- ✅ Data extraction from requests
- ✅ Error handling and fallback values
- ✅ Proper `next()` calling

### Integration Tests

**Routes (`test/integration/routes.test.js`)**
- ✅ Homepage responds with 200 status
- ✅ Owners page responds with 200 status
- ✅ All area pages respond with 200 status
- ✅ Each page has unique meta description
- ✅ Meta descriptions are within length limits
- ✅ Existing routes still work (backward compatibility)
- ✅ 404 handling still works

## Test Results Interpretation

### Successful Test Run

```
  SEO Helpers
    toSlug()
      ✓ should convert text to URL-friendly slug
      ✓ should handle special characters
      ...
    
  SEO Middleware
    ✓ should attach SEO data to res.locals
    ✓ should call next() after attaching data
    ...
    
  Route Integration Tests
    ✓ Homepage should respond with 200 status
    ✓ should have unique meta description
    ...

  45 passing (2s)
```

### Failed Test

If a test fails, you'll see:

```
  1) SEO Helpers
       enforceMetaLength()
         should truncate descriptions over 158 characters:
     
     AssertionError: expected 200 to be at most 158
```

This indicates what broke and where to look.

## Adding New Tests

When adding new features, add corresponding tests:

1. **Unit tests** for new utility functions
2. **Integration tests** for new routes
3. **Regression tests** to ensure old functionality still works

### Example: Adding a Test

```javascript
// test/unit/myNewFeature.test.js
var expect = require('chai').expect;
var myFeature = require('../../lib/myNewFeature');

describe('My New Feature', function() {
  it('should do something', function() {
    var result = myFeature.doSomething();
    expect(result).to.equal('expected value');
  });
});
```

## Continuous Integration

These tests should be run:
- ✅ Before committing code
- ✅ Before deploying to production
- ✅ After pulling changes from the repository

## Troubleshooting

### Tests fail with "Cannot find module"

Run `npm install` to install dependencies.

### Tests timeout

Increase timeout in package.json:
```json
"test": "mocha test/**/*.test.js --timeout 10000"
```

### Database connection errors

Integration tests use mocked routes and don't require database connection. If you see database errors, ensure you're not accidentally connecting to the real database in tests.

## Coverage

To see test coverage (what percentage of code is tested):

```bash
npm install --save-dev nyc
npx nyc npm test
```

This will show which lines of code are covered by tests.
