var mongoose = require('mongoose');

var RedirectSchema = new mongoose.Schema({
    from: { type: String, required: true, unique: true }, // e.g. /old-page
    to:   { type: String, required: true },               // e.g. /new-page
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

var RedirectModel = mongoose.model('Redirect', RedirectSchema);

module.exports = RedirectModel;
