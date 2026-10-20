module.exports = {
  port: 3000,
  session: {
    secret: 'REDACTED-SESSION-SECRET',
    key: 'VLR',
    maxAge: 99999999999
  },
  mongodb: 'mongodb://localhost:27017/VLR',
  bucket: 'vancouverluxuryrental.com',
  // Canonical hostname redirect. Only hosts listed in redirectHosts are
  // redirected, so localhost (the deploy health check) and
  // dev.vancouverluxuryrentals.com are never affected.
  canonicalHost: null,
  redirectHosts: []
};
