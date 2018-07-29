/**
 * Created by vickywang on 7/10/18
 */



'use strict';

var util = require('util');
var initHandler = require('./init');
var path = require('path');
var fs = require('fs');
var logger = require('log4js').getLogger("join - channel");
var Client = require('../base/fabric-client');
var sdkUtils = require('../base/fabric-client/lib/utils.js');
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
var join_channel = function (req, res) {
    var tx_id = null;
    var channel = {};
    var genesis_block = {};
    var targets = [];
    var tempdir = path.join('../hfc');
    var client = new Client();
    var config_channel = req.body.channelName;
    var config_orderer = req.body.orderer;
    var config_peer = req.body.peer;
    var response = {};
    var userConfig = initHandler.userConfig
    Promise.resolve().then(() => {
        logger.info("*************************************** join_channel start *************************************");
        logger.info("Load privateKey and signedCert");
        return sdkUtils.newKeyValueStore({
            path: path.join(tempdir, 'hfc-test-kvs') + '_' + userConfig[config_peer].org
        }).then((store) => {
            client.setStateStore(store)
            var createUserOrdererOpt = {
                username: userConfig[config_orderer].orderer_user,
                mspid: userConfig[config_orderer].orderer_msp,
                cryptoContent: {
                    privateKey: getKeyFilesInDir(userConfig[config_orderer].orderer_privateKeyFolder)[0],
                    signedCert: userConfig[config_orderer].orderer_signedCert
                }
            }
            return client.createUser(createUserOrdererOpt)
        })
    }).then((userOrderer) => {
        logger.info('Successfully enrolled orderer \'admin\' (joined_channel 1)');
        channel = client.newChannel(config_channel);
        let odata = fs.readFileSync(userConfig[config_orderer].orderer_tls_cacerts);
        let caroots = Buffer.from(odata).toString();
        let orderer = client.newOrderer(userConfig[config_orderer].orderer_url, {
            'pem': caroots,
            'ssl-target-name-override': userConfig[config_orderer].orderer_hostname
        });
        channel.addOrderer(orderer);
        tx_id = client.newTransactionID();
        let request = {
            txId: tx_id
        };
        return channel.getGenesisBlock(request);
    }).then((block) => {
        logger.info('Successfully got the genesis block');
        genesis_block = block;
        client._userContext = null;
        var createUserOpt = {
            username: userConfig[config_peer].user_id,
            mspid: userConfig[config_peer].msp_id,
            cryptoContent: {
                privateKey: getKeyFilesInDir(userConfig[config_peer].privateKeyFolder)[0],
                signedCert: userConfig[config_peer].signedCert
            }
        }
        return client.createUser(createUserOpt)
    }).then((admin) => {
        logger.info('Successfully enrolled org (join_channel):' + userConfig[config_peer].user_id + ' \'admin\'');
        let data = fs.readFileSync(userConfig[config_peer].peer_tls_cacerts);
        let peer = client.newPeer(userConfig[config_peer].peer_url,
            {
                pem: Buffer.from(data).toString(),
                'ssl-target-name-override': userConfig[config_peer].server_hostname
            }
        );
        peer.setName(userConfig[config_peer].peerName);
        channel.addPeer(peer);
        targets.push(peer);
        tx_id = client.newTransactionID();
        let request = {
            targets: targets,
            block: genesis_block,
            txId: tx_id
        };

        return channel.joinChannel(request, 30000);
    }, (err) => {
        logger.error('Failed to enroll user \'admin\' due to error: ' + err.stack ? err.stack : err);
        response.sdkCode = "501";
        response.status = 'Failed to enroll user \'admin\' due to error: ' + err.stack ? err.stack : err;
        res.end(JSON.stringify(response));
        throw new Error('Failed to enroll user \'admin\' due to error: ' + err.stack ? err.stack : err);
        return
    })
        .then((results) => {
            logger.info(util.format('Join Channel R E S P O N S E : %j', results));

            if (results && results[0] && results[0].response && results[0].response.status == 200) {
                logger.info(util.format('Successfully joined peers in %s to join the channel', userConfig[config_peer].server_hostname));
                response.sdkCode = "200";
                response.status = util.format('Successfully joined peers in %s to join the channel', userConfig[config_peer].server_hostname);
                res.end(JSON.stringify(response));
                logger.info("*************************************** join_channel end *************************************");
                return
            } else {
                logger.error('Failed to join channel');
                response.sdkCode = "502";
                response.status = ' Failed to join channel';
                res.end(JSON.stringify(response));
                throw new Error('Failed to join channel');
                logger.info("*************************************** join_channel end *************************************");
                return
            }
        }, (err) => {
            logger.error('Failed to join channel due to error: ' + err.stack ? err.stack : err);
            response.sdkCode = "503";
            response.status = 'Failed to join channel due to error: ' + err.stack ? err.stack : err;
            res.end(JSON.stringify(response));
            logger.info("*************************************** join_channel end *************************************");
            return
        });
}
module.exports = join_channel;