# Requirements Document: SEO and UX Improvements

## Introduction

This document specifies requirements for implementing comprehensive SEO and UX improvements to the VLR property rental website. The website serves property owners who list their properties for rent and tenants searching for rental properties in the Vancouver area. 

Current audit findings indicate low scores due to duplicate meta descriptions, tenant-first architecture that doesn't align with business goals, thin content on area pages, missing blog strategy, and Open Graph image issues. These deficiencies significantly impact the site's visibility in both traditional search engines and AI-powered search platforms.

**A primary goal of these improvements is to optimize for AI-based SEO scoring and increase visibility in AI-powered search engines** such as ChatGPT, Perplexity, Claude, Google AI Overviews, and other emerging AI search platforms. AI search engines evaluate websites differently than traditional search engines—they prioritize content structure, semantic clarity, information depth, and comprehensive coverage when determining which sites to reference in their responses. The current low audit scores indicate the site is not optimized for AI-based evaluation, which means it is likely being overlooked when AI systems search for property management and rental information in the Vancouver area.

Key factors for AI search visibility include:
- **Proper heading hierarchy** (H1 → H2 → H3) that creates clear information architecture
- **Comprehensive, substantive content** that thoroughly addresses user questions rather than thin, keyword-stuffed pages
- **Clear semantic structure** with well-defined sections that AI systems can parse and understand
- **Unique, descriptive meta information** that helps AI systems understand page context and relevance
- **Rich contextual information** that provides depth and authority on specific topics

These improvements aim to increase organic search visibility in both traditional and AI-powered search, improve conversion rates for property owner sign-ups, enhance overall user experience, and position VLR as an authoritative source that AI systems will reference when users ask about Vancouver property management and rentals—all while maintaining all existing functionality.

## Glossary

- **Meta_Description_Generator**: Component that generates unique, contextually relevant meta descriptions for each page type
- **Navigation_Reorderer**: Component that restructures navigation hierarchy to prioritize owner-focused content
- **Owner_Landing_Page_Builder**: Component that creates conversion-optimized owner landing page with trust signals and CTAs
- **Area_Page_Expander**: Component that enriches neighbourhood and region pages with comprehensive content
- **Blog_System**: Component that manages blog content creation, publishing, and internal linking
- **OG_Image_Manager**: Component that manages Open Graph images for social media sharing
- **Content_Parser**: Component that extracts and validates page content structure
- **Internal_Link_Injector**: Component that adds contextual internal links between related pages
- **A/B_Test_Monitor**: Component that tracks and reports on meta description performance in Google Search Console
- **Existing_Functionality**: All current features, routes, database operations, and user-facing behaviors that must remain operational

## Requirements

### Requirement 1: Dynamic Meta Description Generation

**User Story:** As a search engine crawler, I want to encounter unique meta descriptions on each page, so that I can properly index and display relevant search results for different page types.

#### Acceptance Criteria

1. WHEN the Meta_Description_Generator receives a homepage request, THE Meta_Description_Generator SHALL generate a meta description containing the site name, primary service offering, and geographic coverage
2. WHEN the Meta_Description_Generator receives an owner landing page request, THE Meta_Description_Generator SHALL generate a meta description emphasizing property management services, trust signals, and owner benefits
3. WHEN the Meta_Description_Generator receives an area page request with a city parameter, THE Meta_Description_Generator SHALL generate a meta description containing the specific neighbourhood name, property types available, and rental market context
4. WHEN the Meta_Description_Generator receives a property listing page request, THE Meta_Description_Generator SHALL generate a meta description containing property type, location, key features, and rental price
5. THE Meta_Description_Generator SHALL ensure all generated meta descriptions are between 120 and 158 characters in length
6. WHEN the Meta_Description_Generator generates a meta description, THE Meta_Description_Generator SHALL sanitize HTML entities and special characters to prevent rendering issues
7. FOR ALL valid page objects with required fields, generating a meta description then parsing it then generating again SHALL produce an equivalent description (round-trip property for meta description serialization)

### Requirement 2: Navigation Architecture Restructuring

**User Story:** As a property owner visiting the site, I want to see owner-focused options prominently in the navigation, so that I can quickly access relevant services and information.

#### Acceptance Criteria

1. WHEN the Navigation_Reorderer renders the main navigation menu, THE Navigation_Reorderer SHALL position "For Owners" before "For Tenants" in the navigation order
2. WHEN the Navigation_Reorderer renders the top navigation bar, THE Navigation_Reorderer SHALL include a "Free Owner Consultation" CTA button with distinct visual styling
3. WHEN a user clicks the "Free Owner Consultation" CTA button, THE Navigation_Reorderer SHALL navigate to the owner contact form section
4. THE Navigation_Reorderer SHALL preserve all existing navigation links and their target URLs
5. THE Navigation_Reorderer SHALL maintain responsive behavior for mobile and tablet viewports
6. FOR ALL navigation menu states (collapsed, expanded, mobile, desktop), the owner-first ordering SHALL remain consistent

### Requirement 3: Homepage Hero Section Rebalancing

**User Story:** As a product manager, I want the homepage hero section to give equal prominence to both owner and tenant audiences, so that we can attract property owners while still serving tenant needs.

#### Acceptance Criteria

1. WHEN the homepage loads, THE Homepage_Hero_Component SHALL display two equal-width sections for owners and tenants
2. WHEN the Homepage_Hero_Component renders the owner section, THE Homepage_Hero_Component SHALL include an owner-focused headline, value proposition, and primary CTA
3. WHEN the Homepage_Hero_Component renders the tenant section, THE Homepage_Hero_Component SHALL include a tenant-focused headline, search functionality, and browse CTA
4. THE Homepage_Hero_Component SHALL maintain visual balance with equal font sizes, button prominence, and spacing for both sections
5. WHEN a user interacts with either section's CTA, THE Homepage_Hero_Component SHALL navigate to the appropriate landing page without page reload errors

### Requirement 4: Owner Landing Page Conversion Optimization

**User Story:** As a property owner considering management services, I want to see comprehensive information about the company's credentials and process, so that I can make an informed decision about listing my property.

#### Acceptance Criteria

1. WHEN the Owner_Landing_Page_Builder renders the /owners page, THE Owner_Landing_Page_Builder SHALL display an owner-focused headline above the fold
2. WHEN the Owner_Landing_Page_Builder renders trust signals, THE Owner_Landing_Page_Builder SHALL display BCREA licensing information, REBGV membership status, and E&O insurance coverage
3. WHEN the Owner_Landing_Page_Builder renders the management process section, THE Owner_Landing_Page_Builder SHALL display a step-by-step explanation with visual indicators
4. WHEN the Owner_Landing_Page_Builder renders the contact form, THE Owner_Landing_Page_Builder SHALL position it prominently with clear field labels and validation
5. WHEN the Owner_Landing_Page_Builder renders the FAQ section, THE Owner_Landing_Page_Builder SHALL include at least 5 questions specifically addressing first-time landlord concerns
6. WHEN the Owner_Landing_Page_Builder renders the onboarding timeline, THE Owner_Landing_Page_Builder SHALL display a "What to Expect" section with time estimates for each phase
7. WHEN the Owner_Landing_Page_Builder renders the differentiator section, THE Owner_Landing_Page_Builder SHALL display a comparison table contrasting VLR services with typical Vancouver property managers
8. THE Owner_Landing_Page_Builder SHALL structure content with a narrative flow: problem identification, solution presentation, proof points, and call to action

### Requirement 5: Area Page Content Expansion

**User Story:** As a property owner researching neighbourhoods, I want to see detailed information about each area's rental market, so that I can understand the value proposition for listing my property there.

#### Acceptance Criteria

1. WHEN the Area_Page_Expander receives a neighbourhood page request, THE Area_Page_Expander SHALL expand content to a minimum of 600 words
2. WHEN the Area_Page_Expander renders a neighbourhood page, THE Area_Page_Expander SHALL include a local rental market overview section with current trends
3. WHEN the Area_Page_Expander renders a neighbourhood page, THE Area_Page_Expander SHALL include an owner-specific value proposition explaining why the area is attractive for property investment
4. WHEN the Area_Page_Expander renders a neighbourhood page, THE Area_Page_Expander SHALL include neighbourhood-specific details such as transit access, amenities, and demographics
5. WHEN the Area_Page_Expander renders a neighbourhood page, THE Area_Page_Expander SHALL include a clear CTA linking to the owner landing page
6. WHEN the Area_Page_Expander renders a neighbourhood page, THE Area_Page_Expander SHALL include an FAQ section with 3-4 area-specific questions
7. WHEN the Area_Page_Expander renders a neighbourhood page, THE Area_Page_Expander SHALL structure content with proper heading hierarchy (H1 for page title, H2 for major sections, H3 for subsections)
8. THE Content_Parser SHALL validate that all area pages contain the required sections before rendering

### Requirement 6: Internal Linking Strategy Implementation

**User Story:** As an SEO specialist, I want contextual internal links between area pages and the owner landing page, so that search engines can better understand site structure and users can navigate related content.

#### Acceptance Criteria

1. WHEN the Internal_Link_Injector processes an area page, THE Internal_Link_Injector SHALL insert at least one contextual link to the owner landing page within the content body
2. WHEN the Internal_Link_Injector inserts a link, THE Internal_Link_Injector SHALL use descriptive anchor text relevant to the surrounding content
3. WHEN the Internal_Link_Injector processes the owner landing page, THE Internal_Link_Injector SHALL insert links to relevant area pages based on service coverage
4. THE Internal_Link_Injector SHALL avoid inserting duplicate links to the same target URL within a single page
5. THE Internal_Link_Injector SHALL preserve existing links and avoid breaking current navigation patterns

### Requirement 7: Blog System Implementation

**User Story:** As a content manager, I want to publish owner-focused blog articles with internal linking, so that we can improve SEO through fresh content and establish thought leadership.

#### Acceptance Criteria

1. WHEN the Blog_System creates a new blog post, THE Blog_System SHALL store the post with title, content, author, publication date, and category metadata
2. WHEN the Blog_System renders the blog index page, THE Blog_System SHALL display posts in reverse chronological order with pagination
3. WHEN the Blog_System renders a blog post, THE Blog_System SHALL automatically inject internal links to the owner landing page and relevant area pages based on content keywords
4. WHEN the Blog_System renders a blog post, THE Blog_System SHALL generate a unique meta description based on the post excerpt or first 150 characters
5. THE Blog_System SHALL support a publishing schedule allowing posts to be prepared in advance and published on specified dates
6. THE Blog_System SHALL provide an administrative interface for creating, editing, and deleting blog posts
7. WHEN the Blog_System processes blog content, THE Blog_System SHALL sanitize HTML input to prevent XSS vulnerabilities

### Requirement 8: Open Graph Image Management

**User Story:** As a social media manager, I want appropriate Open Graph images for each page type, so that shared links display professional, branded imagery on social platforms.

#### Acceptance Criteria

1. WHEN the OG_Image_Manager receives a homepage request, THE OG_Image_Manager SHALL serve a high-quality branded photo at 1200×630 pixels
2. WHEN the OG_Image_Manager receives an owner landing page request, THE OG_Image_Manager SHALL serve an owner-focused image at 1200×630 pixels
3. WHEN the OG_Image_Manager receives an area page request, THE OG_Image_Manager SHALL serve a neighbourhood-specific image at 1200×630 pixels if available, otherwise a default area image
4. WHEN the OG_Image_Manager receives a property listing page request, THE OG_Image_Manager SHALL serve the property's primary photo at 1200×630 pixels
5. THE OG_Image_Manager SHALL ensure all images are optimized for web delivery with file sizes under 1MB
6. WHEN the OG_Image_Manager generates Open Graph meta tags, THE OG_Image_Manager SHALL include og:image, og:image:width, og:image:height, og:image:alt, og:title, and og:description tags
7. WHEN the OG_Image_Manager updates og:title and og:description tags, THE OG_Image_Manager SHALL ensure they match the corresponding unique meta descriptions generated by the Meta_Description_Generator

### Requirement 9: A/B Testing and Monitoring Infrastructure

**User Story:** As a marketing analyst, I want to track meta description performance in Google Search Console over 60 days, so that I can measure the impact of unique meta descriptions on click-through rates.

#### Acceptance Criteria

1. WHEN the A/B_Test_Monitor initializes, THE A/B_Test_Monitor SHALL record baseline metrics for current meta descriptions including impressions, clicks, and CTR
2. WHEN the A/B_Test_Monitor detects new meta descriptions are deployed, THE A/B_Test_Monitor SHALL begin tracking performance metrics for the new descriptions
3. WHEN the A/B_Test_Monitor collects data for 60 days, THE A/B_Test_Monitor SHALL generate a comparison report showing before/after metrics for each page type
4. THE A/B_Test_Monitor SHALL integrate with Google Search Console API to retrieve search performance data
5. THE A/B_Test_Monitor SHALL provide a dashboard displaying current test status, days remaining, and preliminary results
6. WHEN the A/B_Test_Monitor encounters API errors, THE A/B_Test_Monitor SHALL log the error and retry with exponential backoff

### Requirement 10: Backward Compatibility and Regression Prevention

**User Story:** As a site administrator, I want all existing functionality to remain operational after SEO improvements, so that current users experience no disruption in service.

#### Acceptance Criteria

1. WHEN any SEO component modifies page rendering, THE component SHALL preserve all existing route handlers and their response structures
2. WHEN any SEO component modifies database queries, THE component SHALL maintain existing query patterns and result formats
3. WHEN any SEO component modifies templates, THE component SHALL preserve all existing CSS classes, IDs, and JavaScript hooks
4. THE system SHALL maintain all existing API endpoints with unchanged request/response contracts
5. WHEN the system renders property listings, THE system SHALL maintain current filtering, sorting, and pagination behavior
6. WHEN the system processes user authentication, THE system SHALL maintain current login, logout, and session management behavior
7. WHEN the system processes property favorites, THE system SHALL maintain current add/remove functionality and localStorage integration
8. FOR ALL existing user workflows (property search, favorites, contact forms, navigation), the workflows SHALL complete successfully after SEO improvements are deployed

### Requirement 11: Content Structure Validation

**User Story:** As a quality assurance engineer, I want automated validation of content structure, so that I can ensure all pages meet SEO best practices before deployment.

#### Acceptance Criteria

1. WHEN the Content_Parser validates a page, THE Content_Parser SHALL verify the presence of exactly one H1 tag
2. WHEN the Content_Parser validates a page, THE Content_Parser SHALL verify proper heading hierarchy with no skipped levels (H1 → H2 → H3)
3. WHEN the Content_Parser validates a page, THE Content_Parser SHALL verify meta description length is between 120 and 158 characters
4. WHEN the Content_Parser validates a page, THE Content_Parser SHALL verify the presence of og:image, og:title, and og:description tags
5. WHEN the Content_Parser validates an area page, THE Content_Parser SHALL verify minimum word count of 600 words
6. WHEN the Content_Parser detects validation failures, THE Content_Parser SHALL log specific errors with page URL and failure reason
7. THE Content_Parser SHALL provide a validation report summarizing pass/fail status for all pages in the sitemap

### Requirement 12: Owner-Focused Content Narrative Structure

**User Story:** As a copywriter, I want owner pages to follow a consistent narrative structure, so that content guides property owners through a logical decision-making journey.

#### Acceptance Criteria

1. WHEN the Owner_Landing_Page_Builder renders content sections, THE Owner_Landing_Page_Builder SHALL order sections as: problem identification, solution presentation, proof points, and call to action
2. WHEN the Owner_Landing_Page_Builder renders the problem section, THE Owner_Landing_Page_Builder SHALL articulate common pain points for property owners (tenant screening, maintenance, legal compliance)
3. WHEN the Owner_Landing_Page_Builder renders the solution section, THE Owner_Landing_Page_Builder SHALL explain how VLR's services address each identified problem
4. WHEN the Owner_Landing_Page_Builder renders the proof section, THE Owner_Landing_Page_Builder SHALL display trust signals, testimonials, and credentials
5. WHEN the Owner_Landing_Page_Builder renders the action section, THE Owner_Landing_Page_Builder SHALL provide clear next steps with prominent contact form and consultation CTA
6. THE Owner_Landing_Page_Builder SHALL use descriptive H2 and H3 headings that support scannability and SEO

## Implementation Notes

### Parser and Serializer Requirements

This feature includes several parsers and serializers that require special attention:

**Meta Description Parser/Serializer:**
- The Meta_Description_Generator acts as both a generator and serializer for meta descriptions
- A round-trip property test is ESSENTIAL: parse page data → generate meta description → parse meta description → generate again should produce equivalent output
- This ensures meta descriptions are consistently generated from the same page data

**Content Structure Parser:**
- The Content_Parser validates HTML structure and extracts semantic information
- Must handle malformed HTML gracefully and provide actionable error messages
- Should validate against a defined schema for each page type

**Internal Link Parser:**
- The Internal_Link_Injector must parse existing content to identify link insertion points
- Must preserve existing HTML structure and attributes when injecting new links
- Should use a whitelist approach to identify safe insertion points (within paragraph tags, not within existing links or headings)

### Testing Strategy

Property-based testing is appropriate for:
- Meta description generation (varying page types, content lengths, special characters)
- Content structure validation (varying HTML structures, heading hierarchies)
- Internal link injection (varying content lengths, existing link patterns)
- OG image URL generation (varying image paths, fallback scenarios)

Integration testing is appropriate for:
- Google Search Console API integration (external service, limited by API quotas)
- Database queries for blog posts (deterministic behavior with representative examples)
- Navigation rendering (visual regression testing with 2-3 viewport sizes)

### Critical Constraints

1. **No Breaking Changes**: All modifications must maintain backward compatibility with existing functionality
2. **Performance**: Page load times must not increase by more than 100ms
3. **SEO Timeline**: A/B testing requires 60-day monitoring period before final assessment
4. **Content Quality**: All expanded content must be reviewed by marketing team before deployment
5. **Technology Stack**: Must work within existing Node.js/Express/EJS architecture without requiring framework changes
