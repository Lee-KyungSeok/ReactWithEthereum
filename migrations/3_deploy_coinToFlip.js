const CoinToFlip = artifacts.require("./CoinToFlip.sol");

module.exports = function(deployer) {
    deployer.deploy(CoinToFlip);
};