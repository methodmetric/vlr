var mongoose = require('mongoose');

// 定义Schema
ScheduleSchema = new mongoose.Schema({
    fullName: {type: String},
    email: {type: String},
    phone: {type: Number},
    scheduleDate: {type: String},
    createdAt: {type: Date},
    numberOfAdults: {type: Number},
    numberOfChildren: {type: Number},
    message: {type: String},
    agent: {type: String},
    propertyAgent: {type: String, default: ''},
    propertyId: {type: Number},
    forwarded: {type: Boolean},
    numberOfOccupants: {type: Number},
    numberOfPets: {type: String},
    creditCard: {type: String},
    startDate: {type: Date},
    preferredDate: {type: Date},
    propertyStatus: {type: String}
});

// on every save, add the date
ScheduleSchema.pre('save', function(next) {
	// get the current date
	var currentDate = new Date();

	// if created_at doesn't exist, add to that field
	if (!this.createdAt)
		this.createdAt = currentDate;

	next();
});

// 定义Model
var ScheduleModel = mongoose.model('Schedule', ScheduleSchema);

// 暴露接口
module.exports = ScheduleModel;
