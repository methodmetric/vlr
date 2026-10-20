var mongoose = require('mongoose');

// 定义Schema
LeadsSchema = new mongoose.Schema({
    fullName: {type: String},
    email: {type: String},
    phone: {type: String},
    location: {type: String},
    type: {type: String},
    createdAt: {type: Date},
    bedroom: {type: Number},
    bathroom: {type: Number},
    propertyCondition: {type: String},
    leaseTerm: {type: String},
    postDate: {type: Date},
    comment: {type: String},
    agent: {type: String},
    forwarded: {type: Boolean},
    formSource: {type: String},
    leadSource: {type: String},
    utmSource: {type: String},
    utmMedium: {type: String},
    utmCampaign: {type: String}
});

// on every save, add the date
LeadsSchema.pre('save', function(next) {
	// get the current date
	var currentDate = new Date();

	// if created_at doesn't exist, add to that field
	if (!this.createdAt)
		this.createdAt = currentDate;

	next();
});

// 定义Model
var LeadsModel = mongoose.model('Leads', LeadsSchema);

// 暴露接口
module.exports = LeadsModel;
