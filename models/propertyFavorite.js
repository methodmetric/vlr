var mongoose = require('mongoose');

// 定义Schema
PropertyFavoriteSchema = new mongoose.Schema({
    propertyId: {type: String},
    users: {
		type: [{
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Users'
		}]
	},
    lastUpdatedDate: {type: Date}
});

// on every save, add the date
PropertyFavoriteSchema.pre('save', function(next) {
	// get the current date
	var currentDate = new Date();
	this.lastUpdatedDate = currentDate;
	next();
});

// on every update, add the date
// (mongoose 8 has no 'update' hook: Model.update() runs as updateOne/updateMany,
// see lib/mongooseCompat.js)
PropertyFavoriteSchema.pre(['updateOne', 'updateMany'], function(next) {
    this.set({ lastUpdatedDate: new Date() });
	next();
});

// 定义Model
var PropertyFavoriteModel = mongoose.model('PropertyFavorite', PropertyFavoriteSchema);

// 暴露接口
module.exports = PropertyFavoriteModel;
