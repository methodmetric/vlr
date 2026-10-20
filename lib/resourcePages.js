/**
 * Static SEO content pages served at /resources/:slug.
 *
 * Kept in its own module so routes/index.js (which renders them) and
 * lib/sitemap.js (which lists them) always agree on which slugs exist.
 */

var resourcePages = {
    "best-neighbourhoods-to-rent-in-vancouver": {
      heading: "Best neighbourhoods to rent in Vancouver",
      intro: "Explore the most popular Vancouver neighbourhoods for renters, including commute options, lifestyle, and property types.",
      faqs: [
        { q: "Which areas are best for luxury rentals in Vancouver?", a: "Downtown Vancouver, Coal Harbour, Yaletown, Kitsilano, and West Vancouver are popular for luxury rentals." },
        { q: "Which neighbourhood is best for families?", a: "West Side, Kerrisdale, and North Vancouver are common choices for schools, parks, and larger homes." },
        { q: "Which neighbourhood has the best transit?", a: "Downtown and Broadway corridor areas typically provide the strongest transit coverage." }
      ]
    },
    "average-rent-in-vancouver-2026": {
      heading: "Average rent in Vancouver 2026",
      intro: "Understand typical rental ranges in Vancouver by home type, location, and furnishing level for 2026 market planning.",
      faqs: [
        { q: "What affects average rent the most?", a: "Location, unit size, furnishing, building age, amenities, and lease length all impact rent." },
        { q: "Are furnished homes more expensive?", a: "In most cases yes, furnished homes generally command higher monthly rent." },
        { q: "How often should rent benchmarks be updated?", a: "Quarterly updates are recommended in active rental markets." }
      ]
    },
    "how-to-rent-a-luxury-apartment-in-vancouver": {
      heading: "How to rent a luxury apartment in Vancouver",
      intro: "A practical guide covering search strategy, viewing preparation, application requirements, and lease review for luxury apartments.",
      faqs: [
        { q: "What documents should I prepare?", a: "Prepare photo ID, proof of income, references, and credit information before applying." },
        { q: "How long does approval usually take?", a: "Approval times vary, but complete applications are often processed faster." },
        { q: "What should I confirm before signing?", a: "Confirm lease term, deposits, move-in date, included utilities, and pet policies." }
      ]
    },
    "furnished-vs-unfurnished-rentals-vancouver": {
      heading: "Furnished vs unfurnished rentals Vancouver",
      intro: "Compare costs, flexibility, and tenant profiles to decide whether furnished or unfurnished Vancouver rentals are right for you.",
      faqs: [
        { q: "Who usually chooses furnished rentals?", a: "Executives, relocations, and short-to-mid term tenants often choose furnished homes." },
        { q: "Who usually chooses unfurnished rentals?", a: "Long-term residents who already own furniture often prefer unfurnished options." },
        { q: "Is lease term different between the two?", a: "Furnished rentals can offer shorter terms, but policies vary by property." }
      ]
    },
    "short-term-luxury-rentals-vancouver": {
      heading: "Short term luxury rentals Vancouver",
      intro: "Learn where to find short-term luxury rentals in Vancouver and what to evaluate before booking or signing a fixed-term lease.",
      faqs: [
        { q: "What is considered short-term in Vancouver?", a: "Short-term commonly refers to one to six month rental periods, depending on building rules." },
        { q: "Are utilities usually included?", a: "Many short-term rentals include utilities, but each listing should be reviewed individually." },
        { q: "Are all buildings allowed for short-term leases?", a: "No. Strata bylaws and building policies may limit short-term leasing." }
      ]
    }
};

module.exports = resourcePages;
