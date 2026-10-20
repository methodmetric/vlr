var path = require('path');
var fs = require('fs');
var express = require('express');
var session = require('express-session');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;
var MongoStore = require('connect-mongo');
var config = require('config-lite')(__dirname);
var pkg = require('./package');
var homeRouter = require('./routes/index');
var checkAvailable = require('./lib/setAvailable').checkAvailable;
var schedule = require('node-schedule');
var cluster = require('cluster');
var http = require('http');
var numCPUs = require('os').cpus().length;
var rimraf = require("rimraf");
var restartPolicy = require('./lib/restartPolicy');

function cleanUpOldFiles() {
    var uploadsDir = __dirname + '/uploads';
    fs.readdir(uploadsDir, function(err, files) {
        files.forEach(function(file, index) {
            fs.stat(path.join(uploadsDir, file), function(err, stat) {
                var endTime, now;
                if (err) {
                    return console.error(err);
                }
                now = new Date().getTime();
                endTime = new Date(stat.ctime).getTime() + 1800000; // a file can keep at most 40mins.
                if (now > endTime) {
                    console.log("Deleting file/folder: " + file);
                    return rimraf(path.join(uploadsDir, file), function(err) {
                        if (err) {
                            return console.error(err);
                        }
                        console.log('successfully deleted');
                    });
                }
            });
        });
    });
}

var worker;

if (cluster.isMaster) {
    var log4js = require('log4js');
    log4js.configure({
        appenders: {
            app: {
                type: "file",
                filename: "log/app.log",
                maxLogSize: 10485760,
                numBackups: 20,
                level: "INFO",
                MaxLevel: "WARN"
            },
            errorFile: {
                type: "file",
                filename: "log/error.log",
                maxLogSize: 10485760,
                numBackups: 20
            },
            error: {
                type: 'logLevelFilter',
                level: 'ERROR',
                appender: 'errorFile'
            }
        },
        categories: {
            default: {
                appenders: ['app', 'error'],
                level: 'INFO'
            }
        }
    });

    var log = log4js.getLogger();
    console.log('Master cluster setting up ' + numCPUs + ' workers...');
    var setCleaner = false;
    var cleaner;
    // Tracks how many workers have died before ever finishing startup, so a
    // permanent failure (e.g. port 80 already taken) ends this process instead
    // of looping silently while the supervisor still reports us as healthy.
    var policy = restartPolicy.createRestartPolicy();
    for (var i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('online', function(worker) {
        console.log('Worker ' + worker.process.pid + ' is online');
        policy = restartPolicy.recordStart(policy, worker.id, Date.now());
        if (setCleaner == false) {
            worker.send({
                chat: "You are the cleaner."
            });
            console.log('Set worker ' + worker.process.pid + ' as the cleaner');
            setCleaner = true;
            cleaner = worker.process.pid;
        }
    });

    cluster.on('exit', function(worker, code, signal) {
        console.log('Worker ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
        if (worker.process.pid == cleaner){
            console.log("Cleaner died. Assigning a new cleaner");
            setCleaner = false;
        }

        var decision = restartPolicy.recordDeath(policy, worker.id, Date.now());
        policy = decision.policy;
        if (!decision.shouldRefork) {
            console.error('Worker failed to start ' + decision.consecutiveFailures +
                ' times in a row (last one lived ' + decision.uptimeMs + 'ms). ' +
                'Exiting so the supervisor reports a failed service instead of a ' +
                'healthy one that serves nothing.');
            log.error('Worker startup failed ' + decision.consecutiveFailures +
                ' times in a row. Master exiting.');
            process.exit(1);
        }
        cluster.fork();
    });
} else {
    var app = express();

    // log4js
    try {
        fs.mkdirSync('./log');
    } catch (e) {
        if (e.code != 'EEXIST') {
            log.error("Could not set up log directory, error was: ", e);
            process.exit(1);
        }
    }

    var log4js = require('log4js');
    log4js.configure({
        appenders: {
            app: {
                type: "file",
                filename: "log/app.log",
                maxLogSize: 10485760,
                numBackups: 20,
                level: "INFO",
                MaxLevel: "WARN"
            },
            errorFile: {
                type: "file",
                filename: "log/error.log",
                maxLogSize: 10485760,
                numBackups: 20
            },
            error: {
                type: 'logLevelFilter',
                level: 'ERROR',
                appender: 'errorFile'
            }
        },
        categories: {
            default: {
                appenders: ['app', 'error'],
                level: 'INFO'
            }
        }
    });

    var log = log4js.getLogger();
    app.use(log4js.connectLogger(log4js.getLogger("http"), {
        level: 'auto'
    }));

    // Canonical hostname redirect: vancouverluxuryrentals.com -> www.vancouverluxuryrentals.com.
    //
    // Deliberately an allow-list rather than a "does the host start with www"
    // rule. Only the hosts named in config.redirectHosts are redirected, which
    // keeps two things working: the deploy health check (curl http://localhost/
    // expects a 200, not a 301) and the test site at dev.vancouverluxuryrentals.com,
    // which must not be rewritten to www.dev.*.
    //
    // Runs before everything else so redirected requests do not open a session,
    // and matches on Host only — never on protocol — so it cannot loop behind a
    // TLS-terminating load balancer. GET/HEAD only: a 301 rewrites POST to GET
    // and would silently discard form data.
    var canonicalHost = config.canonicalHost;
    var redirectHosts = config.redirectHosts || [];
    if (canonicalHost && redirectHosts.length) {
        app.use(function (req, res, next) {
            if (req.method !== 'GET' && req.method !== 'HEAD') return next();
            var host = (req.headers.host || '').toLowerCase().split(':')[0];
            if (redirectHosts.indexOf(host) === -1) return next();
            res.redirect(301, 'https://' + canonicalHost + req.originalUrl);
        });
    }

    // Set the view engine to ejs, ans set directory our views will be stored in
    app.set('view engine', 'ejs');
    app.set('views', path.resolve(__dirname, 'views'));
    app.use(cookieParser());
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({
        extended: true,
        limit: '3mb'
    }));
    
    // session middleware
    app.use(session({
        name: config.session.key, // 设置 cookie 中保存 session id 的字段名称
        secret: config.session.secret, // 通过设置 secret 来计算 hash 值并放在 cookie 中，使产生的 signedCookie 防篡改
        resave: false, // 强制更新 session
        saveUninitialized: false, // 设置为 false，强制创建一个 session，即使用户未登录
        cookie: {
            maxAge: config.session.maxAge // 过期时间，过期后 cookie 中的 session id 自动删除
        },
        store: MongoStore.create({ // 将 session 存储到 mongodb
            mongoUrl: process.env.MONGO_URL || config.mongodb // mongodb 地址
        })
    }));


    // passport config
    app.use(passport.initialize());
    app.use(passport.session());
    passport.serializeUser(function(user, done) {
        done(null, user.id)
    })
    passport.deserializeUser(function(id, done) {
        require('./models/admins').Admin.findOne({
            _id: id
        }, function(err, user) {
            done(err, user)
        })
    })
    var local = require('./lib/passportLocal');
    passport.use(local.strategy);

    // 设置静态文件目录
    app.use(express.static(path.join(__dirname, 'public')));
    app.get('/robots.txt', function (req, res) {
        res.type('text/plain');
        // The Sitemap directive is how Bing and most LLM crawlers discover the
        // listing URLs; without it they only find what they can crawl by hand.
        res.send("User-agent: *\nAllow: /\n\nSitemap: https://www.vancouverluxuryrentals.com/sitemap.xml\n");
    });

    // Redirect middleware — resolves active redirect rules from DB before routing.
    // Rules are cached in memory and refreshed every 60 s to avoid a DB hit on
    // every single request while still picking up new rules quickly.
    var RedirectModel = require('./models/redirect');
    var redirectCache = [];
    var redirectCacheExpiry = 0;

    function refreshRedirectCache(cb) {
        RedirectModel.find({ active: true }, function(err, docs) {
            if (!err && docs) {
                redirectCache = docs;
                redirectCacheExpiry = Date.now() + 60000; // 60 s TTL
            }
            if (cb) cb();
        });
    }

    app.use(function(req, res, next) {
        var now = Date.now();
        function applyRedirects() {
            var reqPath = req.path;
            for (var i = 0; i < redirectCache.length; i++) {
                var rule = redirectCache[i];
                // Normalise both sides: ensure leading slash, strip trailing slash
                var from = ('/' + rule.from).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
                var to   = rule.to;
                var normalised = reqPath.replace(/\/$/, '') || '/';
                if (normalised === from) {
                    return res.redirect(301, to);
                }
            }
            next();
        }

        if (now > redirectCacheExpiry) {
            refreshRedirectCache(applyRedirects);
        } else {
            applyRedirects();
        }
    });

    // set router
    app.use('/', homeRouter);

    // 添加模板必需的三个变量
    app.use(function(req, res, next) {
        res.locals.user = req.session.user;
        var err = req.session.error;
        next();
    });

    // development error handler
    // will print stacktrace
    // if (app.get('env') === 'development') {
    //     app.use(function(err, req, res, next) {
    //         log.error("Something went wrong:", err);
    //         res.status(err.status || 500);
    //         res.render('error', {
    //             message: err.message,
    //             error: err
    //         });
    //     });
    // }

    // production error handler
    // no stacktraces leaked to user
    app.use(function(err, req, res, next) {
        log.error("Something went wrong:", err);
        // res.status(err.status || 500);
        // res.render('error', {
        //     message: err.message,
        //     error: {}
        // });
        res.redirect('/');
    });

    //periodicly clean up uploads folder
    process.on('message', (msg) => {
        if (msg.chat) {
            setInterval(cleanUpOldFiles, 600000);
            var j = schedule.scheduleJob('0 10 0 * * *', function(){
                if (checkAvailable() == -1)
                {
                    checkAvailable();
                }
            });
        }
    });

    // Node 8 closed sockets after 120 s of inactivity by default; Node 13+ never does.
    // Keep the old limit so a request the app never answers cannot hold its socket forever.
    var SOCKET_TIMEOUT_MS = 120000;
    app.listen(config.port, function() {
        log.info('Express server listening on port ', config.port);
    }).setTimeout(SOCKET_TIMEOUT_MS);
}
