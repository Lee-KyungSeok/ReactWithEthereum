import React from "react";
import { Grid, Row, Col, Panel, Image, Alert } from 'react-bootstrap';
import {Button, ButtonGroup, ButtonToolbar} from 'react-bootstrap';
import {InputGroup, FormControl, Radio, ListGroup, ListGroupItem} from 'react-bootstrap';
import Glyphicon from 'react-bootstrap/lib/Glyphicon';

import './css/bootstrap.min.css';
import './css/style.css';

import getWeb3 from "./utils/getWeb3";
import truffleContract from 'truffle-contract';
import CoinToFlip from "./contracts/CoinToFlip";

class CoinFlip extends React.Component{

    state = {
        web3: null,
        accounts: null,
        contract: null,

        houseBalance: 0,
        show: false,
        value: 0, //wager
        checked: 0, //coin
        reveal: 0,
        reward: 0,
        txList: []
    };


    constructor(props) {
        super(props);

        this.handleClickCoin = this.handleClickCoin.bind(this);
        this.handleClickBet = this.handleClickBet.bind(this);
        this.handleClickFlip = this.handleClickFlip.bind(this);
        this.handleClickReset = this.handleClickReset.bind(this);
        this.handleValChange = this.handleValChange.bind(this);
        this.handleRefund = this.handleRefund.bind(this);
    }

    handleClickCoin(e) {
        if(this.state.checked === 0 ) {
            if(e.target.id === "Heads") {
                this.setState({ checked: 2 });
            } else if(e.target.id === "Tails") {
                this.setState({ checked: 1 });
            }
        } else {
            this.setState({checked:0});
        }
    }

    async handleClickBet() {
        const {web3, accounts, contract} = this.state;

        // web3 가 inject 되지 않은 경우
        if(!this.state.web3) {
            console.log('App is not ready');
            return;
        }

        // metamask accounts 가 없는 경우
        if(accounts[0] === undefined) {
            alert('Please press F5 to connect Dapp');
            return;
        }

        if(this.state.value <= 0 || this.state.checked === 0) {
            this.setState({show: true});
        } else {
            let nonce = await web3.eth.getTransactionCount(accounts[0])

            console.log(nonce);

            await contract.placeBet(this.state.checked, {
                from: accounts[0],
                nonce,
                value: web3.utils.toWei(String(this.state.value), 'ether')
            });

            this.setState({
                show: false,
                reveal: 0,
                reward: 0
            });
        }
    }

    async handleClickFlip() {
        const {accounts, contract} = this.state;

        if (!this.state.web3) {
            console.log('App is not ready');
            return;
        }

        if (accounts[0] === undefined) {
            alert('Please press F5 to connect Dapp');
            return;
        }

        let seed = Math.floor((Math.random() * 255) + 1);

        await contract.revealResult(seed, {from: accounts[0]})
    }

    handleClickReset() {
        this.setState({value: 0, checked: 0, reveal: 0, reward: 0});

        this.getHouseBalance();
        this.resetTxList();
        this.input.value = '';
    }

    handleValChange(e) {
        this.setState({value: parseFloat(e.target.value)})
    }

    async handleRefund() {
        const {accounts, contract} = this.state;


        // =======중복로직?? 빼는게??
        if (!this.state.web3) {
            console.log('App is not ready');
            return;
        }

        if (accounts[0] === undefined) {
            alert('Please press F5 to connect Dapp');
            return;
        }
        //============

        await contract.refundBet({from:accounts[0]});
    }

    getHouseBalance = () => {
        const {web3, contract} = this.state;

        web3.eth.getBalance(contract.address, (error, result) => {
            console.log(result);
            this.setState({houseBalance: web3.utils.fromWei(result, 'ether')});
        })
    }

    resetTxList = () => {
        this.setState({txList: []}, this.getReceiptList);
    }

    // 복잡!!
    getReceiptList = async () => {
        const { web3, accounts, contract } = this.state;
        const lowerLimit = 50;

        let result = [];

        let blockNumber = await web3.eth.getBlockNumber();

        let upperBlockNumber = blockNumber;
        let lowerBlockNumber = (parseInt(upperBlockNumber, 10)-lowerLimit < 0) ? 0 : upperBlockNumber-lowerLimit;

        for (let i=upperBlockNumber; i> lowerBlockNumber; i--) {
            let block = await web3.eth.getBlock(i, false);

            if (block.transactions.length > 0) {
                block.transactions.forEach(async (txHash) => {

                    let tx = await web3.eth.getTransaction(txHash.toString());

                    //0xe65edCe2b80A43cD52C2B8B6422BF5055D5fC09B -- checksum OK in web3
                    //0xe65edce2b80a43cd52c2b8b6422bf5055d5fc09b -- in truffle-contract.js
                    if(tx != null && tx.from === accounts[0] && tx.to.toLowerCase() === contract.address.toLowerCase()) {
                        await web3.eth.getTransactionReceipt(tx.hash, (e, r) => {
                            if (r.logs.length === 2) {
                                result.push({"txhash": r.transactionHash,
                                    "value": web3.utils.fromWei(web3.utils.toBN(r.logs[1].data).toString(), "ether")});
                            } else if (r.logs.length === 1) {
                                result.push({"txhash": r.transactionHash, "value": 0});
                            }
                        })
                    }
                })
            }
        }

        this.setState({
            txList: result.splice(0,5)
        });
    }

    watchEvent = (error, result) => {
        if(!error) {
            const { web3 } = this.state;

            this.setState({
                reveal: web3.utils.toDecimal(result.args.reveal),
                txList: []
            }, this.getReceiptList);
        } else {
            console.log(error);
        }
    }

    watchPaymentEvent = (error, result) => {
        if(!error) {
            const { web3 } = this.state;

            let r = web3.utils.fromWei(web3.utils.toBN(result.args.amount).toString(), 'ether');
            if(r > 0 ) {
                this.setState({reward: r});
            }
        } else {
            console.log(error);
        }
    }

    componentDidMount = async () => {
        try {
            // web3 instance 를 가져온다.
            const web3 = await getWeb3();

            // user 의 account 를 가져온다.
            const accounts = await web3.eth.getAccounts();

            // contract instance 를 가져옴
            const Contract = truffleContract(CoinToFlip);
            Contract.setProvider(web3.currentProvider);
            const instance = await Contract.deployed();

            // event 를 watch 한다. 그 후 결과를 던져줄 수 있다.
            await instance.Reveal().watch((error, result) => this.watchEvent(error,result));
            await instance.Payment().watch((error, result) => this.watchPaymentEvent(error,result));

            this.setState({
                web3, accounts,
                contract: instance
            }, this.getHouseBalance);


        } catch (error) {
            alert(
                'Failed to load web3, accounts, or contract. Check console for details.'
            );
            console.log(error);
        }
    }

    render() {

        let coin_h = "/images/coin-h-i.png";
        let coin_t = "/images/coin-t-i.png";

        if (this.state.checked === 2) {
            coin_h = "/images/coin-h.png";
            coin_t = "/images/coin-t-i.png";
        } else if (this.state.checked === 1) {
            coin_h = "/images/coin-h-i.png";
            coin_t = "/images/coin-t.png";
        }

        let coin = <div>
            <Image src={coin_h} id="Heads" onClick={this.handleClickCoin} className="img-coin" />
            <Image src={coin_t} id="Tails" onClick={this.handleClickCoin} className="img-coin" />
        </div>

        return (
            <Grid fluid={true}>
                <Row>
                    <Col md={5}>

                        <Panel bsStyle="info">
                            <Panel.Heading>
                                <Panel.Title>
                                    <Glyphicon glyph="thumbs-up" /> House: {this.state.houseBalance} ETH
                                </Panel.Title>
                            </Panel.Heading>
                            <Panel.Body className="custom-align-center">
                                {coin}
                            </Panel.Body>
                        </Panel>
                    </Col>
                    <Col md={5}>
                        <Reveal reveal={this.state.reveal} reward={this.state.reward} />
                    </Col>
                </Row>

                <Row>
                    <Col md={5}>
                        <Panel bsStyle="info">
                            <Panel.Heading>
                                <Panel.Title>
                                    <Glyphicon glyph="ok-circle" /> Your Bet
                                </Panel.Title>
                            </Panel.Heading>
                            <Panel.Body className="custom-align-center">

                                <form>
                                    <InputGroup style={{paddingBottom:'10px'}}>
                                        <Radio name="coinRadioGroup" checked={this.state.checked === 2} inline disabled>
                                            Heads
                                        </Radio>{' '}
                                        <Radio name="coinRadioGroup" checked={this.state.checked === 1} inline disabled>
                                            Tails
                                        </Radio>
                                    </InputGroup>
                                    <InputGroup style={{paddingBottom:'10px'}}>
                                        <InputGroup.Addon>ETH</InputGroup.Addon>
                                        <FormControl type="number" placeholder="Enter number" bsSize="lg" onChange={this.handleValChange} inputRef={ref=>{this.input=ref;}}/>
                                    </InputGroup>
                                    <AlertMsg flag={this.state.show}/>
                                </form>

                                <ButtonToolbar>
                                    <ButtonGroup justified>
                                        <Button href="#" bsStyle="primary" bsSize="large" onClick={this.handleClickBet}>
                                            Bet
                                        </Button>
                                        <Button href="#" bsStyle="success" bsSize="large" onClick={this.handleClickFlip}>
                                            Flip!
                                        </Button>
                                        <Button href="#" bsSize="large" onClick={this.handleRefund}>
                                            Cancel
                                        </Button>
                                        <Button href="#" bsStyle="info" bsSize="large" onClick={this.handleClickReset}>
                                            Reset
                                        </Button>
                                    </ButtonGroup>
                                </ButtonToolbar>

                            </Panel.Body>
                        </Panel>
                    </Col>
                    <Col md={5}>
                        <Panel bsStyle="info">
                            <Panel.Heading>
                                <Panel.Title>
                                    <Glyphicon glyph="signal" /> Transactions - 5 transactions in the last 50 blocks
                                </Panel.Title>
                            </Panel.Heading>
                            <Panel.Body>
                                <TxList result={this.state.txList}/>
                            </Panel.Body>
                        </Panel>
                    </Col>
                </Row>
            </Grid>
        )
    }
}

//functional component
function AlertMsg(props) {

    if (props.flag) {
        return (
            <Alert bsStyle="danger">
                <strong>You should flip the coin and bet bigger than 0.01 ETH</strong>
            </Alert>
        )
    }
    return <br/>
}

//functional component
function Reveal(props) {

    let coinImg = "/images/coin-unknown.png";
    if (props.reveal === 2) {
        coinImg =  "/images/coin-h.png";
    } else if (props.reveal === 1) {
        coinImg = "/images/coin-t.png";
    }

    let coin = <Image src={coinImg} className="img-coin" />

    return (
        <Panel bsStyle="info">
            <Panel.Heading>
                <Panel.Title>
                    <Glyphicon glyph="adjust"/> Coin Reveal
                </Panel.Title>
            </Panel.Heading>
            <Panel.Body className="custom-align-center">
                {coin}
                {props.reward} ETH
            </Panel.Body>
        </Panel>
    );
}

//functional component
function TxList(props) {

    let result = props.result;
    let txList = result.map (
        e => (<ListGroupItem key={e.txhash} bsStyle={e.value>0?"success":"danger"}>{e.txhash} (<b>{e.value}</b> ETH)</ListGroupItem>)
    );

    return (
        <ListGroup>
            {txList}
        </ListGroup>
    );
}

export default CoinFlip;