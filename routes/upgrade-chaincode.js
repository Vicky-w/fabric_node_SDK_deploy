/**
 * Created by vickywang on 7/10/18
 */



'use strict';

var util = require('util');
var initHandler = require('./init');
var path = require('path');
var fs = require('fs');
var logger = require('log4js').getLogger("upgrade - chaincode");
var Client = require('../base/fabric-client');
var sdkUtils = require('../base/fabric-client/lib/utils.js');

const getKeyFilesInDir = (dir) => {
    logger.info(dir)
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


function buildChaincodeProposal(client, chaincodeId, chaincode_path, version, type, upgrade, transientMap, msp_all) {
    logger.info(JSON.stringify(msp_all))
    let identitiesTmp = [];
    let policyTmp = [];
    let a = -1;
    for (var i = 0; i < msp_all.length; i++) {
        identitiesTmp.push({role: {name: 'admin', mspId: msp_all[i].id}});
        identitiesTmp.push({role: {name: 'member', mspId: msp_all[i].id}});
        a++;
        policyTmp.push({"signed-by": a})
        a++;
        policyTmp.push({"signed-by": a})
    }
    logger.info(JSON.stringify(identitiesTmp));
    logger.info(JSON.stringify(policyTmp));
    var request = {
        chaincodePath: chaincode_path,
        chaincodeId: chaincodeId,
        chaincodeVersion: version,
        fcn: 'init',
        txId: client.newTransactionID(),
        chaincodeType: type,
        'endorsement-policy': {
            identities: identitiesTmp,
            policy: {"1-of": policyTmp}
        }

    };
    return request;
}


var upgrade_chaincode = function (req, res) {


    var tx_id = null;
    var transientMap = null;
    var eventhubs = [];
    var the_user
    var channel = {};
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
        logger.info("*************************************** upgrade_chaincode start *************************************");
        console.log("Load privateKey and signedCert");
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
            return client.createUser(createUserOpt)
        })
    }).then((user) => {
        logger.info('Successfully enrolled user \'admin\' (e2eUtil 2)');
        the_user = user;
        channel = client.newChannel(config_channel);
        let odata = fs.readFileSync(userConfig[config_orderer].orderer_tls_cacerts);
        let caroots = Buffer.from(odata).toString();
        let orderer = client.newOrderer(userConfig[config_orderer].orderer_url, {
            'pem': caroots,
            'ssl-target-name-override': userConfig[config_orderer].orderer_hostname
        });
        channel.addOrderer(orderer);
        let peerData = fs.readFileSync(userConfig[config_peer].peer_tls_cacerts);
        let peer = client.newPeer(userConfig[config_peer].peer_url,
            {
                pem: Buffer.from(peerData).toString(),
                'ssl-target-name-override': userConfig[config_peer].server_hostname
            }
        );
        peer.setName(userConfig[config_peer].peerName);
        channel.addPeer(peer);
        targets.push(peer);
        console.log(' create new eventhub %s', userConfig[config_peer].event_url);

        let eh = client.newEventHub();
        eh.setPeerAddr(
            userConfig[config_peer].event_url,
            {
                pem: Buffer.from(peerData).toString(),
                'ssl-target-name-override': userConfig[config_peer].server_hostname
            }
        );
        eh.connect();
        eventhubs.push(eh);
        return channel.initialize();
    }, (err) => {
        logger.error('Failed to enroll user \'admin\'. ' + err);
        logger.info("*************************************** upgrade_chaincode end *************************************");
        response.sdkCode = "501";
        response.status = 'Failed to enroll user \'admin\'. ' + err;
        res.end(JSON.stringify(response));
        return false;
    }).then(() => {
        console.log(' orglist:: ', channel.getOrganizations());
        let request = buildChaincodeProposal(client, chaincodeId, chaincodePath, chaincodeVersion, chaincodeLanguage, false, transientMap, channel.getOrganizations());
        tx_id = request.txId;
        return channel.sendUpgradeProposal(request, 5 * 60 * 1000);
    }, (err) => {
        logger.error(util.format('Failed to initialize the channel. %s', err.stack ? err.stack : err));
        logger.info("*************************************** upgrade_chaincode end *************************************");
        response.sdkCode = "502";
        response.status = util.format('Failed to initialize the channel. %s', err.stack ? err.stack : err);
        res.end(JSON.stringify(response));
        return;
    }).then((results) => {
        var proposalResponses = results[0];
        var proposal = results[1];
        var all_good = true;
        for (var i in proposalResponses) {
            let one_good = false;
            if (proposalResponses && proposalResponses[i].response && proposalResponses[i].response.status === 200) {
                one_good = true;
                logger.info(chaincodeLanguage + ' proposal was good');
            } else {
                logger.error(chaincodeLanguage + ' proposal was bad');
            }
            all_good = all_good & one_good;
        }

        if (all_good) {
            logger.info('Successfully sent Proposal and received ProposalResponse');
            logger.debug(util.format('Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s', proposalResponses[0].response.status, proposalResponses[0].response.message, proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
            var request = {
                proposalResponses: proposalResponses,
                proposal: proposal
            };
            var deployId = tx_id.getTransactionID();

            var eventPromises = [];
            eventhubs.forEach((eh) => {
                let txPromise = new Promise((resolve, reject) => {
                    let handle = setTimeout(reject, 120000);
                    eh.registerTxEvent(deployId.toString(), (tx, code) => {
                        logger.info('The chaincode ' + chaincodeLanguage + ' transaction has been committed on peer ' + eh.getPeerAddr());
                        clearTimeout(handle);
                        eh.unregisterTxEvent(deployId);
                        if (code !== 'VALID') {
                            logger.error('The chaincode ' + chaincodeLanguage + ' transaction was invalid, code = ' + code);
                            eh.unregisterTxEvent(deployId);
                            reject();
                        } else {
                            logger.info('The chaincode ' + chaincodeLanguage + ' transaction was valid.');
                            eh.unregisterTxEvent(deployId);
                            resolve();
                        }
                    }, (err) => {
                        logger.error('There was a problem with the instantiate event ' + err);
                        clearTimeout(handle);
                        eh.unregisterTxEvent(deployId);
                    });
                });
                logger.debug('register eventhub %s with tx=%s', eh.getPeerAddr(), deployId);
                eventPromises.push(txPromise);
            });

            var sendPromise = channel.sendTransaction(request);
            return Promise.all([sendPromise].concat(eventPromises))
                .then((results) => {
                    logger.debug('Event promise all complete and testing complete');
                    return results[0]; // just first results are from orderer, the rest are from the peer events
                }).catch((err) => {
                    logger.error('Failed to send ' + chaincodeLanguage + ' transaction and get notifications within the timeout period.');
                    logger.info("*************************************** upgrade_chaincode end *************************************");
                    response.sdkCode = "503";
                    response.status = 'Failed to send ' + chaincodeLanguage + ' transaction and get notifications within the timeout period.';
                    res.end(JSON.stringify(response));
                    for (var key in eventhubs) {
                        var eventhub = eventhubs[key];
                        if (eventhub && eventhub.isconnected()) {
                            logger.info("eventhub connect")
                            eventhub.disconnect();
                            logger.info(" eventhub.disconnect")
                        } else {
                            logger.info("eventhub disconnect ...")
                        }
                    }
                    return;
                });
        } else {
            logger.error('Failed to send ' + chaincodeLanguage + ' Proposal or receive valid response. Response null or status is not 200. exiting...');
            response.sdkCode = "504";
            response.status = 'Failed to send ' + chaincodeLanguage + ' Proposal or receive valid response. Response null or status is not 200. exiting...';
            res.end(JSON.stringify(response));
            for (var key in eventhubs) {
                var eventhub = eventhubs[key];
                if (eventhub && eventhub.isconnected()) {
                    logger.info("eventhub connect")
                    eventhub.disconnect();
                    logger.info(" eventhub.disconnect")
                } else {
                    logger.info("eventhub disconnect ...")
                }
            }
            return;
        }
    }, (err) => {
        logger.error('Failed to send ' + chaincodeLanguage + ' proposal due to error: ' + err.stack ? err.stack : err);
        logger.info("*************************************** upgrade_chaincode end *************************************");
        response.sdkCode = "505";
        response.status = 'Failed to send ' + chaincodeLanguage + ' proposal due to error: ' + err.stack ? err.stack : err;
        res.end(JSON.stringify(response));
        for (var key in eventhubs) {
            var eventhub = eventhubs[key];
            if (eventhub && eventhub.isconnected()) {
                logger.info("eventhub connect")
                eventhub.disconnect();
                logger.info(" eventhub.disconnect")
            } else {
                logger.info("eventhub disconnect ...")
            }
        }
        return
    }).then((response) => {
        if (!(response instanceof Error) && response.status === 'SUCCESS') {
            logger.info('Successfully sent ' + chaincodeLanguage + 'transaction to the orderer.');
            for (var key in eventhubs) {
                var eventhub = eventhubs[key];
                if (eventhub && eventhub.isconnected()) {
                    logger.info("eventhub connect")
                    eventhub.disconnect();
                    logger.info(" eventhub.disconnect")
                } else {
                    logger.info("eventhub disconnect ...")
                }
            }
            logger.info("*************************************** upgrade_chaincode end *************************************");
            response.sdkCode = "200";
            response.status = 'Successfully sent ' + chaincodeLanguage + 'transaction to the orderer.';
            res.end(JSON.stringify(response));
            return;
        } else {
            logger.error('Failed to order the ' + chaincodeLanguage + 'transaction. Error code: ' + response.status);
            logger.info("*************************************** upgrade_chaincode end *************************************");
            response.sdkCode = "506";
            response.status = 'Failed to order the ' + chaincodeLanguage + 'transaction. Error code: ' + response.status;
            res.end(JSON.stringify(response));
            for (var key in eventhubs) {
                var eventhub = eventhubs[key];
                if (eventhub && eventhub.isconnected()) {
                    logger.info("eventhub connect")
                    eventhub.disconnect();
                    logger.info(" eventhub.disconnect")
                } else {
                    logger.info("eventhub disconnect ...")
                }
            }
            return
        }
    }, (err) => {
        logger.error('Failed to send ' + chaincodeLanguage + ' due to error: ' + err.stack ? err.stack : err);
        logger.info("*************************************** upgrade_chaincode end *************************************");
        response.sdkCode = "507";
        response.status = 'Failed to send ' + chaincodeLanguage + ' due to error: ' + err.stack ? err.stack : err;
        res.end(JSON.stringify(response));
        for (var key in eventhubs) {
            var eventhub = eventhubs[key];
            if (eventhub && eventhub.isconnected()) {
                logger.info("eventhub connect")
                eventhub.disconnect();
                logger.info(" eventhub.disconnect")
            } else {
                logger.info("eventhub disconnect ...")
            }
        }
        return
    });
}
module.exports = upgrade_chaincode;