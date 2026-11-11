var express = require('express');
var router = express.Router();
var connect = require('../lib/mongo');
var fs = require('fs');
var path = require('path');
var AdminController = require('../middlewares/admin');
var PropertyModel = require('../models/properties');
var AdminModel = require('../models/admins').Admin;
var dbStatusModel = require('../models/dbStatus');
var ScheduleModel = require('../models/schedule');
var LeadsModel = require('../models/ownerLeads');
var AttributeModel = require('../models/attributes');
var ShowRoomModel = require('../models/showRoom');
var config = require('config-lite')(__dirname);
var multer = require('multer');
var mailer = require('../lib/mailer');
var upload = multer();
var log = require('log4js').getLogger("admin");
var passport = require('passport');
var csv = require("fast-csv");
var json2csv = require("json2csv");
var moment = require('moment');
var storage = multer.diskStorage({
	destination: function (req, file, cb) {
		cb(null, 'uploads/')
	},
	filename: function (req, file, cb) {
		cb(null, file.originalname);
	}
});
var upload = multer({
	storage: storage
});
var AWS = require('aws-sdk');
var s3 = new AWS.S3({
	params: {
		Bucket: config.bucket
	}
});

function validateFileType(filename){
	if (filename.toLowerCase().endsWith('.jpg')||filename.toLowerCase().endsWith('.jpeg')||filename.toLowerCase().endsWith('.gif')||filename.toLowerCase().endsWith('.png'))
		return true;
	return false;
}

// GET /VLR-admin/
router.get('/', AdminController.isAuthenticated, AdminController.isSuperAdmin, (req, res, next) => {
	res.render('adminHome');
})

router.getAdmins = function (req, res, next) {
	AdminModel.find()
		.exec(function (err, data) {
			if (err) return;
			req._admins = data;
			next();
		});
}

router.getAgents = function (req, res, next) {
	AdminModel.find({
			role: 'Agent'
		})
		.select('email name')
		.exec(function (err, data) {
			if (err) return;
			req._agents = data;
			next();
		});
}

router.delete('/id/:id', AdminController.isAuthenticated, AdminController.isSuperAdmin, function (req, res) {
	AdminModel.findOneAndRemove({
		_id: req.params.id
	}, (function (err, admin) {
		if (err) return;
		res.status(200).json({
			id: admin.name
		});
	}));
});

router.get('/api/all', AdminController.isAuthenticated, AdminController.isSuperAdmin, router.getAdmins, function (req, res) {
	res.send({
		data: req._admins,
	})
});

router.get('/api/allAgents', AdminController.isAuthenticated, router.getAgents, function (req, res) {
	res.send({
		data: req._agents,
	})
});

router.get('/register', AdminController.isAuthenticated, AdminController.isSuperAdmin, function (req, res) {
	res.render('adminRegister');
});

router.get('/logout', AdminController.logout, function (req, res) {
	res.redirect('/VLR-admin/login');
});

router.post('/register', upload.array(), AdminController.isAuthenticated, AdminController.isSuperAdmin, AdminController.create, function (req, res) {
	res.redirect('/VLR-admin/');
});

// GET /VLR-admin/login
router.get('/login', function (req, res) {
	res.render('adminLogin', {
		user: req.user
	});
});

router.post('/login', upload.array(), passport.authenticate('local'), AdminController.login, function (req, res) {
	res.redirect('/VLR-admin');
});

router.get('/logout', AdminController.logout);

router.get('/database', AdminController.isAuthenticated, AdminController.isSuperAdmin, (req, res, next) => {
	res.render('adminDatabase');
});
router.get('/', AdminController.isAuthenticated, AdminController.isSuperAdmin, (req, res, next) => {
	res.render('adminHome');
});

router.get('/owner', AdminController.isAuthenticated, (req, res, next) => {
	res.render('adminOwner');
});
router.get('/viewRequest', AdminController.isAuthenticated, (req, res, next) => {
	res.render('adminViewRequest');
});
router.get('/available90', AdminController.isAuthenticated, (req, res, next) => {
	res.render('adminAvailable90');
});
router.get('/inspection', AdminController.isAuthenticated, (req, res, next) => {
	res.render('adminInspection');
});
router.get('/maintenance', AdminController.isAuthenticated, (req, res, next) => {
	res.render('adminMaintenance');
});

router.get('/list-properties', AdminController.isAuthenticated, AdminController.isSuperAdmin, function (req, res) {
	LeadsModel.find({}, (function (err, leads) {
		if (err) return err;
		res.status(200).json({
			data: leads
		});
	}));
});

router.get('/property/new', AdminController.isAuthenticated, AdminController.isSuperAdmin, router.getAgents, function (req, res) {
	dbStatusModel.findOne({
		statusName: "maxId"
	}, (function (err, data) {
		if (err) return err;
		var newProperty = new PropertyModel({
			propertyId: parseInt(data.statusValue) + 1
		});
		res.render('adminEditProperties.ejs', {
			data: newProperty,
			agentList: req._agents
		});
	}));
});

router.get('/property/available90', AdminController.isAuthenticated, function (req, res) {
	var today = new Date();
	var cutoff = new Date();
	cutoff.setDate(today.getDate() + 90);
	PropertyModel.find({
		availableDate: {
			$gt: today,
			$lt: cutoff
		}
	}, function (err, properties) {
		if (err) return err;
		res.status(200).json({
			data: properties
		});
	});
});

router.post('/admin', AdminController.isAuthenticated, AdminController.isSuperAdmin, function (req, res) {
	AdminModel.findOne({
		_id: req.body.id
	}, (function (err, admin) {
		if (err) return err;
		admin.email = req.body.email;
		admin.name = req.body.name;
		admin.role = req.body.role;
		admin.detail = req.body.detail;
		admin.phone = req.body.phone;

		if (req.body.profile) {
			var base64 = req.body.profile.replace(/^data:image\/\w+;base64,/, "");
			var dataBuffer = Buffer.from(base64, 'base64');
			admin.profile.data = dataBuffer;
			admin.profile.contentType = 'image/png';
		}
		admin.save((err, admin) => {
			if (err) {
				return res.status(500).send(err)
			}
			log.info(admin.email + ' is updated by ' + req.user.email);
			res.redirect('/VLR-admin/');
		});
	}));
});

router.get('/admin/:id', AdminController.isAuthenticated, AdminController.isSuperAdmin, function (req, res) {
	AdminModel.findOne({
		_id: req.params.id
	}, (function (err, admin) {
		if (err) return err;
		res.render('adminEditAdmin.ejs', {
			data: admin
		});
	}));
});

router.get('/property/:id', AdminController.isAuthenticated, AdminController.isSuperAdmin, router.getAgents, function (req, res) {
	PropertyModel.findOne({
		propertyId: req.params.id
	}, (function (err, property) {
		if (err) return err;
		res.render('adminEditProperties.ejs', {
			data: property,
			agentList: req._agents
		});
	}));
});

router.get('/property/:id/Images', AdminController.isAuthenticated, AdminController.isSuperAdmin, router.getAgents, function (req, res) {
	PropertyModel.findOne({
		propertyId: req.params.id
	}, (function (err, property) {
		if (err) return err;
		res.render('adminImageUpload.ejs', {
			data: property
		});
	}));
});

//csv
router.get('/csv', function (req, res, next) {
	res.render('csv.ejs');
});

router.post('/csv/upload', AdminController.isAuthenticated, AdminController.isSuperAdmin, upload.single("csv"), function (req, res, next) {
	var path = 'uploads/' + req.file.originalname;
	var csvName = req.file.originalname;
	log.info('Loading csv now.');
	//load some data
	PropertyModel.find().count({}, function (err, c) {
		if (err) {
			log.error('There is an error when getting the count of collection.');
			res.redirect('/csv');
		}
		var count = 0;
		var id = -1;
		var headers;
		csv.fromPath(path, {
			headers: false
		}).on("data", function (data) {
			if (id == -1) {
				headers = data;
				// var attributeRows = [];
				// for (var i = 0; i < data.length; i++) {
				// 	attributeRows.push({
				// 		name: data[i]
				// 	});
				// }
				// AttributeModel.create(attributeRows, function (err, res) {
				// 	if (err) log.error('There is error when creating attributes.');
				// });
				id++;
			} else {
				count = count + 1;
				var len = data.length;
				var convertedCreateDate;
				// create date convert
				if (data[11] == null || data[11] == "NA") {
					convertedCreateDate = new Date(moment());
				} else if (data[11] == '') {
					convertedCreateDate = '';
				} else {
					convertedCreateDate = new Date(moment(data[11]));
					// if (moment(data[11], "DD-MM-YYYY HH:mm:ss").isValid())
					// 	convertedCreateDate = new Date(moment(data[11], "DD-MM-YYYY HH:mm:ss"));
					// else if (moment(data[11], "DD-MM-YYYY").isValid())
					// 	convertedCreateDate = new Date(moment(data[11], "DD-MM-YYYY"));
					// else if (moment(data[11], 'YYYY-MM-DDTHH:mm:ss Z').isValid())
					// 	convertedCreateDate = new Date(moment(data[11]));
					// else
					// 	convertedCreateDate = new Date(moment());
				}
				var convertedAvailableDate;
				// available date convert
				if (data[12] == null || data[12] == "NA") {
					convertedAvailableDate = new Date(moment());
				} else if (data[12] == '') {
					convertedAvailableDate = '';
				} else {
					convertedAvailableDate = new Date(moment(data[12]));
					// if (moment(data[12], "MM-DD-YYYY HH:mm:ss").isValid())
					// 	convertedAvailableDate = new Date(moment(data[12], "MM-DD-YYYY HH:mm:ss"));
					// else if (moment(data[12], "MM-DD-YYYY").isValid())
					// 	convertedAvailableDate = new Date(moment(data[12], "MM-DD-YYYY"));
					// else if (moment(data[12], 'YYYY-MM-DDTHH:mm:ss Z').isValid())
					// 	convertedAvailableDate = new Date(moment(data[12]));
					// else
					// 	convertedAvailableDate = new Date(moment());
				}
				var newRow = new PropertyModel({
					propertyId: data[0],
					agent: data[1],
					address: data[2],
					city: data[3].trim(),
					province: data[4],
					postalCode: data[5],
					country: data[6],
					neighborhoodName: data[7],
					buildingName: data[8],
					typeOfProperty: data[9],
					yearBuilt: data[10],
					createdAt: convertedCreateDate,
					availableDate: convertedAvailableDate,
					status: data[13],
					bedrooms: data[14],
					bathrooms: data[15],
					den: (data[16].toLowerCase() == 'true'),
					flexOrStorage: (data[17].toLowerCase() == 'true'),
					mountainView: (data[18].toLowerCase() == 'true'),
					waterView: (data[19].toLowerCase() == 'true'),
					cityView: (data[20].toLowerCase() == 'true'),
					squareFeet: parseInt(data[21].replace(',','')) ? data[21].replace(',','') : 0,
					lotSquareFootage: data[22],
					furnished: data[23],
					rent: parseInt(data[24].replace(',','')) ? data[24].replace(',','') : 0,
					allowPets: data[25],
					smoking: (data[26].toLowerCase() == 'true'),
					minLeaseTerm: data[27],
					maxLeaseTerm: data[28],
					name: data[29],
					details: data[30],
					storageOrLocker: (data[31].toLowerCase() == 'true'),
					numberOfParking: data[32],
					garage: (data[33].toLowerCase() == 'true'),
					carport: (data[34].toLowerCase() == 'true'),
					streetParking: (data[35].toLowerCase() == 'true'),
					drivewayParking: (data[36].toLowerCase() == 'true'),
					visitorParking: (data[37].toLowerCase() == 'true'),
					bikeStorage: (data[38].toLowerCase() == 'true'),
					Heat: (data[39].toLowerCase() == 'true'),
					water: (data[40].toLowerCase() == 'true'),
					garbageCollection: (data[41].toLowerCase() == 'true'),
					gasFireplace: (data[42].toLowerCase() == 'true'),
					electricFireplace: (data[43].toLowerCase() == 'true'),
					woodburnFireplace: (data[44].toLowerCase() == 'true'),
					ac: (data[45].toLowerCase() == 'true'),
					inSuiteWasherDryer: (data[46].toLowerCase() == 'true'),
					sharedLaundry: (data[47].toLowerCase() == 'true'),
					refrigerator: (data[48].toLowerCase() == 'true'),
					windowCoverings: (data[49].toLowerCase() == 'true'),
					gasStove: (data[50].toLowerCase() == 'true'),
					electricStove: (data[51].toLowerCase() == 'true'),
					dishwasher: (data[52].toLowerCase() == 'true'),
					microwave: (data[53].toLowerCase() == 'true'),
					oven: (data[54].toLowerCase() == 'true'),
					wineCooler: (data[55].toLowerCase() == 'true'),
					builtinCoffeeMachine: (data[56].toLowerCase() == 'true'),
					pantry: (data[57].toLowerCase() == 'true'),
					kitchenIsland: (data[58].toLowerCase() == 'true'),
					carpets: (data[59].toLowerCase() == 'true'),
					woodFloor: (data[60].toLowerCase() == 'true'),
					tileFloor: (data[61].toLowerCase() == 'true'),
					balcony: (data[62].toLowerCase() == 'true'),
					rooftopDeck: (data[63].toLowerCase() == 'true'),
					patio: (data[64].toLowerCase() == 'true'),
					privateYard: (data[65].toLowerCase() == 'true'),
					allDayConcierge: (data[66].toLowerCase() == 'true'),
					onSiteManager: (data[67].toLowerCase() == 'true'),
					swimmingPool: (data[68].toLowerCase() == 'true'),
					gym: (data[69].toLowerCase() == 'true'),
					yogaStudio: (data[70].toLowerCase() == 'true'),
					sauna: (data[71].toLowerCase() == 'true'),
					steamRoom: (data[72].toLowerCase() == 'true'),
					hotTub: (data[73].toLowerCase() == 'true'),
					amenityRoom: (data[74].toLowerCase() == 'true'),
					meetingRoom: (data[75].toLowerCase() == 'true'),
					hotWater: (data[76].toLowerCase() == 'true'),
					electricity: (data[77].toLowerCase() == 'true'),
					gas: (data[78].toLowerCase() == 'true'),
					basicInternetPackage: (data[79].toLowerCase() == 'true'),
					basicCablePackage: (data[80].toLowerCase() == 'true'),
					ensuiteStorage: (data[81].toLowerCase() == 'true'),
					walkinStorage: (data[82].toLowerCase() == 'true'),
					radiantFloorHeat: (data[83].toLowerCase() == 'true'),
					additionalNote: data[84],
					forwarded: data[89],//(data[1] != null && data[1] != '')
				});
				if (newRow.propertyId > id)
					id = newRow.propertyId;
				newRow.searchColumn = JSON.stringify(newRow);
				newRow.geoLat = data[85];
				newRow.geoLng = data[86];
				if (data[87]) 
					newRow.coverImg = data[87];
				initImgs = data[88].substring(1,data[88].length-1).replace(/(['"])/g, "").split(',');
				if (initImgs.length !== 0){
					newRow.imgs = initImgs;
					newRow.save(function (err, user) {
						if (err) {
							log.error(err);
						}
					});
				} else {
				// get images from s3
					s3.listObjects({
						Bucket: config.bucket,
						Prefix: newRow.propertyId + '/',
						MaxKeys: 100
					}, function (err, data) {
						if (err) {
							log.error(err);
							throw err;
						}
						var imgs = [];
						var fileList = data.Contents;
						for (var i = 0; i < fileList.length; ++i) {
							var path = fileList[i].Key;
							var fileName = path.split('/')[1];
							if(validateFileType(fileName))
								imgs.push(fileName);
						}
						if (imgs.length > 0)
							newRow.coverImg = imgs[0];
						newRow.imgs = imgs;
						newRow.save(function (err, user) {
							if (err) {
								log.error(err);
							}
						});
					});
				}
			}
		}).on("end", function () {
			log.info("CSV import done by " + req.user.email);
			var maxId = new dbStatusModel({
				statusName: 'maxId',
				statusValue: id
			})
			maxId.save(function (err, user) {
				if (err) {
					log.error(err);
				}
			});
		});
	});
	res.redirect('/VLR-admin/');
});

router.get('/csv/export', AdminController.isAuthenticated, AdminController.isSuperAdmin, function (req, res, next) {
	var filename = "VLR Properties.csv";
	var dataArray;
	PropertyModel.find().exec({}, function (err, data) {
		if (err) res.send(err);
		var fields = ['propertyId',
					'agent',
					'address',
					'city',
					'province',
					'postalCode',
					'country',
					'neighborhoodName',
					'buildingName',
					'typeOfProperty',
					'yearBuilt',
					'createdAt',
					'availableDate',
					'status',
					'bedrooms',
					'bathrooms',
					'den',
					'flexOrStorage',
					'mountainView',
					'waterView',
					'cityView',
					'squareFeet',
					'lotSquareFootage',
					'furnished',
					'rent',
					'allowPets',
					'smoking',
					'minLeaseTerm',
					'maxLeaseTerm',
					'name',
					'details',
					'storageOrLocker',
					'numberOfParking',
					'garage',
					'carport',
					'streetParking',
					'drivewayParking',
					'visitorParking',
					'bikeStorage',
					'Heat',
					'water',
					'garbageCollection',
					'gasFireplace',
					'electricFireplace',
					'woodburnFireplace',
					'ac',
					'inSuiteWasherDryer',
					'sharedLaundry',
					'refrigerator',
					'windowCoverings',
					'gasStove',
					'electricStove',
					'dishwasher',
					'microwave',
					'oven',
					'wineCooler',
					'builtinCoffeeMachine',
					'pantry',
					'kitchenIsland',
					'carpets',
					'woodFloor',
					'tileFloor',
					'balcony',
					'rooftopDeck',
					'patio',
					'privateYard',
					'allDayConcierge',
					'onSiteManager',
					'swimmingPool',
					'gym',
					'yogaStudio',
					'sauna',
					'steamRoom',
					'hotTub',
					'amenityRoom',
					'meetingRoom',
					'hotWater',
					'electricity',
					'gas',
					'basicInternetPackage',
					'basicCablePackage',
					'ensuiteStorage',
					'walkinStorage',
					'radiantFloorHeat',
					'additionalNote',
					'geoLat',
					'geoLng',
					'coverImg',
					'imgs',
					'forwarded']
		var opts = {
			data: data,
			fields: fields,
			quotes: '"'
		};
		var result = json2csv(opts);
		var currentDate = new moment().format('MM-DD-YYYY');
		fs.writeFile('uploads/ExportProperties ' + currentDate + '.csv', result, function(err) {
			if (err) throw err;
			res.download(path.resolve('uploads/ExportProperties ' + currentDate + '.csv'));
		});
	});
});

router.get('/csv/drop', AdminController.isAuthenticated, AdminController.isSuperAdmin, function (req, res) {
	PropertyModel.remove({}, function (err) {
		if (err) return err;
		console.log('Property collection removed');

		AttributeModel.remove({}, function (err) {
			if (err) return err;
			console.log('Attribute collection removed');

			dbStatusModel.remove({}, function (err) {
				if (err) return err;
				console.log('DbStatus collection removed');
				res.status(200);
				res.send();
			});
		});
	});
});

router.get('/schedules', AdminController.isAuthenticated, AdminController.isSuperAdmin, function (req, res, next) {
	ScheduleModel.find().exec(function (err, data) {
		if (err) return err;
		res.status(200).json({
			data: data
		});
	});
});

router.post('/mail/schedule/:id', AdminController.isAuthenticated, AdminController.isSuperAdmin, function (req, res, next) {
	ScheduleModel.findOne({
		_id: req.params.id
	}, (function (err, schedule) {
		if (err) return err;
		var info = {
			propertyId: req.body.propertyId,
			tenantName: req.body.tenantName,
			tenantEmail: req.body.tenantEmail,
			tenantPhone: req.body.tenantPhone,
			comment: req.body.comment,
			agentName: req.body.agentName,
			agentEmail: req.body.agentEmail,
			numberOfPets: req.body.numberOfPets,
			numberOfOccupants: req.body.numberOfOccupants,
			creditCard: req.body.creditCard,
			startDate: req.body.startDate,
			preferredDate: req.body.preferredDate,
			propertyStatus: req.body.propertyStatus,
			filename: 'tenantEnquiries'
		};
		mailer.sendTenantEnquiriesMail(info);
		schedule.forwarded = true;
		schedule.agent = req.body.agentName;
		schedule.save((err, data) => {
			if (err) {
				console.log('err', err);
				return res.status(500).send(err);
			}
			res.status(200).send();
		});
	}));
});

router.post('/mail/ownerLeads/:id', AdminController.isAuthenticated, AdminController.isSuperAdmin, function (req, res, next) {
	LeadsModel.findOne({
		_id: req.params.id
	}, (function (err, lead) {
		if (err) return err;
		var info = {
			ownerName: req.body.ownerName,
			ownerPhone: req.body.ownerPhone,
			ownerEmail: req.body.ownerEmail,
			condition: req.body.condition,
			type: req.body.type,
			bed: req.body.bed,
			bath: req.body.bath,
			location: req.body.location,
			comment: req.body.comment,
			agentName: req.body.agentName,
			agentEmail: req.body.agentEmail,
			filename: 'ownerLead'
		};
		mailer.sendOwnerLeadMail(info);
		lead.forwarded = true;
		lead.agent = req.body.agentName;
		lead.save((err, data) => {
			if (err) {
				return res.status(500).send(err);
			}
			res.status(200).send();
		});
	}));
});

router.post('/mail/renewal/:id', AdminController.isAuthenticated, AdminController.isSuperAdmin, function (req, res, next) {
	PropertyModel.findOne({
		propertyId: req.params.id
	}, (function (err, property) {
		if (err) return err;
		var info = {
			tenantName: req.body.tenantName,
			tenantEmail: req.body.tenantEmail,
			leaseEndDate: req.body.leaseEndDate,
			agentName: req.body.agentName,
			agentPhone: req.body.agentPhone,
			agentEmail: req.body.agentEmail,
			filename: 'renewal'
		};
		mailer.sendRenewalMail(info);
		property.forwarded = true;
		property.agent = req.body.agentName;
		property.save((err, data) => {
			if (err) {
				return res.status(500).send(err);
			}
			res.status(200).send();
		});
	}));
});

router.get('/log/:fileName', AdminController.isAuthenticated, AdminController.isSuperAdmin, function(req, res){
	var filePath = "log/" + req.params.fileName;
	fs.readFile(filePath, (error, fileContent) => {
        if (error) {
            throw error;
        }
        res.send(fileContent);
	});
});


var RedirectModel = require('../models/redirect');

// GET /VLR-admin/redirects — Redirect Manager page
router.get('/redirects', AdminController.isAuthenticated, AdminController.isSuperAdmin, function(req, res) {
    res.render('adminRedirects.ejs');
});

// GET /VLR-admin/redirects/api/all — return all redirects as JSON
router.get('/redirects/api/all', AdminController.isAuthenticated, AdminController.isSuperAdmin, function(req, res) {
    RedirectModel.find({}).sort({ createdAt: -1 }).exec(function(err, docs) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: docs });
    });
});

// POST /VLR-admin/redirects — create a new redirect
router.post('/redirects', AdminController.isAuthenticated, AdminController.isSuperAdmin, function(req, res) {
    var from = (req.body.from || '').trim();
    var to   = (req.body.to   || '').trim();
    if (!from || !to) return res.status(400).json({ error: 'Both from and to are required.' });
    // Ensure leading slash on source
    if (from[0] !== '/') from = '/' + from;
    var rule = new RedirectModel({ from: from, to: to, active: true });
    rule.save(function(err, doc) {
        if (err) {
            if (err.code === 11000) return res.status(409).json({ error: 'A redirect for that source path already exists.' });
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ data: doc });
    });
});

// PUT /VLR-admin/redirects/:id/toggle — toggle active/inactive
router.put('/redirects/:id/toggle', AdminController.isAuthenticated, AdminController.isSuperAdmin, function(req, res) {
    RedirectModel.findById(req.params.id, function(err, doc) {
        if (err || !doc) return res.status(404).json({ error: 'Not found.' });
        doc.active = !doc.active;
        doc.save(function(err, updated) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ data: updated });
        });
    });
});

// DELETE /VLR-admin/redirects/:id — delete a redirect
router.delete('/redirects/:id', AdminController.isAuthenticated, AdminController.isSuperAdmin, function(req, res) {
    RedirectModel.findByIdAndRemove(req.params.id, function(err, doc) {
        if (err || !doc) return res.status(404).json({ error: 'Not found.' });
        res.json({ id: doc._id });
    });
});

router.use('/showRoom', require('./showRoom'));
router.use('/page-seo', require('./pageSeoAdmin'));

//make sure that we are closing the connection to mongo if something happens to node (like Ctrl + C)
process.on('SIGINT', function () {
	connect.connection.close(function () {
		process.exit(0);
	});
});

module.exports = router;