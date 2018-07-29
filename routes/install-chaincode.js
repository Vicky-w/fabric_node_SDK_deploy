/**
 * Created by vickywang on 7/10/18
 */


'use strict';
var util = require('util');
var initHandler = require('./init');
var path = require('path');
var fs = require('fs');
var logger = require('log4js').getLogger("install - chaincode");
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

var install_chaincode = function (req, res) {
    var channel = {};
    var the_user;
    var targets = [];
    var tempdir = path.join('../hfc');
    var client = new Client();
    var response = {};
    var userConfig = initHandler.userConfig

    var config_channel = req.body.channelName;
    var config_orderer = req.body.orderer;
    var config_peer = req.body.peer;
    var chaincodePath = req.body.chaincodePath;
    var chaincodeId = req.body.chaincodeId;
    var chaincodeLanguage = req.body.chaincodeLanguage;
    var chaincodeVersion = req.body.chaincodeVersion;


    Promise.resolve().then(() => {
        logger.info("*************************************** install_chaincode start *************************************");
        logger.info("Load privateKey and signedCert");
        return sdkUtils.newKeyValueStore({
            path: path.join(tempdir, 'hfc-test-kvs') + '_' + userConfig[config_peer].org
        }).then((store) => {
            client.setStateStore(store)
            var createUserOpt = {
                username: userConfig[config_peer].user_id,
                mspid: userConfig[config_peer].msp_id,
                cryptoContent: {
                    privateKey: getKeyFilesInDir(userConfig[config_peer].privateKeyFolder)[0],
                    signedCert: userConfig[config_peer].signedCert
                }
            }
            return client.createUser(createUserOpt)
        })
    }).then((userAdmin) => {
            logger.info('Successfully enrolled user \'admin\' (e2eUtil 1)');
            the_user = userAdmin;
            channel = client.newChannel(config_channel);
            let odata = fs.readFileSync(userConfig[config_orderer].orderer_tls_cacerts);
            let caroots = Buffer.from(odata).toString();
            let orderer = client.newOrderer(userConfig[config_orderer].orderer_url, {
                'pem': caroots,
                'ssl-target-name-override': userConfig[config_orderer].orderer_hostname
            });
            channel.addOrderer(orderer);
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
            var ChaincodeInstallRequest = {
                targets: targets,
                chaincodePath: chaincodePath,
                chaincodeId: chaincodeId,
                chaincodeType: chaincodeLanguage,
                chaincodeVersion: chaincodeVersion
            };

            return client.installChaincode(ChaincodeInstallRequest);
        },
        (err) => {
            logger.error('Failed to enroll user \'admin\'. ' + err);
            throw new Error('Failed to enroll user \'admin\'. ' + err);
            response.sdkCode = "501";
            response.status = 'Failed to enroll user \'admin\'. ' + err;
            res.end(JSON.stringify(response));
            logger.info("*************************************** install_chaincode end *************************************");
            return
        }).then((results) => {
            var proposalResponses = results[0];
            var all_good = true;
            var errors = [];
            for (var i in proposalResponses) {
                let one_good = false;
                if (proposalResponses && proposalResponses[i].response && proposalResponses[i].response.status === 200) {
                    one_good = true;
                    logger.info('install proposal was good');
                } else {
                    logger.error('install proposal was bad');
                    errors.push(proposalResponses[i]);
                }
                all_good = all_good & one_good;
            }
            if (all_good) {
                logger.info(util.format('Successfully sent install Proposal and received ProposalResponse: Status - %s', proposalResponses[0].response.status));
                response.sdkCode = "200";
                response.status = util.format('Successfully sent install Proposal and received ProposalResponse: Status - %s', proposalResponses[0].response.status);
                logger.info("*************************************** install_chaincode end *************************************");
                res.end(JSON.stringify(response));
                return
            } else {
                logger.info("*************************************** install_chaincode end *************************************");
                response.sdkCode = "502";
                response.status = util.format('Failed to send install Proposal or receive valid response: %s', errors);
                res.end(JSON.stringify(response));
                return
            }
        return
        },
        (err) => {
            logger.error('Failed to send install proposal due to error: ' + err.stack ? err.stack : err);
            response.sdkCode = "503";
            response.status = 'Failed to send install proposal due to error: ' + err.stack ? err.stack : err;
            res.end(JSON.stringify(response));
            logger.error("*************************************** install_chaincode end *************************************");
            return
        });
}
module.exports = install_chaincode;