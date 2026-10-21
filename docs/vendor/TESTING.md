# Testing Guide for VLR Website

## Quick Start

### 1. Install Test Dependencies

```bash
npm install
```

This installs Mocha, Chai, and Supertest for testing.

**Note**: An `.npmrc` file with `ignore-scripts=true` has been created to bypass the semantic-ui interactive installer.

### 2. Run Tests

```bash
npm test
```

You should see output like:

```
  SEO Helpers
    toSlug()
      ✓ should convert text to URL-friendly slug
      ✓ should handle special characters
    ...
    
  30 passing (2s)
```

## Test Status

✅ **All 30 unit tests passing**

## What Gets Tested

### ✅ New SEO Features
- Meta description generation for all page types
- Meta description length enforcement (120-158 characters)
- HTML sanitization
- URL slug generation
- SEO middleware functionality

### ✅ Existing Functionality (Regression Tests)
- SEO helper functions work correctly
- Middleware attaches data to res.locals
- Error handling works gracefully
- Special characters handled correctly

## Test Files

```
test/
├── unit/
│   ├── seoHelpers.test.js      # 20 tests for SEO helper functions
│   └── seoMiddleware.test.js   # 10 tests for middleware
└── integration/
    └── routes.test.js          # Integration tests (requires running server)
```

**Total: 30 unit tests passing**

## Running Tests

### Unit Tests (Default)

Unit tests run without requiring database connections or external services:

```bash
npm test                    # Run all unit tests
npm run test:unit          # Run unit tests explicitly
npm run test:watch         # Run tests in watch mode
```

### Integration Tests

Integration tests require a running server with database and AWS connections:

```bash
npm run test:integration   # Run integration tests (requires server setup)
```

**Note**: Integration tests are currently disabled in the default `npm test` command because they require:
- MongoDB connection
- AWS S3 configuration
- Full application dependencies

### All Tests

```bash
npm run test:all           # Run both unit and integration tests
```

## Before You Deploy

Always run tests before deploying:

```bash
npm test
```

If all tests pass (✓), your changes are safe to deploy.

If any test fails (✗), fix the issue before deploying.

## Test Coverage

### SEO Helpers (`lib/seoHelpers.js`)

**20 tests covering:**
- `toSlug()` - URL-friendly slug generation (4 tests)
- `sanitizeForMeta()` - HTML tag/entity removal (4 tests)
- `enforceMetaLength()` - Meta description length validation (4 tests)
- `generateSeoMetadata()` - Page-specific metadata generation (8 tests)

**Tested page types:**
- Homepage
- Owners landing page
- Area pages (Vancouver, North Vancouver, etc.)
- Property listings
- Blog posts
- Unknown/fallback pages

### SEO Middleware (`middlewares/seo.js`)

**10 tests covering:**
- Middleware function structure
- Error handling
- Data extraction from requests
- Integration with seoHelpers
- res.locals population
- Different page types (homepage, owners, property, area)

## Common Test Scenarios

### Scenario 1: Adding a New Route

When you add a new route with SEO middleware, the unit tests will verify the middleware works correctly.

### Scenario 2: Modifying SEO Logic

When you change SEO logic, update tests:

```javascript
// test/unit/seoHelpers.test.js
it('should generate correct meta for new page type', function() {
  var result = seoHelpers.generateSeoMetadata({
    pageType: 'newType',
    data: {}
  });
  expect(result.seoTitle).to.include('Expected Text');
});
```

### Scenario 3: Checking for Regressions

Run tests after pulling changes:

```bash
git pull
npm install  # In case dependencies changed
npm test     # Verify nothing broke
```

## Continuous Testing

### Watch Mode

Auto-run tests when files change:

```bash
npm run test:watch
```

Leave this running while you code. Tests re-run automatically.

### Pre-Commit Hook (Optional)

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/sh
npm test
if [ $? -ne 0 ]; then
  echo "Tests failed. Commit aborted."
  exit 1
fi
```

This prevents committing broken code.

## Installation Issues

### Semantic UI Interactive Installer

The project uses `semantic-ui` which has an interactive installer that blocks `npm install`. 

**Solution**: An `.npmrc` file has been created with `ignore-scripts=true` to bypass post-install scripts.

```bash
# This now works without interactive prompts
npm install
```

## Troubleshooting

### "Cannot find module 'chai'"

```bash
npm install
```

### Tests timeout

Timeout is set to 5000ms. If tests timeout, increase in `package.json`:

```json
"test": "mocha \"test/unit/**/*.test.js\" --timeout 10000"
```

### Integration tests fail

Integration tests require full application setup. Make sure:
- MongoDB is running
- AWS credentials are configured
- All environment variables are set
- Database has test data

## Next Steps

1. ✅ Install dependencies: `npm install` - **COMPLETE**
2. ✅ Run tests: `npm test` - **COMPLETE (30 passing)**
3. ✅ Verify all unit tests pass - **COMPLETE**
4. ⏳ Test on running server to verify SEO changes work
5. ⏳ Add integration tests when server setup is ready

## Questions?

See `test/README.md` for detailed documentation.
