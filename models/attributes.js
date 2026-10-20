var mongoose = require('mongoose');

// 定义Schema
AttributeSchema = new mongoose.Schema({
    name: {type: String}
});

// 定义Model
var AttributeModel = mongoose.model('Attribute', AttributeSchema);

// 暴露接口
module.exports = AttributeModel;
