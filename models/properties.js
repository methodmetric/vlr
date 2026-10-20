var mongoose = require('mongoose');

// 定义Schema
PropertySchema = new mongoose.Schema({
    propertyId: { type: Number, unique: true },
    agent: {type: String},
    address: { type: String },
    city: { type: String },
    province: { type: String },
    postalCode: { type: String },
    country: { type: String },
    neighborhoodName: { type: String },
    buildingName: {type: String },
    typeOfProperty: {type: String },
    yearBuilt: { type: String},
    createdAt: { type: Date, default: Date.now },
    availableDate: {type: Date},
    status: {type: String},
    bedrooms: {type: String},
    bathrooms: {type: String},
    den: {type: Boolean},
    flexOrStorage: {type: Boolean},
    mountainView: {type: Boolean},
    waterView: {type: Boolean},
    cityView: {type: Boolean},
    squareFeet: {type: Number},
    lotSquareFootage: {type: String},
    furnished: {type: String},
    rent: {type: Number},
    allowPets: {type: String},
    smoking: {type: Boolean},
    minLeaseTerm: {type: String},
    maxLeaseTerm: {type: String},
    name: {type: String},
    details: {type: String},
    storageOrLocker: {type: Boolean},
    numberOfParking: {type: String},
    garage: {type: Boolean},
    carport: {type: Boolean},
    streetParking: {type: Boolean},
    drivewayParking: {type: Boolean},
    visitorParking: {type: Boolean},
    bikeStorage: {type: Boolean},
    Heat: {type: Boolean},
    water: {type: Boolean},
    garbageCollection: {type: Boolean},
    gasFireplace: {type: Boolean},
    electricFireplace: {type: Boolean},
    woodburnFireplace: {type: Boolean},
    ac: {type: Boolean},
    inSuiteWasherDryer: {type: Boolean},
    sharedLaundry: {type: Boolean},
    refrigerator: {type: Boolean},
    windowCoverings: {type: Boolean},
    gasStove: {type: Boolean},
    electricStove: {type: Boolean},
    dishwasher: {type: Boolean},
    microwave: {type: Boolean},
    oven: {type: Boolean},
    wineCooler: {type: Boolean},
    builtinCoffeeMachine: {type: Boolean},
    pantry: {type: Boolean},
    kitchenIsland: {type: Boolean},
    carpets: {type: Boolean},
    woodFloor: {type: Boolean},
    tileFloor: {type: Boolean},
    balcony: {type: Boolean},
    rooftopDeck: {type: Boolean},
    patio: {type: Boolean},
    privateYard: {type: Boolean},
    allDayConcierge: {type: Boolean},
    onSiteManager: {type: Boolean},
    swimmingPool: {type: Boolean},
    gym: {type: Boolean},
    yogaStudio: {type: Boolean},
    sauna: {type: Boolean},
    steamRoom: {type: Boolean},
    hotTub: {type: Boolean},
    amenityRoom: {type: Boolean},
    meetingRoom: {type: Boolean},
    hotWater: {type: Boolean},
    electricity: {type: Boolean},
    gas: {type: Boolean},
    basicInternetPackage: {type: Boolean},
    basicCablePackage: {type: Boolean},
    ensuiteStorage: {type: Boolean},
    walkinStorage: {type: Boolean},
    radiantFloorHeat: {type: Boolean},
    additionalNote: {type: String},
    geoLat: {type: String},
    geoLng: {type: String},
    coverImg: {type: String},
    imgs: [{type: String}],
    forwarded: {type: Boolean},
    searchColumn: {type: String},
    vrurl: { type: String },
    propertyStatus: { type: String },
    // SEO overrides (all optional — blank means use auto-generated values)
    seoTitle: { type: String },
    seoDescription: { type: String },
    seoRobots: { type: String, default: 'index' },
    seoCanonical: { type: String }
});

// on every save, add the date
PropertySchema.pre('save', function(next) {
	// get the current date
	var currentDate = new Date();

	// if created_at doesn't exist, add to that field
	if (!this.createdAt)
		this.createdAt = currentDate;

	next();
});

PropertySchema.index({propertyId: 1, created_at: 1});

// 定义Model
var PropertyModel = mongoose.model('Property', PropertySchema);

// 暴露接口
module.exports = PropertyModel;
