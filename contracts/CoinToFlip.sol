pragma solidity ^0.4.24;

contract CoinToFlip {

    uint constant MAX_CASE = 2; // for coin
    uint constant MIN_BET = 0.01 ether;
    uint constant MAX_BET = 10 ether;
    uint constant HOUSE_FEE_PERCENT = 5;
    uint constant HOUSE_MIN_FEE = 0.005 ether;

    address public owner;
    uint public lockedInBets; // 베팅한 금액 (아직 결과가 나오지 않은 금액)

    struct Bet {
        uint amount;
        uint8 numOfBetBit;
        uint placeBlockNumber; // Block number of Bet tx.
        // Bit mask representing winning bet outcomes
        // 0000 0010 for front side of coin, 50% chance
        // 0000 0001 for back side of coin, 50% chance
        // 0000 0011 for both sides,  100% chance - no reward!
        uint8 mask;
        address gambler; // Address of a gambler, used to pay out winning bets.
    }

    mapping(address => Bet) bets;

    event Reveal(uint reveal); // 1 or 2 전달됨
    event Payment(address indexed beneficiary, uint amount);
    event FailedPayment(address indexed beneficiary, uint amount);

    constructor() public {
        owner = msg.sender;
    }

    modifier onlyOwner {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    // 컨트랙트에서 ether 를 인출
    function withdrawFunds(address beneficiary, uint withdrawAmount) external onlyOwner {
        require (withdrawAmount + lockedInBets <= address(this).balance, "larger than balance.");
        sendFunds(beneficiary, withdrawAmount);
    }

    // funds 를 전송함
    function sendFunds(address beneficiary, uint amount) private {
        if(beneficiary.send(amount)) { // 조심!!
            emit Payment(beneficiary, amount);
        } else {
            emit FailedPayment(beneficiary, amount);
        }
    }

    function kill() external onlyOwner {
        require(lockedInBets == 0, "All bets should be processed before self-destruct");
        selfdestruct(owner);
    }

    function() public payable {}

    // Bet by player (betMask 는 동전의 어느면에 베팅했는지를 의미 (앞 or 뒤)
    function placeBet(uint8 betMask) external payable {

        uint amount = msg.value;

        require(amount >= MIN_BET && amount <= MAX_BET, "Amount is out of range.");
        require(betMask > 0 && betMask < 256, "Mask should be 8 bit");

        Bet storage bet = bets[msg.sender];

        // 베팅종료 후 초기화되는데 초기화 되어 있는지를 확인한다.
        require(bet.gambler == address(0), "Bet should be empty state");

        uint8 numOfBetBit = countBits(betMask);

        bet.amount = amount;
        bet.numOfBetBit = numOfBetBit;
        bet.placeBlockNumber = block.number;
        bet.mask = betMask;
        bet.gambler = msg.sender;

        // need to lock possible winning amount to pay
        uint possibleWinningAmount = getWinningAmount(amount, numOfBetBit);
        lockedInBets += possibleWinningAmount;

        // check whether house has enough ETH to pay the bet.
        // 상금이 lock 보다 작아야만 베팅할 수 있도록 설정해야 한다.
        require(lockedInBets < address(this).balance, "Cannot afford to pay the bet.");
    }

    function getWinningAmount(uint amount, uint8 numOfBetBit) private pure returns (uint winningAmount) {
        require(0 < numOfBetBit && numOfBetBit < MAX_CASE, "Probability is out of range");

        uint houseFee = amount * HOUSE_FEE_PERCENT / 100;

        if(houseFee < HOUSE_MIN_FEE) {
            houseFee = HOUSE_MIN_FEE;
        }

        // reward calculation is depends on your own idea
        uint reward = amount / (MAX_CASE + (numOfBetBit-1));

        winningAmount = (amount - houseFee) + reward;
    }

    // 동전 던지기 결과 메서드
    function revealResult(uint8 seed) external {

        Bet storage bet = bets[msg.sender];
        uint amount = bet.amount;
        uint8 numOfBetBit = bet.numOfBetBit;
        uint placeBlockNumber = bet.placeBlockNumber;
        address gambler = bet.gambler;

        require(amount > 0, "Bet should be in an 'active' state" );

        // 먼저 블록에 기록되어 있어야만 한다.
        require(block.number > placeBlockNumber, "revealResult in the same block as placeBet, or before.");

        // Random Number Generator
        bytes32 random = keccak256(abi.encodePacked(blockhash(block.number-seed), blockhash(placeBlockNumber)));

        uint reveal = uint(random) % MAX_CASE;

        uint winningAmount = 0;
        uint possibleWinningAmount = 0;
        possibleWinningAmount = getWinningAmount(amount, numOfBetBit);

        if((2 ** reveal) & bet.mask != 0) {
            winningAmount = possibleWinningAmount;
        }

        emit Reveal(2 ** reveal);

        if(winningAmount >0) {
            sendFunds(gambler, winningAmount);
        }

        lockedInBets -= possibleWinningAmount;
        clearBet(msg.sender);
    }

    function clearBet(address player) private {
        Bet storage bet = bets[player];

        bet.amount = 0;
        bet.numOfBetBit = 0;
        bet.placeBlockNumber = 0;
        bet.mask = 0;
        bet.gambler = address(0); // NULL
    }

    // 결과를 보지 않고 환불하고 싶은 경우
    function refundBet() external {
        require(block.number > bet.placeBlockNumber, "refundBet in the same block as placeBet, or before.");

        Bet storage bet = bets[msg.sender];
        uint amount = bet.amount;

        require (amount > 0, "Bet should be in an 'active' state");

        uint8 numOfBetBit = bet.numOfBetBit;

        // Send the refund.
        sendFunds(bet.gambler, amount);

        uint possibleWinningAmount;
        possibleWinningAmount = getWinningAmount(amount, numOfBetBit);

        lockedInBets -= possibleWinningAmount;
        clearBet(msg.sender);
    }

    function checkHouseFund() public view onlyOwner returns(uint) {
        return address(this).balance;
    }

    function countBits(uint8 _num) internal pure returns (uint8) {
        uint8 count;
        while(_num >0) {
            count += _num & 1;
            _num >>= 1;
        }
        return count;
    }
}
