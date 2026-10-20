var mongoose = require('mongoose');

// 定义Schema
MeetTeamSchema = new mongoose.Schema({
    name: {
		type: String,
		default: ''
	},
	role: {
		type: String
	},
	detail: {
		type: String
	},
	// Legacy inline storage. Superseded by profileImage; kept so the migration
	// is reversible and no photo data is destroyed. Never send this to a view.
	profile: {
		data: Buffer,
		contentType: String
    },
	// S3 object key for the member's photo, e.g. "team/shahram-rafati.png".
	// Resolve to a URL with lib/teamPhotos.publicUrlFor().
	profileImage: {
		type: String,
		default: ''
	},
    phone: {
        type: String
    },
    email: {
		type: String,
		unique: true,
		required: true
    },
    lastUpdatedDate: {type: Date}
});

// on every save, add the date
MeetTeamSchema.pre('save', function(next) {
	// get the current date
	var currentDate = new Date();
	this.lastUpdatedDate = currentDate;
	next();
});

// on every update, add the date
// (mongoose 8 has no 'update' hook: Model.update() runs as updateOne/updateMany,
// see lib/mongooseCompat.js)
MeetTeamSchema.pre(['updateOne', 'updateMany'], function(next) {
    this.set({ lastUpdatedDate: new Date() });
	next();
});

// 定义Model
var MeetTeamModel = mongoose.model('MeetTeam', MeetTeamSchema);

// 暴露接口
module.exports = MeetTeamModel;
