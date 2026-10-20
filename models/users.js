var mongoose = require('mongoose');

// 定义Schema
UserSchema = new mongoose.Schema({
	email: {
		type: String,
		required: true,
		unique: true
	},
	name: {
		type: String,
		default: ''
	},
	phone: {
		type: String,
		default: ''
	},
	favorites: {
		type: [{
			type: mongoose.Schema.Types.ObjectId,
			ref: 'Property'
		}]
	},
	createdAt: {
		type: Date
	},
	lastLogin: {
		type: Date
	},
    visitCount: {
		type: Number,
		default: 0
    }
});

// on every save, add the date
UserSchema.pre('save', function(next) {
	// get the current date
	var currentDate = new Date();

	// change the updated_at field to current date
	this.lastLogin = currentDate;

	// if created_at doesn't exist, add to that field
	if (!this.createdAt)
		this.createdAt = currentDate;
		
	if (!this.visitCount)
		this.visitCount = 0;
	next();
});

// 定义Model
var UserModel = mongoose.model('User', UserSchema);

// 暴露接口
module.exports = UserModel;
