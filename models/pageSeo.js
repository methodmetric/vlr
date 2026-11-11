var mongoose = require('mongoose');

// One document per key page that has an SEO override. A page with no document
// (or a blank field) keeps the title/description/canonical it already has — see
// lib/pageSeo.js. `pageKey` is a key from that module's registry.
var PageSeoSchema = new mongoose.Schema({
    pageKey: { type: String, required: true, unique: true },
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    canonical: { type: String, default: '' },
    noindex: { type: Boolean, default: false },
    updatedBy: { type: String, default: '' },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PageSeo', PageSeoSchema);
