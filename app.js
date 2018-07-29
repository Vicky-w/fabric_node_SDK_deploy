var createError = require('http-errors');
var express = require('express');
var initHandler = require('./routes/init');
var createChannelRouter = require('./routes/create-channel');
var joinChannelRouter = require('./routes/join-channel');
var installChaincodeRouter = require('./routes/install-chaincode');
var instantiateChaincodeRouter = require('./routes/instantiate-chaincode');
var upgradeChaincodeRouter = require('./routes/upgrade-chaincode');
var app = express();
var log4js = require('log4js');
var log = log4js.getLogger("app");
app.use(log4js.connectLogger(log4js.getLogger("http"), {level: 'auto'}));
app.use(express.json());
app.use(express.urlencoded({extended: false}));

app.all('*', function (req, res, next) {
    console.log("req==============  " + req.method);
    req.header("Content-Type", "application/json")
    res.header("Access-Control-Allow-Origin", "*");
    res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method == 'OPTIONS') {
        res.send(200);
    } else {
        next();
    }
});
app.post('/createChannel', createChannelRouter);
app.post('/joinChannel', joinChannelRouter);
app.post('/installChaincode', installChaincodeRouter);
app.post('/instantiateChaincode', instantiateChaincodeRouter);
app.post('/upgradeChaincode', upgradeChaincodeRouter);
app.use(function (req, res, next) {
    next(createError(404));
});
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        log.error("Something went wrong:", err);
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

app.use(function (err, req, res, next) {
    log.error("Something went wrong:", err);
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

process.on('uncaughtException', function (err) {
    log.error('Caught exception: ', err);
});

module.exports = app;
