/**
 * Created by vickywang on 6/5/18
 */
var path = require('path');
var fs = require('fs');
var tempdir = path.join('./hfc');
var logger = require('log4js').getLogger("init - Blockchain");

var userConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../config', 'user-config.json')));
var init_handler = {};

Promise.resolve().then(() => {
    init_handler.userConfig = userConfig;
    logger.info("************************************************************");
    logger.info("********init*******tempdir=========== " + tempdir + "  **********");
    logger.info("********init*******userConfig*******************************");
    logger.info("************************************************************");
    return;
})


module.exports = init_handler;
