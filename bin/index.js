var express = require('express'),
    corser = require('corser'),
    path = require('path'),
    mkdirp = require('mkdirp'),
    argv = require('optimist').argv,
    port = +(argv.p || argv.port || 5984),
    logger = argv.l || argv.log || 'dev',
    user = argv.u || argv.user,
    pass = argv.s || argv.pass,
    dbpath = argv.d || argv.dir || argv.directory || '',
    inMem = argv.m || argv['in-memory'],
    useAuth = user && pass,
    app = express(),
    corserRequestListener = corser.create({
        methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
        supportsCredentials: true
    });

module.exports = function() {

    // Help, display usage information
    if (argv.h || argv.help) {
        var path = require('path'),
            fs = require('fs'),
            fp = path.resolve(__dirname, 'usage.txt'),
            usage = fs.readFileSync(fp, 'utf8');

        process.stdout.write(usage);
        process.exit(1);
    }

    app.use(require('morgan')(logger));
    app.use(function(req, res, next) {
        corserRequestListener(req, res, function() {
            if (req.method == 'OPTIONS') {
                // End CORS preflight request.
                res.writeHead(204);
                return res.end();
            }
            next();
        });
    });

    if (useAuth) {
        app.all('*', function(req, res, next) {
            var auth = req.headers.authorization;
            // Default read-only
            if (req.user || req.method === 'GET') return next();
            // Otherwise authenticate
            if (!auth) return res.send(401);

            var parts = auth.split(' ');
            if (parts.length !== 2) return res.send(400);
            var scheme = parts[0],
                credentials = new Buffer(parts[1], 'base64').toString(),
                index = credentials.indexOf(':');

            if (scheme !== 'Basic' || index < 0) return res.send(400);

            var reqUser = credentials.slice(0, index),
                reqPass = credentials.slice(index + 1);

            if (reqUser == user && reqPass == pass) return next();
            res.send(401);
        });
    }

    var expressPouchDB = require('express-pouchdb');
    var opts = {};
    if (dbpath) {
        opts.prefix = path.resolve(dbpath) + path.sep;
        mkdirp.sync(opts.prefix);
    }
    if (inMem) {
        opts.db = require('memdown');
    }
    var PouchDB = require('pouchdb').defaults(opts);
    app.use(expressPouchDB(PouchDB));
    app.listen(port, function() {
        console.log('\npouchdb-server listening on port ' + port + '.');
        if (inMem) {
            console.log('database is in-memory; no changes will be saved.');
        }
        else if (dbpath) {
            console.log('database files will be saved to ' + opts.prefix);
        }
        console.log('\nnavigate to http://localhost:' + port + '/_utils for the Fauxton UI.\n');
    }).on('error', function(e) {
        if (e.code === 'EADDRINUSE') {
            console.error('\nError: Port ' + port + ' is already in use.')
            console.error('Try another one, e.g. pouchdb-server -p ' + (parseInt(port) + 1) + '\n');
        }
        else {
            console.error('Uncaught error: ' + e);
            console.error(e.stack);
        }
    });

    process.on('SIGINT', function() {
        process.exit(0)
    });
}