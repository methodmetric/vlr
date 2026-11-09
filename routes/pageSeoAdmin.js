var express = require('express');
var router = express.Router();
var AdminController = require('../middlewares/admin');
var pageSeo = require('../lib/pageSeo');
var log = require('log4js').getLogger('pageSeoAdmin');

// Mounted at /VLR-admin/page-seo. Every route is super admin only; the admin
// has no CSRF protection, so writes must also be JSON, which a cross-site HTML
// form cannot send.
function requireJson(req, res, next) {
    if (!req.is('application/json')) {
        return res.status(415).json({ error: 'Send JSON.' });
    }
    next();
}

router.get('/', AdminController.isAuthenticated, AdminController.isSuperAdmin, function (req, res) {
    res.render('adminPageSeo.ejs', { siteHost: pageSeo.SITE_HOST, maxLength: pageSeo.MAX_FIELD_LENGTH });
});

router.get('/api/all', AdminController.isAuthenticated, AdminController.isSuperAdmin, function (req, res) {
    pageSeo.listForAdmin().then(function (pages) {
        res.json({ data: pages });
    }).catch(function (err) {
        log.error('Could not list page SEO', err);
        res.status(500).json({ error: 'Could not load the pages.' });
    });
});

router.post('/api/save', AdminController.isAuthenticated, AdminController.isSuperAdmin, requireJson, function (req, res) {
    var body = req.body || {};
    var who = req.user && (req.user.email || req.user.name);

    pageSeo.saveOverride(String(body.key || ''), body, who).then(function (outcome) {
        if (outcome.unknownPage) return res.status(404).json({ error: 'Unknown page.' });
        if (outcome.errors) return res.status(400).json({ errors: outcome.errors });
        res.json({ cleared: !!outcome.cleared });
    }).catch(function (err) {
        log.error('Could not save page SEO', err);
        res.status(500).json({ error: 'Could not save.' });
    });
});

module.exports = router;
