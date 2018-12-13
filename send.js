module.exports = function (callback) {
    web3.eth.sendTransaction(
        {from: web3.eth.accounts[8], to: "0xc2d3def72d894e65700747878fef8e843c342b30", value:web3.toWei(30, "ether")}, callback);
};

// 이렇게 script 로 작성한 후
// truffle console 에 붙어서 exec ./send.js 와 같이 실행시킬 수 있다. (메타 마스크로 보내자!)

// 참고로 가나슈를 실행할때마다 nonce 가 맞지 않을 수 있으므로 메타마스크에서는 reject 을 해주어야 한다. (물론 메타마스크에서 로컬 네트워크 연결도 해야함)

