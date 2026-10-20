var mongoose = require('mongoose');

// 定义Schema
ShowRoomSchema = new mongoose.Schema({
    category: {type: String},
    value: [{type: String}],
    lastUpdatedDate: {type: Date}
});

// on every save, add the date
ShowRoomSchema.pre('save', function(next) {
	// get the current date
	var currentDate = new Date();
	this.lastUpdatedDate = currentDate;
	next();
});

// on every update, add the date
// (mongoose 8 has no 'update' hook: Model.update() runs as updateOne/updateMany,
// see lib/mongooseCompat.js)
ShowRoomSchema.pre(['updateOne', 'updateMany'], function(next) {
    this.set({ lastUpdatedDate: new Date() });
	next();
});

// 定义Model
var ShowRoomModel = mongoose.model('ShowRoom', ShowRoomSchema);

// 暴露接口
module.exports = ShowRoomModel;
