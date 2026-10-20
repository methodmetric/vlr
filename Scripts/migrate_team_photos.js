/**
 * One-time migration: move team photos out of MongoDB and into S3.
 *
 * Run it on the server (where MongoDB is), from the project root:
 *
 *     node Scripts/migrate_team_photos.js --dry-run   # report only, changes nothing
 *     node Scripts/migrate_team_photos.js             # upload and record keys
 *
 * For each team member holding an inline photo Buffer, the bytes are uploaded to
 * S3 under team/<name>.png and the object key is recorded in `profileImage`.
 *
 * Safe to re-run: members that already have a profileImage are skipped. The
 * original Buffer is deliberately left in the database so the change is
 * reversible — nothing is deleted.
 */

var path = require('path');
var mongoose = require('../lib/mongooseCompat');
var config = require('config-lite')(path.join(__dirname, '..'));

var dryRun = process.argv.indexOf('--dry-run') !== -1;
var force = process.argv.indexOf('--force') !== -1;

mongoose.connect(process.env.MONGO_URL || config.mongodb).catch(function () {
    // reported by the 'error' listener below
});

var MeetTeamModel = require('../models/meetTeam');
var teamPhotos = require('../lib/teamPhotos');

mongoose.connection.on('error', function (err) {
    console.error('Could not connect to MongoDB at ' + config.mongodb);
    console.error(err.message);
    process.exit(1);
});

function finish(code) {
    mongoose.connection.close();
    process.exit(code);
}

mongoose.connection.once('open', function () {
    MeetTeamModel.find({}, function (err, members) {
        if (err) {
            console.error('Query failed:', err.message);
            return finish(1);
        }

        console.log('Found ' + members.length + ' team members.');
        if (dryRun) console.log('DRY RUN — nothing will be written.\n');

        var usedKeys = {};
        var pending = 0;
        var uploaded = 0;
        var skipped = 0;
        var failed = 0;
        var done = false;

        function maybeFinish() {
            if (done && pending === 0) {
                console.log('\nUploaded: ' + uploaded + '   Skipped: ' + skipped + '   Failed: ' + failed);
                if (failed) console.log('Some uploads failed — re-run to retry the remainder.');
                else if (!dryRun && uploaded) console.log('Done. Reload /about/team to verify.');
                finish(failed ? 1 : 0);
            }
        }

        members.forEach(function (member) {
            var label = (member.name || '(no name)') + ' <' + (member.email || 'no email') + '>';

            if (member.profileImage && !force) {
                console.log('SKIP    ' + label + ' — already at ' + member.profileImage);
                skipped++;
                return;
            }

            var buffer = member.profile && member.profile.data;
            if (!buffer || !buffer.length) {
                console.log('SKIP    ' + label + ' — no inline photo');
                skipped++;
                return;
            }

            var contentType = (member.profile && member.profile.contentType) || 'image/png';
            var key = teamPhotos.buildKey(member, contentType);

            // Two members slugifying to the same filename would silently overwrite
            // each other, so disambiguate rather than lose a photo.
            if (usedKeys[key]) {
                var ext = teamPhotos.extensionFor(contentType);
                var base = key.slice(0, -(ext.length + 1));
                var n = 2;
                while (usedKeys[base + '-' + n + '.' + ext]) n++;
                key = base + '-' + n + '.' + ext;
            }
            usedKeys[key] = true;

            var sizeKb = (buffer.length / 1024).toFixed(0);
            var inflatedKb = (JSON.stringify(buffer).length / 1024).toFixed(0);

            if (dryRun) {
                console.log('WOULD   ' + label + ' -> ' + key +
                    '  (' + sizeKb + ' KB binary, ' + inflatedKb + ' KB as inline text)');
                uploaded++;
                return;
            }

            pending++;
            teamPhotos.upload(key, buffer, contentType, function (uploadErr) {
                if (uploadErr) {
                    console.error('FAIL    ' + label + ' — ' + uploadErr.message);
                    failed++;
                    pending--;
                    return maybeFinish();
                }

                member.profileImage = key;
                member.save(function (saveErr) {
                    if (saveErr) {
                        console.error('FAIL    ' + label + ' — uploaded but could not record key: ' + saveErr.message);
                        failed++;
                    } else {
                        console.log('OK      ' + label + ' -> ' + key + '  (' + sizeKb + ' KB)');
                        console.log('        ' + teamPhotos.publicUrl(key));
                        uploaded++;
                    }
                    pending--;
                    maybeFinish();
                });
            });
        });

        done = true;
        maybeFinish();
    });
});
