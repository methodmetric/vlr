const mongoose = require('mongoose')
const Schema = mongoose.Schema
const crypto = require('crypto')

var AdminSchema = new Schema({
	email: {
		type: String,
		unique: true
	},
	name: {
		type: String,
		default: ''
	},
	phone: {
		type: String
	},
	hashed_password: {
		type: String
	},
	salt: {
		type: String
	},
	role: {
		type: String
	},
	detail: {
		type: String
	},
	profile: {
		data: Buffer,
		contentType: String
	}
});

AdminSchema
	.virtual('password')
	.set(function(password) {
		this._password = password;
		this.salt = this.makeSalt();
		this.hashed_password = this.encryptPassword(password);
	})
	.get(function() {
		return this._password
	});

AdminSchema.statics = {
	load: function(options, cb) {
		options.select = options.select;
		this.findOne(options.criteria)
			.select(options.select)
			.exec(cb);
	},
	create: function(data, callback) {
		var user = new this(data);
		user.save(callback);
	},
	get: function(id, callback) {
		this.findOne(id, callback);
	}
}

var validatePresenceOf = function(value) {
	return value && value.length;
};

AdminSchema.methods = {

	authenticate: function(plainText) {
		return this.encryptPassword(plainText) === this.hashed_password;
	},

	makeSalt: function() {
		return Math.round((new Date().valueOf() * Math.random())) + '';
	},

	encryptPassword: function(password) {
		if (!password) {
			return '';
		}
		try {
			return crypto
				.createHmac('sha1', this.salt)
				.update(password)
				.digest('hex');
		} catch (err) {
			return '';
		}
	},
};

var admin = mongoose.model('admins', AdminSchema);


module.exports = {
	Admin: admin
};
