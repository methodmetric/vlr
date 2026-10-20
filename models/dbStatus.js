var mongoose = require('mongoose');

// 定义Schema
dbStatusSchema = new mongoose.Schema({
    statusName: {type: String},
    statusValue: {type: String}
    //type: {type: String}
});

// 定义Model
var dbStatusModel = mongoose.model('dbStatus', dbStatusSchema);

// 暴露接口
module.exports = dbStatusModel;
