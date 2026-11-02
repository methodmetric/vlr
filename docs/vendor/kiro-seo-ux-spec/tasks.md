# Implementation Plan: SEO and UX Improvements

## Overview

This implementation plan breaks down the SEO and UX improvements into discrete, actionable coding tasks. The approach follows the existing Node.js/Express/EJS architecture, extending the current `buildPropertiesSeo()` pattern from `routes/properties.js` and leveraging the existing template system that supports `seoTitle`, `seoDescription`, `canonicalUrl`, `ogImage`, and `structuredData` variables.

The implementation is organized into logical phases that build incrementally, allowing for validation at each checkpoint. Each task references specific requirements for traceability and includes verification steps to ensure backward compatibility.

**Key Principles:**
- Extend existing patterns rather than replacing them
- Use middleware to inject SEO data without modifying core route logic
- Preserve all existing functionality and user workflows
- Follow the established `buildPropertiesSeo()` pattern for consistency

## Tasks

- [ ] 1. Foundation & Infrastructure Setup
  - [x] 1.1 Create SEO helpers library
    - Create `lib/seoHelpers.js` with `generateSeoMetadata()` function
    - Implement page type handlers for homepage, owners, area, property, and blog
    - Implement `sanitizeForMeta()` function to strip HTML tags and entities
    - Implement `enforceMetaLength()` function to ensure 120-158 character constraint
    - Implement `toSlug()` helper function (if not already available globally)
    - Export all helper functions for use in middleware and routes
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 1.2 Write unit tests for SEO helpers
    - Test meta description generation for each page type
    - Test character length enforcement (under 120, 120-158, over 158)
    - Test HTML sanitization with various HTML entities and tags
    - Test slug generation with special characters and spaces
    - _Requirements: 1.5, 1.6_

  - [x] 1.3 Create SEO middleware
    - Create `middlewares/seo.js` with `seoMiddleware()` function
    - Implement middleware factory that accepts `pageType` and `dataExtractor` options
    - Attach SEO metadata to `res.locals` for template access
    - Ensure middleware calls `next()` to continue request chain
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [ ]* 1.4 Write unit tests for SEO middleware
    - Test middleware attaches correct data to `res.locals`
    - Test middleware calls `next()` properly
    - Test middleware handles missing data gracefully
    - _Requirements: 1.1_

- [ ] 2. Open Graph Image Infrastructure
  - [ ] 2.1 Create OG image manager library
    - Create `lib/ogImages.js` with `getOgImage()` function
    - Implement image mapping for homepage, owners, area, property, and blog page types
    - Implement fallback logic for missing images
    - Implement `generateOgTags()` function to create complete OG meta tag object
    - Ensure property images use existing S3 URL pattern from `routes/properties.js`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ] 2.2 Create default OG images directory
    - Create `public/og-images/` directory structure
    - Create placeholder files for default images (vlr-default.jpg, vlr-homepage.jpg, vlr-owners.jpg, vlr-blog-default.jpg, vlr-default-property.jpg)
    - Document image requirements (1200×630 pixels, <1MB, JPEG/PNG) in README
    - _Requirements: 8.1, 8.2, 8.5_

  - [ ]* 2.3 Write unit tests for OG image manager
    - Test image URL generation for each page type
    - Test fallback logic when specific images are unavailable
    - Test OG tag generation includes all required properties
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6_

  - [ ] 2.4 Integrate OG image manager into SEO helpers
    - Update `generateSeoMetadata()` in `lib/seoHelpers.js` to call `getOgImage()`
    - Ensure `ogImage` field is populated in returned metadata object
    - Verify OG tags are included in `structuredData` when appropriate
    - _Requirements: 8.6, 8.7_

- [ ] 3. Checkpoint - Foundation Validation
  - Ensure all tests pass for SEO helpers and middleware
  - Verify helper functions can be imported and called from other modules
  - Verify OG image directory structure is created correctly
  - Ask the user if questions arise

- [ ] 4. Homepage Meta Description Implementation
  - [x] 4.1 Update homepage route with SEO middleware
    - Open `routes/index.js` (or main homepage route file)
    - Import `seoMiddleware` from `middlewares/seo.js`
    - Add `seoMiddleware({ pageType: 'homepage' })` to homepage route
    - Verify existing homepage functionality remains unchanged
    - _Requirements: 1.1, 10.1, 10.2, 10.3_

  - [ ]* 4.2 Write integration test for homepage SEO
    - Test homepage renders with unique meta description
    - Test meta description length is within 120-158 characters
    - Test OG tags are present in rendered HTML
    - Test canonical URL is correct
    - _Requirements: 1.1, 1.5, 11.3, 11.4_

- [ ] 5. Owner Landing Page Meta Description and Content
  - [x] 5.1 Update owner landing page route with SEO middleware
    - Locate or create `routes/owners.js`
    - Import `seoMiddleware` from `middlewares/seo.js`
    - Add `seoMiddleware({ pageType: 'owners' })` to `/owners` route
    - Verify existing owner page functionality remains unchanged
    - _Requirements: 1.2, 10.1, 10.2, 10.3_

  - [ ] 5.2 Enhance owner landing page template content
    - Open `views/owners.ejs` (or create if it doesn't exist)
    - Add owner-focused headline above the fold
    - Add trust signals section (BCREA licensing, REBGV membership, E&O insurance)
    - Add management process section with step-by-step explanation
    - Add FAQ section with at least 5 questions for first-time landlords
    - Add onboarding timeline "What to Expect" section
    - Add differentiator comparison table (VLR vs typical property managers)
    - Structure content with proper heading hierarchy (H1 → H2 → H3)
    - Ensure narrative flow: problem → solution → proof → action
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [ ]* 5.3 Write integration test for owner landing page
    - Test owner page renders with unique meta description
    - Test all required content sections are present
    - Test heading hierarchy is correct (one H1, proper H2/H3 nesting)
    - Test contact form is functional
    - _Requirements: 1.2, 4.1, 4.2, 4.3, 4.4, 11.1, 11.2_

- [ ] 6. Navigation Restructuring
  - [ ] 6.1 Update navigation bar template
    - Open `views/navigationBar.ejs`
    - Reorder navigation items to place "For Owners" before "For Tenants"
    - Add "Free Owner Consultation" CTA button with distinct styling
    - Link CTA button to owner contact form section (e.g., `/owners#contact`)
    - Preserve all existing navigation links and URLs
    - Ensure responsive behavior for mobile and tablet viewports
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 10.3_

  - [ ]* 6.2 Write visual regression tests for navigation
    - Test navigation renders correctly on desktop viewport
    - Test navigation renders correctly on mobile viewport
    - Test "For Owners" appears before "For Tenants"
    - Test CTA button is visually distinct
    - Test CTA button navigates to correct section
    - _Requirements: 2.1, 2.2, 2.3, 2.5_

- [ ] 7. Homepage Hero Section Rebalancing
  - [ ] 7.1 Update homepage hero template
    - Open `views/index.ejs` (or main homepage template)
    - Restructure hero section into two equal-width columns
    - Add owner section with headline, value proposition, and primary CTA
    - Add tenant section with headline, search functionality, and browse CTA
    - Ensure visual balance with equal font sizes and button prominence
    - Verify both CTAs navigate correctly without page reload errors
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 10.3_

  - [ ]* 7.2 Write integration test for homepage hero
    - Test hero section renders two equal-width sections
    - Test owner CTA navigates to `/owners`
    - Test tenant CTA navigates to `/properties`
    - Test no JavaScript errors occur on CTA clicks
    - _Requirements: 3.1, 3.2, 3.3, 3.5_

- [ ] 8. Checkpoint - Core Pages Validation
  - Ensure all tests pass for homepage, owner page, and navigation
  - Manually verify navigation reordering on desktop and mobile
  - Verify hero section displays correctly with equal prominence
  - Verify all existing links and functionality work
  - Ask the user if questions arise

- [ ] 9. Area Content Expansion Infrastructure
  - [ ] 9.1 Create area content generator library
    - Create `lib/areaContent.js` with `generateAreaContent()` function
    - Implement content templates for overview, rentalMarket, ownerValue, neighbourhood, faq, and cta sections
    - Implement city-specific variable substitution
    - Ensure total content meets 600-word minimum
    - Implement proper heading hierarchy generation (H1 → H2 → H3)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.7, 11.5_

  - [ ]* 9.2 Write unit tests for area content generator
    - Test content generation for multiple cities
    - Test minimum word count validation (600 words)
    - Test heading hierarchy is correct
    - Test all required sections are present
    - _Requirements: 5.1, 5.7, 11.1, 11.2, 11.5_

  - [ ] 9.3 Create area content configuration
    - Create `config/areaContent.json` with city-specific data
    - Include market data, demographics, transit info, and amenities for each area
    - Document configuration schema for future additions
    - _Requirements: 5.2, 5.4_

- [ ] 10. Internal Linking Infrastructure
  - [ ] 10.1 Create internal link injector library
    - Create `lib/internalLinks.js` with `injectInternalLinks()` function
    - Implement link injection rules for area, owners, and blog page types
    - Use cheerio or similar HTML parser to safely inject links
    - Implement safety constraints (no links inside existing `<a>`, `<h1>`, `<h2>`, `<h3>` tags)
    - Limit to one link per target URL per page
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 10.2 Write unit tests for internal link injector
    - Test links are injected at correct insertion points
    - Test links are not injected inside existing links or headings
    - Test maximum occurrences constraint is respected
    - Test HTML structure is preserved after injection
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

- [ ] 11. Area Page Implementation
  - [ ] 11.1 Identify or create area page routes
    - Locate existing area page routes (e.g., `/property-management-*`)
    - If routes don't exist, create `routes/areas.js` with dynamic city parameter
    - Document route patterns and city parameter extraction
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ] 11.2 Update area page routes with SEO middleware and content generation
    - Import `seoMiddleware` from `middlewares/seo.js`
    - Import `generateAreaContent` from `lib/areaContent.js`
    - Import `injectInternalLinks` from `lib/internalLinks.js`
    - Add middleware to extract city parameter and generate content
    - Add `seoMiddleware({ pageType: 'area', dataExtractor: (req) => ({ city: req.params.city }) })`
    - Pass generated content to template via `res.locals`
    - _Requirements: 1.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.3_

  - [ ] 11.3 Create or update area page template
    - Create `views/area.ejs` (or update existing area template)
    - Render H1 with city name
    - Render overview section with H2 heading
    - Render rental market section with H2 heading
    - Render owner value proposition section with H2 heading
    - Render neighbourhood details section with H2 heading
    - Render FAQ section with H2 heading and H3 for each question
    - Render CTA linking to owner landing page
    - Inject internal links using `injectInternalLinks()` before rendering
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1_

  - [ ]* 11.4 Write integration tests for area pages
    - Test area page renders with unique meta description containing city name
    - Test content meets 600-word minimum
    - Test heading hierarchy is correct
    - Test internal links to owner page are present
    - Test FAQ section has 3-4 questions
    - _Requirements: 1.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 11.1, 11.2, 11.5_

- [ ] 12. Checkpoint - Area Pages Validation
  - Ensure all tests pass for area content generation and internal linking
  - Manually verify area pages render with expanded content
  - Verify internal links navigate correctly
  - Verify meta descriptions are unique per city
  - Ask the user if questions arise

- [ ] 13. Blog System - Database Model
  - [ ] 13.1 Create blog model
    - Create `models/blog.js` with Mongoose schema
    - Define schema fields: title, slug, content, excerpt, author, category, tags, publishDate, status, featuredImage, metaDescription, createdAt, updatedAt
    - Add indexes for slug, publishDate, and category+status
    - Add validation for required fields and enum constraints
    - Export BlogModel for use in routes
    - _Requirements: 7.1_

  - [ ]* 13.2 Write unit tests for blog model
    - Test model validation for required fields
    - Test slug uniqueness constraint
    - Test status enum validation
    - Test category enum validation
    - _Requirements: 7.1_

- [ ] 14. Blog System - Public Routes
  - [ ] 14.1 Create blog routes file
    - Create `routes/blog.js` with Express router
    - Import BlogModel from `models/blog.js`
    - Import `seoMiddleware` from `middlewares/seo.js`
    - Import `generateSeoMetadata` from `lib/seoHelpers.js`
    - Import `injectInternalLinks` from `lib/internalLinks.js`
    - _Requirements: 7.2, 7.3, 7.4_

  - [ ] 14.2 Implement blog index route
    - Create GET `/blog` route with pagination support
    - Query published posts with `publishDate <= now`, sorted by date descending
    - Implement pagination with 10 posts per page
    - Generate SEO metadata for blog index page
    - Render `views/blog/index.ejs` with posts and pagination data
    - _Requirements: 7.2_

  - [ ] 14.3 Implement single blog post route
    - Create GET `/blog/:slug` route
    - Query single post by slug where status is 'published'
    - Return 404 if post not found
    - Generate SEO metadata using post title and excerpt
    - Inject internal links to owner page and area pages based on content keywords
    - Render `views/blog/post.ejs` with post and SEO data
    - _Requirements: 7.3, 7.4_

  - [ ] 14.4 Register blog routes in main app
    - Open `server.js` (or main app file)
    - Import blog routes: `const blogRoutes = require('./routes/blog');`
    - Register routes: `app.use('/', blogRoutes);`
    - Verify routes are accessible
    - _Requirements: 7.2, 7.3_

- [ ] 15. Blog System - Templates
  - [ ] 15.1 Create blog index template
    - Create `views/blog/index.ejs`
    - Display list of blog posts with title, excerpt, author, and publish date
    - Implement pagination controls (previous/next, page numbers)
    - Link each post to `/blog/:slug`
    - Include SEO metadata in header
    - _Requirements: 7.2_

  - [ ] 15.2 Create blog post template
    - Create `views/blog/post.ejs`
    - Display post title as H1
    - Display author and publish date
    - Render post content with injected internal links
    - Display featured image if available
    - Include SEO metadata and OG tags in header
    - _Requirements: 7.3, 7.4_

  - [ ]* 15.3 Write integration tests for blog public routes
    - Test blog index displays published posts only
    - Test blog index pagination works correctly
    - Test single post route renders post content
    - Test single post route returns 404 for non-existent slug
    - Test internal links are injected in post content
    - _Requirements: 7.2, 7.3, 7.4_

- [ ] 16. Blog System - Admin Routes
  - [ ] 16.1 Implement blog admin list route
    - Create GET `/VLR-admin/blog` route protected by `AdminController.checkAdmin`
    - Query all blog posts (including drafts) sorted by updatedAt descending
    - Render `views/admin/blog-list.ejs` with posts
    - _Requirements: 7.6_

  - [ ] 16.2 Implement blog create routes
    - Create GET `/VLR-admin/blog/new` route protected by `AdminController.checkAdmin`
    - Render `views/admin/blog-edit.ejs` with empty post object
    - Create POST `/VLR-admin/blog/new` route protected by `AdminController.checkAdmin`
    - Generate slug from title using `toSlug()` helper
    - Sanitize HTML content to prevent XSS vulnerabilities
    - Save new blog post to database
    - Redirect to `/VLR-admin/blog` on success
    - _Requirements: 7.1, 7.6, 7.7_

  - [ ] 16.3 Implement blog edit routes
    - Create GET `/VLR-admin/blog/:id/edit` route protected by `AdminController.checkAdmin`
    - Query blog post by ID
    - Render `views/admin/blog-edit.ejs` with post object
    - Create POST `/VLR-admin/blog/:id/edit` route protected by `AdminController.checkAdmin`
    - Update blog post fields
    - Sanitize HTML content to prevent XSS vulnerabilities
    - Save updated post to database
    - Redirect to `/VLR-admin/blog` on success
    - _Requirements: 7.6, 7.7_

  - [ ] 16.4 Implement blog delete route
    - Create POST `/VLR-admin/blog/:id/delete` route protected by `AdminController.checkAdmin`
    - Delete blog post by ID
    - Redirect to `/VLR-admin/blog` on success
    - _Requirements: 7.6_

  - [ ] 16.5 Implement blog scheduling support
    - Update blog post query in public routes to filter by `publishDate <= now`
    - Allow admin to set future `publishDate` when creating/editing posts
    - Update post status to 'scheduled' when `publishDate` is in the future
    - Automatically change status to 'published' when `publishDate` is reached (via cron job or query filter)
    - _Requirements: 7.5_

- [ ] 17. Blog System - Admin Templates
  - [ ] 17.1 Create blog admin list template
    - Create `views/admin/blog-list.ejs`
    - Display table of all blog posts with title, status, author, publish date, and actions
    - Add "Create New Post" button linking to `/VLR-admin/blog/new`
    - Add "Edit" and "Delete" buttons for each post
    - _Requirements: 7.6_

  - [ ] 17.2 Create blog admin edit template
    - Create `views/admin/blog-edit.ejs`
    - Create form with fields for title, content (rich text editor), excerpt, category, tags, publish date, status, and featured image
    - Add form validation for required fields
    - Add "Save" and "Cancel" buttons
    - Support both create and edit modes (check if post object exists)
    - _Requirements: 7.1, 7.6_

  - [ ]* 17.3 Write integration tests for blog admin routes
    - Test admin can create new blog post
    - Test admin can edit existing blog post
    - Test admin can delete blog post
    - Test non-admin users cannot access admin routes
    - Test HTML content is sanitized on save
    - _Requirements: 7.6, 7.7_

- [ ] 18. Checkpoint - Blog System Validation
  - Ensure all tests pass for blog model, routes, and templates
  - Manually verify blog index displays posts correctly
  - Manually verify single post page renders with internal links
  - Manually verify admin can create, edit, and delete posts
  - Verify scheduled posts are not visible until publish date
  - Ask the user if questions arise

- [ ] 19. Property Listing Page Meta Descriptions
  - [ ] 19.1 Update property listing route with SEO middleware
    - Open `routes/properties.js`
    - Locate the single property listing route (e.g., `/listing/:slug`)
    - Add `seoMiddleware` with `pageType: 'property'` and `dataExtractor` to extract property data
    - Ensure property data includes address, city, bedrooms, bathrooms, squareFeet, rent, typeOfProperty
    - Verify existing property listing functionality remains unchanged
    - _Requirements: 1.4, 10.1, 10.2, 10.3_

  - [ ]* 19.2 Write integration test for property listing SEO
    - Test property listing renders with unique meta description
    - Test meta description includes property type, location, bedrooms, bathrooms, and rent
    - Test meta description length is within 120-158 characters
    - Test OG image uses property's primary photo
    - _Requirements: 1.4, 1.5, 8.4_

- [ ] 20. Content Structure Validator
  - [ ] 20.1 Create content validator library
    - Create `lib/contentValidator.js` with `validateContent()` function
    - Implement validation rules for H1 uniqueness, heading hierarchy, meta description length, OG tags, and word count
    - Use cheerio or similar HTML parser to analyze content structure
    - Return validation result with `valid`, `errors`, and `warnings` arrays
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 20.2 Write unit tests for content validator
    - Test H1 uniqueness validation (pass with one H1, fail with zero or multiple)
    - Test heading hierarchy validation (pass with H1→H2→H3, fail with skipped levels)
    - Test meta description length validation
    - Test OG tags presence validation
    - Test word count validation for area pages
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ] 20.3 Create validation report generator
    - Create script `scripts/validateSiteContent.js`
    - Crawl all site pages (homepage, owner page, area pages, property listings, blog posts)
    - Run `validateContent()` on each page
    - Generate summary report with pass/fail status for each page
    - Log specific errors with page URL and failure reason
    - _Requirements: 11.6, 11.7_

  - [ ]* 20.4 Write integration test for validation report
    - Test validation script can be executed
    - Test validation report includes all page types
    - Test validation report correctly identifies errors
    - _Requirements: 11.6, 11.7_

- [ ] 21. A/B Testing and Monitoring Infrastructure
  - [ ] 21.1 Create A/B test monitor library
    - Create `lib/abTestMonitor.js` with Google Search Console API integration
    - Implement `recordBaselineMetrics()` function to capture current meta description performance
    - Implement `trackNewMetrics()` function to monitor new meta description performance
    - Implement `generateComparisonReport()` function to compare before/after metrics after 60 days
    - Implement exponential backoff retry logic for API errors
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6_

  - [ ] 21.2 Create A/B test dashboard route
    - Create GET `/VLR-admin/ab-test-dashboard` route protected by `AdminController.checkAdmin`
    - Query current test status, days remaining, and preliminary results
    - Render `views/admin/ab-test-dashboard.ejs` with test data
    - _Requirements: 9.5_

  - [ ] 21.3 Create A/B test dashboard template
    - Create `views/admin/ab-test-dashboard.ejs`
    - Display current test status (baseline, active, completed)
    - Display days remaining in 60-day test period
    - Display preliminary results table with impressions, clicks, and CTR for each page type
    - Display comparison chart when test is completed
    - _Requirements: 9.5_

  - [ ]* 21.4 Write integration tests for A/B test monitor
    - Test baseline metrics can be recorded
    - Test new metrics can be tracked
    - Test comparison report is generated after 60 days
    - Test API error handling with exponential backoff
    - _Requirements: 9.1, 9.2, 9.3, 9.6_

- [ ] 22. Checkpoint - Monitoring and Validation
  - Ensure all tests pass for content validator and A/B test monitor
  - Run validation report script and review results
  - Verify A/B test dashboard displays correctly
  - Verify Google Search Console API integration works
  - Ask the user if questions arise

- [ ] 23. Final Integration and Backward Compatibility Testing
  - [ ] 23.1 Verify all existing routes remain functional
    - Test property search with filters, sorting, and pagination
    - Test property listing detail pages
    - Test user authentication (login, logout, session management)
    - Test property favorites (add, remove, localStorage integration)
    - Test contact forms submission
    - Test admin panel access and functionality
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [ ] 23.2 Verify all templates render correctly
    - Test all pages render without errors
    - Test all CSS classes and IDs are preserved
    - Test all JavaScript hooks remain functional
    - Test responsive behavior on mobile, tablet, and desktop
    - _Requirements: 10.3_

  - [ ] 23.3 Performance testing
    - Measure page load times for homepage, owner page, area pages, and property listings
    - Verify page load times have not increased by more than 100ms
    - Optimize any slow queries or rendering bottlenecks
    - _Requirements: Implementation Notes - Performance constraint_

  - [ ]* 23.4 Write end-to-end regression tests
    - Test complete user workflows: property search → view listing → add to favorites
    - Test complete owner workflow: visit homepage → navigate to owner page → submit contact form
    - Test complete admin workflow: login → create blog post → publish post → verify on public site
    - _Requirements: 10.8_

- [ ] 24. Documentation and Deployment Preparation
  - [ ] 24.1 Update project documentation
    - Document new SEO helper functions and their usage
    - Document new middleware and how to apply it to routes
    - Document area content configuration schema
    - Document blog system admin interface
    - Document A/B testing process and timeline
    - _Requirements: All_

  - [ ] 24.2 Create deployment checklist
    - List all new files and directories to deploy
    - List all modified files
    - List all new npm dependencies (if any)
    - List all database migrations (blog model)
    - List all environment variables or configuration changes
    - Document rollback procedure
    - _Requirements: All_

  - [ ] 24.3 Prepare content for area pages
    - Work with marketing team to review generated area content
    - Customize content templates with accurate market data
    - Prepare city-specific images for OG tags
    - Prepare default OG images for all page types
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 8.1, 8.2, 8.3, Implementation Notes - Content Quality constraint_

- [ ] 25. Final Checkpoint and Handoff
  - Ensure all tests pass (unit, integration, end-to-end)
  - Verify all documentation is complete and accurate
  - Verify deployment checklist is complete
  - Verify content is reviewed and approved by marketing team
  - Verify A/B test baseline metrics are recorded before deployment
  - Ask the user if questions arise or if ready to deploy

## Notes

- Tasks marked with `*` are optional testing tasks and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation and allow for course correction
- All tasks maintain backward compatibility with existing functionality
- The implementation follows the existing `buildPropertiesSeo()` pattern from `routes/properties.js`
- SEO middleware extends the current template system that supports `seoTitle`, `seoDescription`, `canonicalUrl`, `ogImage`, and `structuredData`
- A/B testing requires 60-day monitoring period before final assessment
- Content quality review by marketing team is required before deployment
