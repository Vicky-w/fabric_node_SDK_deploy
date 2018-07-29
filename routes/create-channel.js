/**
 * Created by vickywang on 7/10/18
 */

'use strict';

var initHandler = require('./init');
var path = require('path');
var fs = require('fs');
var Client = require('../base/fabric-client');
var sdkUtils = require('../base/fabric-client/lib/utils.js');
var logger = require('log4js').getLogger("create - channel");

const getKeyFilesInDir = (dir) => {
    const files = fs.readdirSync(dir)
    const keyFiles = []
    files.forEach((file_name) => {
        let filePath = path.join(dir, file_name)
        if (file_name.endsWith('_sk')) {
            keyFiles.push(filePath)
        }
    })
    return keyFiles
}
var create_channel = function (req, res) {
    var channelConfig;
    var tempdir = path.join('../hfc');
    var client = new Client();
    var signatures = [];
    var channel_name = req.body.channelName;
    var config_orderer = req.body.orderer;
    var config_peer = req.body.peer;
    var response = {};
    var userConfig = initHandler.userConfig
    console.log(JSON.stringify(userConfig))
    Promise.resolve().then(() => {
        logger.info("*************************************** create_channel start *************************************");
        logger.info("Load privateKey and signedCert");
        var createUserOpt = {
            username: userConfig[config_peer].user_id,
            mspid: userConfig[config_peer].msp_id,
            cryptoContent: {
                privateKey: getKeyFilesInDir(userConfig[config_peer].privateKeyFolder)[0],
                signedCert: userConfig[config_peer].signedCert
            }
        }
        return sdkUtils.newKeyValueStore({
            path: path.join(tempdir, 'hfc-test-kvs') + '_' + userConfig[config_peer].org
        }).then((store) => {
            client.setStateStore(store)
            let envelope_bytes = fs.readFileSync(path.join(__dirname, '../config/channel-artifacts/channel.tx'));
            channelConfig = client.extractChannelConfig(envelope_bytes);
            logger.info('Successfull extracted the config update from the configtx envelope');
            return client.createUser(createUserOpt)
        })
    }).then((user) => {
        logger.info('Successfully enrolled user \'admin\' for org1');
        var signature = client.signChannelConfig(channelConfig);
        logger.info('channelConfig == ' + channelConfig.toString())
        var string_signature = signature.toBuffer().toString('hex');
        logger.info('Successfully signed config update');
        signatures.push(string_signature);
        let odata = fs.readFileSync(userConfig[config_orderer].orderer_tls_cacerts);
        let caroots = Buffer.from(odata).toString();
        let orderer = client.newOrderer(userConfig[config_orderer].orderer_url, {
            'pem': caroots,
            'ssl-target-name-override': userConfig[config_orderer].orderer_hostname
        });
        let tx_id = client.newTransactionID();
        var request = {
            config: channelConfig,
            signatures: signatures,
            name: channel_name,
            orderer: orderer,
            txId: tx_id
        };
        return client.createChannel(request);
    }).then((result) => {
        logger.info('\n***\n completed the create \n***\n');
        logger.info(' response ::%j', result);
        logger.info('Successfully created the channel.');
        if (result.status && result.status === 'SUCCESS') {
            response.sdkCode = "200";
            response.status = "SUCCESS";
            res.end(JSON.stringify(response));
            logger.info("*************************************** create_channel end *************************************");
            return;
        } else {
            logger.info('Failed to create the channel. ');
            response.sdkCode = "501";
            response.status = "Failed";
            res.end(JSON.stringify(response));
            logger.info("*************************************** create_channel end *************************************");
            throw new Error('Failed');
            return
        }
    }).then((nothing) => {
        logger.info('Successfully waited to make sure new channel was created.');
        response.sdkCode = "502";
        response.status = "Successfully waited to make sure new channel was created.";
        res.end(JSON.stringify(response));
        logger.info("*************************************** create_channel end *************************************");
        return
    }).catch((err) => {
        logger.error('Failed error: ' + err.stack ? err.stack : err);
        response.sdkCode = "503";
        response.status = 'Failed error: ' + err.stack ? err.stack : err;
        res.end(JSON.stringify(response));
        logger.error("*************************************** create_channel end *************************************");
        return
    });
}
module.exports = create_channel;